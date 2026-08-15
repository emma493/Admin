/**
 * Advanced Universal Video Scraper & Stream Extractor
 * Supports server-side proxying and in-browser multi-tier scraping fallback
 * with specialized extractors for xxxfollow.com and generic HTML5/HLS video streaming platforms.
 */

export interface ExtractVideoResult {
  success: boolean;
  source_webpage: string;
  direct_url?: string;
  error?: string;
}

/**
 * Main Scraper Entry Point:
 * Attempts backend extraction API, and automatically falls back to in-browser multi-proxy
 * scraping if backend returns 404 or is unavailable (e.g., when hosted on Netlify or static CDNs).
 */
export async function extractVideoFromWebpage(pageUrls: string[]): Promise<ExtractVideoResult[]> {
  const cleanUrls = pageUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  if (cleanUrls.length === 0) return [];

  // Attempt backend API first
  try {
    const response = await fetch('/api/extract-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls: cleanUrls }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        // If server successfully processed, check if any failed and can be retried on client
        const finalResults: ExtractVideoResult[] = [];
        for (const item of data.results) {
          if (item.success && item.direct_url) {
            finalResults.push(item);
          } else {
            // Server couldn't extract - attempt client-side fallback
            const clientFallback = await clientSideScrapeVideo(item.source_webpage);
            finalResults.push(clientFallback);
          }
        }
        return finalResults;
      }
    }
  } catch (err) {
    console.warn('Backend /api/extract-video not reachable, engaging client-side fallback engine:', err);
  }

  // Client-Side Multi-Tier Scraping Fallback (handles Netlify / static deployments)
  const results: ExtractVideoResult[] = [];
  for (const url of cleanUrls) {
    const res = await clientSideScrapeVideo(url);
    results.push(res);
  }

  return results;
}

/**
 * In-browser client-side video extractor using multi-proxy fallback and deep HTML inspection
 */
export async function clientSideScrapeVideo(rawUrl: string): Promise<ExtractVideoResult> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // 1. If already a direct media URL (.mp4, .m3u8, etc.)
  if (isDirectVideoUrl(url)) {
    return {
      success: true,
      source_webpage: rawUrl,
      direct_url: url,
    };
  }

  // 2. Specialized handler for xxxfollow.com
  if (url.includes('xxxfollow.com')) {
    const xxxfollowResult = await extractXxxfollowClient(url);
    if (xxxfollowResult.success) {
      return xxxfollowResult;
    }
  }

  // 3. Generic client-side HTML fetch using CORS proxies
  const corsProxies = [
    (target: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    (target: string) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    (target: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  ];

  let htmlContent = '';
  for (const proxyGen of corsProxies) {
    try {
      const proxyUrl = proxyGen(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const resp = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 200) {
          htmlContent = text;
          break;
        }
      }
    } catch (e) {
      // Try next proxy
    }
  }

  if (htmlContent) {
    const streamUrl = findVideoUrlInHtml(htmlContent, url);
    if (streamUrl) {
      return {
        success: true,
        source_webpage: rawUrl,
        direct_url: streamUrl,
      };
    }
  }

  return {
    success: false,
    source_webpage: rawUrl,
    error: 'Could not extract raw video stream (.mp4/.m3u8) from webpage. Check if link is valid.',
  };
}

/**
 * Specialized extractor for xxxfollow.com links
 */
async function extractXxxfollowClient(pageUrl: string): Promise<ExtractVideoResult> {
  const corsProxies = [
    (target: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    (target: string) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    (target: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  ];

  for (const proxyGen of corsProxies) {
    try {
      const proxyUrl = proxyGen(pageUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!resp.ok) continue;
      const html = await resp.text();
      if (!html) continue;

      const direct = parseXxxfollowHtml(html, pageUrl);
      if (direct) {
        return {
          success: true,
          source_webpage: pageUrl,
          direct_url: direct,
        };
      }
    } catch (e) {
      // Continue to next proxy
    }
  }

  return {
    success: false,
    source_webpage: pageUrl,
    error: 'Failed to extract video stream from xxxfollow page.',
  };
}

/**
 * Deep parser for xxxfollow HTML pages to extract direct CDN video streams (.mp4)
 */
export function parseXxxfollowHtml(html: string, pageUrl: string): string | null {
  try {
    // A. Search for window.__PRELOAD_STATE__ or post metadata
    const preloadMatch = html.match(/window\.__PRELOAD_STATE__\s*=\s*(\{[\s\S]*?\n\s*\}\s*<\/script>|\{[\s\S]*?\});/);
    if (preloadMatch) {
      const rawJson = preloadMatch[1].replace(/<\/script>$/, '').trim();
      try {
        const data = JSON.parse(rawJson);
        for (const key of Object.keys(data)) {
          if (key.startsWith('post-') || key === 'post') {
            const postObj = data[key]?.post || data[key];
            if (postObj?.media && Array.isArray(postObj.media)) {
              for (const m of postObj.media) {
                // Check direct fhd / sd / uhd / url fields
                if (m.fhd_url && isDirectVideoUrl(m.fhd_url)) return m.fhd_url;
                if (m.sd_url && isDirectVideoUrl(m.sd_url)) return m.sd_url;
                if (m.url && isDirectVideoUrl(m.url)) return m.url;
                if (m.uhd_url && isDirectVideoUrl(m.uhd_url)) return m.uhd_url;

                // Extract blur_url / thumb_url and transform to mp4 CDN video file
                const imgUrl = m.blur_url || m.thumb_url || m.start_url;
                if (imgUrl && typeof imgUrl === 'string') {
                  const baseMp4 = imgUrl.replace(/_(?:blur|start|thumb)\.(?:jpg|webp|jpeg)$/i, '.mp4');
                  if (isDirectVideoUrl(baseMp4)) {
                    return baseMp4;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // Fallback to regex parsing below
      }
    }

    // B. Regex search for xxxfollow media CDN patterns
    // Example: https://www.xxxfollow.com/media/fans/post_public/4576/45764082/1739901_blur.jpg -> .mp4
    const mediaImgMatches = html.matchAll(
      /https?:\/\/[^\s"'<>]+\/media\/fans\/post_public\/[0-9]+\/[0-9]+\/([0-9]+)_(?:blur|start|thumb)\.(?:jpg|webp|jpeg)/gi
    );
    for (const match of mediaImgMatches) {
      if (match[0]) {
        const directMp4 = match[0].replace(/_(?:blur|start|thumb)\.(?:jpg|webp|jpeg)$/i, '.mp4');
        return directMp4;
      }
    }

    // C. Search for direct mp4 with media/fans/post_public
    const directMp4Match = html.match(/https?:\/\/[^\s"'<>]+\/media\/fans\/post_public\/[0-9]+\/[0-9]+\/[0-9]+(?:\_sd|\_hd)?\.mp4/gi);
    if (directMp4Match && directMp4Match[0]) {
      return directMp4Match[0];
    }
  } catch (e) {
    console.error('Error parsing xxxfollow HTML:', e);
  }

  // Fallback to generic extractor
  return findVideoUrlInHtml(html, pageUrl);
}

/**
 * Universal video finder in arbitrary HTML code
 */
export function findVideoUrlInHtml(html: string, baseUrl: string): string | null {
  if (!html) return null;
  const candidates: string[] = [];

  // 1. <video src="..."> and <source src="...">
  const sourceMatches = html.matchAll(/<(?:source|video)[^>]+src=["']([^"']+)["']/gi);
  for (const m of sourceMatches) {
    if (m[1]) candidates.push(m[1]);
  }

  // 2. data-src, data-video, data-stream, data-url, data-mp4
  const dataMatches = html.matchAll(/(?:data-src|data-video|data-stream|data-url|data-mp4|data-hls)=["']([^"']+)["']/gi);
  for (const m of dataMatches) {
    if (m[1]) candidates.push(m[1]);
  }

  // 3. OpenGraph and Twitter Meta Tags
  const metaMatches = html.matchAll(
    /<meta[^>]+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/gi
  );
  for (const m of metaMatches) {
    if (m[1]) candidates.push(m[1]);
  }

  // 4. JSON-LD and JSON keys (contentUrl, embedUrl, videoUrl, file)
  const jsonMatches = html.matchAll(/["'](?:contentUrl|videoUrl|streamUrl|fileUrl|video_url|stream_url|file|hls)["']\s*:\s*["']([^"']+)["']/gi);
  for (const m of jsonMatches) {
    if (m[1]) candidates.push(m[1]);
  }

  // 5. Direct regex for .mp4, .m3u8, .webm
  const directRegex = /https?:\/\/[^\s"'<>\\}]+\.(?:mp4|m3u8|mpd|webm|mov)(?:\?[^\s"'<>\\}]*)?/gi;
  const regexMatches = html.matchAll(directRegex);
  for (const m of regexMatches) {
    if (m[0]) candidates.push(m[0]);
  }

  // Filter and prioritize
  for (const rawCandidate of candidates) {
    let cleanCandidate = rawCandidate.replace(/\\/g, '');
    if (cleanCandidate.startsWith('//')) {
      cleanCandidate = 'https:' + cleanCandidate;
    } else if (cleanCandidate.startsWith('/')) {
      try {
        cleanCandidate = new URL(cleanCandidate, baseUrl).href;
      } catch (e) {
        continue;
      }
    }

    if (!/^https?:\/\//i.test(cleanCandidate)) continue;

    const lower = cleanCandidate.toLowerCase();
    // Skip static assets
    if (
      lower.includes('.jpg') ||
      lower.includes('.png') ||
      lower.includes('.gif') ||
      lower.includes('.jpeg') ||
      lower.includes('.svg') ||
      lower.includes('.css') ||
      lower.includes('.js') ||
      lower.includes('.ico')
    ) {
      continue;
    }

    if (
      lower.includes('.mp4') ||
      lower.includes('.m3u8') ||
      lower.includes('.webm') ||
      lower.includes('.mpd') ||
      lower.includes('master.m3u8') ||
      lower.includes('index.m3u8')
    ) {
      return cleanCandidate;
    }
  }

  return null;
}

export function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  return (
    clean.endsWith('.mp4') ||
    clean.endsWith('.m3u8') ||
    clean.endsWith('.mpd') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.mov') ||
    clean.endsWith('.flv') ||
    clean.endsWith('.ts')
  );
}
