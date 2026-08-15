/**
 * CORS-Safe Universal Video Scraper & Stream Extractor Engine
 * Replicates yt-dlp's frontend extraction logic:
 * 1. High-Availability CORS Proxy Rotation Engine:
 *    - Proxy 1: https://api.allorigins.win/raw?url=${encodeURIComponent(url)}
 *    - Proxy 2: https://corsproxy.io/?${encodeURIComponent(url)}
 *    - Proxy 3: https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}
 *    - Proxy 4: https://thingproxy.freeboard.io/fetch/${url}
 *    - Additional resilient fallback proxies: AllOrigins JSON, CorsProxy URL format, isomorphic fetch
 * 2. yt-dlp Style Multi-Pattern Regex & Deep Structural Extractor:
 *    - HTML Media & Source Elements: <source src="...">, <video src="...">
 *    - OpenGraph & Meta Tags: og:video, og:video:secure_url, twitter:player:stream, reversed property/content tags
 *    - Embedded JavaScript Video Player Configurations (JWPlayer, Video.js, HTML5 Configs):
 *      file:\s*["']...["'], source\s*:\s*["']...["'], video_url\s*:\s*["']...["'], contentUrl, streamUrl, hls
 *    - URL Decoding & String Unescaping (escaped slashes https:\/\/..., decodeURIComponent, relative URL normalization)
 *    - Dedicated xxxfollow.com & adult portal preload state / CDN media parsers
 * 3. Step-by-step progress tracking for live UI badges
 */

export interface ExtractVideoResult {
  success: boolean;
  source_webpage: string;
  direct_url?: string;
  error?: string;
  extractedVia?: string;
}

export type ScraperProgressCallback = (info: {
  index: number;
  total: number;
  stage: 'checking' | 'proxying' | 'parsing' | 'success' | 'failed';
  message: string;
  currentUrl: string;
  proxyName?: string;
}) => void;

/**
 * High-Availability CORS Proxy Definitions in Required Priority Order
 */
export const CORS_PROXY_QUEUE = [
  {
    name: 'Proxy 1 (AllOrigins Raw)',
    getUrl: (target: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    parseText: async (res: Response) => await res.text(),
  },
  {
    name: 'Proxy 2 (CorsProxy.io)',
    getUrl: (target: string) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    parseText: async (res: Response) => await res.text(),
  },
  {
    name: 'Proxy 3 (CodeTabs)',
    getUrl: (target: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    parseText: async (res: Response) => await res.text(),
  },
  {
    name: 'Proxy 4 (ThingProxy)',
    getUrl: (target: string) => `https://thingproxy.freeboard.io/fetch/${target}`,
    parseText: async (res: Response) => await res.text(),
  },
  {
    name: 'Proxy 5 (AllOrigins JSON)',
    getUrl: (target: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    parseText: async (res: Response) => {
      const data = await res.json();
      return typeof data?.contents === 'string' ? data.contents : '';
    },
  },
  {
    name: 'Proxy 6 (CorsProxy URL Param)',
    getUrl: (target: string) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    parseText: async (res: Response) => await res.text(),
  },
];

/**
 * Main batch extraction entry point
 */
export async function extractVideoFromWebpage(
  pageUrls: string[],
  onProgress?: ScraperProgressCallback
): Promise<ExtractVideoResult[]> {
  const cleanUrls = pageUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  if (cleanUrls.length === 0) return [];

  const results: ExtractVideoResult[] = [];

  // Attempt backend API batch first if reachable
  const serverHandledMap = new Map<string, ExtractVideoResult>();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    const response = await fetch('/api/extract-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: cleanUrls }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.results)) {
        for (const item of data.results) {
          if (item && item.success && item.direct_url) {
            serverHandledMap.set(item.source_webpage, item);
          }
        }
      }
    }
  } catch (e) {
    // Backend API route not mounted or static deployment (e.g. Netlify)
    // Client-side multi-proxy scraping chain will handle all URLs seamlessly
  }

  // Process each URL with granular step-by-step progress
  for (let i = 0; i < cleanUrls.length; i++) {
    const targetUrl = cleanUrls[i];

    if (serverHandledMap.has(targetUrl)) {
      const serverResult = serverHandledMap.get(targetUrl)!;
      if (onProgress) {
        onProgress({
          index: i + 1,
          total: cleanUrls.length,
          stage: 'success',
          message: 'Stream extracted successfully',
          currentUrl: targetUrl,
          proxyName: 'Server Direct',
        });
      }
      results.push(serverResult);
      continue;
    }

    // Client-side High-Availability CORS-Safe Proxy Rotation
    const scrapeResult = await clientSideScrapeVideo(targetUrl, (stage, message, proxyName) => {
      if (onProgress) {
        onProgress({
          index: i + 1,
          total: cleanUrls.length,
          stage,
          message,
          currentUrl: targetUrl,
          proxyName,
        });
      }
    });

    results.push(scrapeResult);
  }

  return results;
}

/**
 * Scrape a single webpage using High-Availability CORS Proxy Rotation Engine
 */
export async function clientSideScrapeVideo(
  rawUrl: string,
  onStep?: (stage: 'checking' | 'proxying' | 'parsing' | 'success' | 'failed', message: string, proxyName?: string) => void
): Promise<ExtractVideoResult> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // 1. Direct media URL check (.mp4, .m3u8, .webm, etc.)
  if (isDirectVideoUrl(url)) {
    if (onStep) onStep('success', 'Direct stream format detected', 'Direct URL');
    return {
      success: true,
      source_webpage: rawUrl,
      direct_url: url,
      extractedVia: 'Direct Stream URL',
    };
  }

  if (onStep) onStep('proxying', 'Connecting to CORS proxy rotation engine...', 'Initializing');

  let htmlContent = '';
  let successfulProxyName = '';
  let proxyAttemptIndex = 0;

  // 2. High-Availability CORS Proxy Rotation Engine
  for (const proxy of CORS_PROXY_QUEUE) {
    proxyAttemptIndex++;
    try {
      if (onStep) {
        onStep(
          'proxying',
          `Attempting ${proxy.name} (${proxyAttemptIndex}/${CORS_PROXY_QUEUE.length})...`,
          proxy.name
        );
      }

      const proxyTargetUrl = proxy.getUrl(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7500);

      const resp = await fetch(proxyTargetUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        const text = await proxy.parseText(resp);
        if (text && typeof text === 'string' && text.length > 150) {
          htmlContent = text;
          successfulProxyName = proxy.name;
          break;
        }
      }
    } catch (err) {
      // Automatically rotate to next proxy in fallback array
    }
  }

  // Direct fetch fallback in case target domain allows open CORS
  if (!htmlContent) {
    try {
      if (onStep) onStep('proxying', 'Testing direct fetch with CORS fallback...', 'Direct Fetch');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(url, { signal: controller.signal, mode: 'cors' });
      clearTimeout(timeout);
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 150) {
          htmlContent = text;
          successfulProxyName = 'Direct Fetch';
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  if (!htmlContent) {
    if (onStep) onStep('failed', 'Webpage unreachable across all CORS proxies', 'CORS Proxy Error');
    return {
      success: false,
      source_webpage: rawUrl,
      error: 'Webpage could not be reached through CORS proxies. Check domain availability.',
    };
  }

  if (onStep) onStep('parsing', 'Scanning HTML using yt-dlp multi-pattern extractor...', successfulProxyName);

  // 3. Check specialized xxxfollow.com parser first
  if (url.includes('xxxfollow.com')) {
    const directXxxfollow = parseXxxfollowHtml(htmlContent, url);
    if (directXxxfollow) {
      if (onStep) onStep('success', 'Extracted direct CDN video stream', successfulProxyName);
      return {
        success: true,
        source_webpage: rawUrl,
        direct_url: directXxxfollow,
        extractedVia: `${successfulProxyName} (xxxfollow CDN Parser)`,
      };
    }
  }

  // 4. yt-dlp Style Multi-Pattern Regex & Structural Extractor
  const foundStreamUrl = findVideoUrlInHtml(htmlContent, url);
  if (foundStreamUrl) {
    if (onStep) onStep('success', 'Extracted playable stream URL', successfulProxyName);
    return {
      success: true,
      source_webpage: rawUrl,
      direct_url: foundStreamUrl,
      extractedVia: `${successfulProxyName} (yt-dlp Pattern Extractor)`,
    };
  }

  if (onStep) onStep('failed', 'No embedded video stream found in page HTML', successfulProxyName);
  return {
    success: false,
    source_webpage: rawUrl,
    error: 'No valid video stream (.mp4, .m3u8, .webm) found in webpage HTML.',
  };
}

/**
 * Deep parser for xxxfollow.com HTML
 */
export function parseXxxfollowHtml(html: string, pageUrl: string): string | null {
  try {
    // A. Check window.__PRELOAD_STATE__
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
                if (m.fhd_url && isDirectVideoUrl(m.fhd_url)) return unescapeAndNormalizeUrl(m.fhd_url, pageUrl);
                if (m.sd_url && isDirectVideoUrl(m.sd_url)) return unescapeAndNormalizeUrl(m.sd_url, pageUrl);
                if (m.url && isDirectVideoUrl(m.url)) return unescapeAndNormalizeUrl(m.url, pageUrl);
                if (m.uhd_url && isDirectVideoUrl(m.uhd_url)) return unescapeAndNormalizeUrl(m.uhd_url, pageUrl);

                // Extract blur_url / thumb_url / start_url and transform to mp4 CDN
                const imgUrl = m.blur_url || m.thumb_url || m.start_url;
                if (imgUrl && typeof imgUrl === 'string') {
                  const baseMp4 = imgUrl.replace(/_(?:blur|start|thumb)\.(?:jpg|webp|jpeg)$/i, '.mp4');
                  if (isDirectVideoUrl(baseMp4)) {
                    return unescapeAndNormalizeUrl(baseMp4, pageUrl);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // Continue to regex patterns
      }
    }

    // B. Regex search for media/fans/post_public images -> mp4
    const mediaImgMatches = html.matchAll(
      /https?:\/\/[^\s"'<>]+\/media\/fans\/post_public\/[0-9]+\/[0-9]+\/([0-9]+)_(?:blur|start|thumb)\.(?:jpg|webp|jpeg)/gi
    );
    for (const match of mediaImgMatches) {
      if (match[0]) {
        const directMp4 = match[0].replace(/_(?:blur|start|thumb)\.(?:jpg|webp|jpeg)$/i, '.mp4');
        return unescapeAndNormalizeUrl(directMp4, pageUrl);
      }
    }

    // C. Direct media/fans/post_public mp4
    const directMp4Match = html.match(
      /https?:\/\/[^\s"'<>]+\/media\/fans\/post_public\/[0-9]+\/[0-9]+\/[0-9]+(?:\_sd|\_hd|\_fhd)?\.mp4/gi
    );
    if (directMp4Match && directMp4Match[0]) {
      return unescapeAndNormalizeUrl(directMp4Match[0], pageUrl);
    }
  } catch (e) {
    console.error('Error parsing xxxfollow HTML:', e);
  }

  return findVideoUrlInHtml(html, pageUrl);
}

/**
 * yt-dlp Style Multi-Pattern Regex & Structural Extractor
 */
export function findVideoUrlInHtml(html: string, baseUrl: string): string | null {
  if (!html) return null;
  const rawCandidates: string[] = [];

  // ==========================================
  // Pattern A: HTML Media & Source Elements
  // ==========================================
  const sourceTagMatches = html.matchAll(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8|webm)[^"']*)["']/gi);
  for (const m of sourceTagMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  const videoTagMatches = html.matchAll(/<video[^>]+src=["']([^"']+\.(?:mp4|m3u8|webm)[^"']*)["']/gi);
  for (const m of videoTagMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  // Generic data attributes (data-src, data-video, data-stream, data-url, data-mp4, data-hls)
  const dataAttrMatches = html.matchAll(
    /(?:data-src|data-video|data-stream|data-url|data-mp4|data-hls)=["']([^"']+)["']/gi
  );
  for (const m of dataAttrMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  // ==========================================
  // Pattern B: OpenGraph & Meta Tags
  // ==========================================
  const ogVideoMatches = html.matchAll(
    /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi
  );
  for (const m of ogVideoMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  // Reversed attribute order: <meta content="..." property="og:video" />
  const ogVideoReversedMatches = html.matchAll(
    /<meta[^>]+content=["']([^"']+\.(?:mp4|m3u8|webm)[^"']*)["'][^>]+property=["']og:video/gi
  );
  for (const m of ogVideoReversedMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  // Twitter player stream
  const twitterMatches = html.matchAll(
    /<meta[^>]+(?:name|property)=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/gi
  );
  for (const m of twitterMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  // ==========================================
  // Pattern C: Embedded JavaScript Configurations (JWPlayer, Video.js, HTML5 Configs)
  // ==========================================
  const jwFileMatches = html.matchAll(/file:\s*["']([^"']+\.(?:mp4|m3u8|webm)[^"']*)["']/gi);
  for (const m of jwFileMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  const jwSourceMatches = html.matchAll(/source\s*:\s*["']([^"']+\.(?:mp4|m3u8|webm)[^"']*)["']/gi);
  for (const m of jwSourceMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  const jwVideoUrlMatches = html.matchAll(/video_url\s*:\s*["']([^"']+)["']/gi);
  for (const m of jwVideoUrlMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  // JSON and JS config keys (contentUrl, videoUrl, streamUrl, fileUrl, hls, src, video_src)
  const jsConfigMatches = html.matchAll(
    /(?:file|src|video_url|videoUrl|contentUrl|streamUrl|fileUrl|stream_url|hls|video_src)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8|webm|mov|mpd)[^"']*)["']/gi
  );
  for (const m of jsConfigMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  const jsonMatches = html.matchAll(
    /["'](?:contentUrl|videoUrl|streamUrl|fileUrl|video_url|stream_url|file|hls)["']\s*:\s*["']([^"']+)["']/gi
  );
  for (const m of jsonMatches) {
    if (m[1]) rawCandidates.push(m[1]);
  }

  // ==========================================
  // Pattern D: Direct Regex Extraction
  // ==========================================
  const directRegex = /https?:\/\/[^\s"'<>\\}]+\.(?:mp4|m3u8|mpd|webm|mov)(?:\?[^\s"'<>\\}]*)?/gi;
  const directMatches = html.matchAll(directRegex);
  for (const m of directMatches) {
    if (m[0]) rawCandidates.push(m[0]);
  }

  // Escaped URL Regex (https:\/\/site.com\/video.mp4)
  const escapedRegex = /https?:\\\/\\\/[^\s"'<>\\}]+\.(?:mp4|m3u8|mpd|webm|mov)(?:\?[^\s"'<>\\}]*)?/gi;
  const escapedMatches = html.matchAll(escapedRegex);
  for (const m of escapedMatches) {
    if (m[0]) rawCandidates.push(m[0]);
  }

  // ==========================================
  // URL Decoding, String Unescaping & Normalization
  // ==========================================
  for (const rawCandidate of rawCandidates) {
    const normalized = unescapeAndNormalizeUrl(rawCandidate, baseUrl);
    if (!normalized) continue;

    const lower = normalized.toLowerCase();
    // Skip static assets
    if (
      lower.includes('.jpg') ||
      lower.includes('.jpeg') ||
      lower.includes('.png') ||
      lower.includes('.webp') ||
      lower.includes('.gif') ||
      lower.includes('.svg') ||
      lower.includes('.css') ||
      lower.includes('.js') ||
      lower.includes('.ico') ||
      lower.includes('.woff')
    ) {
      continue;
    }

    // Match valid video formats
    if (
      lower.includes('.mp4') ||
      lower.includes('.m3u8') ||
      lower.includes('.webm') ||
      lower.includes('.mpd') ||
      lower.includes('master.m3u8') ||
      lower.includes('index.m3u8') ||
      lower.includes('/stream/') ||
      lower.includes('/video/')
    ) {
      return normalized;
    }
  }

  return null;
}

/**
 * Unescapes JavaScript encoded slashes, decodes URI components, and resolves relative URLs
 */
export function unescapeAndNormalizeUrl(rawUrl: string, baseUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  // 1. Unescape escaped forward slashes (\/ -> /)
  let clean = rawUrl.replace(/\\\/|\//g, (match) => (match === '\\/' ? '/' : match)).replace(/\\/g, '').trim();

  // 2. Decode URI component if encoded
  if (clean.includes('%3A%2F%2F') || clean.includes('%2F') || clean.includes('%3a%2f%2f')) {
    try {
      clean = decodeURIComponent(clean);
    } catch (e) {
      // Ignore
    }
  }

  // 3. Normalize protocol-relative URLs (//cdn.site.com/video.mp4 -> https://cdn.site.com/video.mp4)
  if (clean.startsWith('//')) {
    clean = 'https:' + clean;
  } else if (clean.startsWith('/') || (!clean.startsWith('http://') && !clean.startsWith('https://'))) {
    try {
      clean = new URL(clean, baseUrl).href;
    } catch (e) {
      return null;
    }
  }

  if (!/^https?:\/\//i.test(clean)) return null;

  // Final trim of any trailing quotes or brackets
  return clean.replace(/[\"\'<>]+$/, '');
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
