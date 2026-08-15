import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API endpoint to scrape/extract video stream URL from webpage(s)
  app.post('/api/extract-video', async (req, res) => {
    try {
      const { urls } = req.body;
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'Missing or invalid "urls" array parameter' });
      }

      const results = [];
      for (const rawUrl of urls) {
        const trimmedUrl = String(rawUrl || '').trim();
        if (!trimmedUrl) continue;

        try {
          const result = await extractVideoStreamFromUrl(trimmedUrl);
          results.push(result);
        } catch (err: any) {
          results.push({
            success: false,
            source_webpage: trimmedUrl,
            error: err?.message || 'Failed to extract video stream from webpage',
          });
        }
      }

      return res.json({ results });
    } catch (error: any) {
      console.error('Extract video route error:', error);
      return res.status(500).json({ error: 'Server error extracting video streams' });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

/**
 * Enhanced scraper/extractor logic for extracting raw video file source (.mp4, .m3u8, etc.)
 * from target HTML page, with specialized handling for xxxfollow.com and generic video platforms.
 */
async function extractVideoStreamFromUrl(pageUrl: string): Promise<{
  success: boolean;
  source_webpage: string;
  direct_url?: string;
  error?: string;
}> {
  let formattedUrl = pageUrl;
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = 'https://' + formattedUrl;
  }

  // 1. Check if the URL itself is already a direct media file
  if (isDirectVideoUrl(formattedUrl)) {
    return {
      success: true,
      source_webpage: pageUrl,
      direct_url: formattedUrl,
    };
  }

  // 2. Fetch the target webpage with realistic browser headers
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let response;
  try {
    response = await fetch(formattedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,video/*;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': formattedUrl,
      },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      success: false,
      source_webpage: pageUrl,
      error: `Failed to reach webpage (${err?.message || 'Network error'})`,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get('content-type') || '';
  // If response is directly a video stream content-type
  if (
    contentType.includes('video/') ||
    contentType.includes('application/x-mpegURL') ||
    contentType.includes('application/vnd.apple.mpegurl')
  ) {
    return {
      success: true,
      source_webpage: pageUrl,
      direct_url: response.url || formattedUrl,
    };
  }

  const html = await response.text();

  // 3. Specialized extractor for xxxfollow.com
  if (formattedUrl.includes('xxxfollow.com')) {
    const xxxfollowDirect = parseXxxfollowHtmlServer(html, response.url || formattedUrl);
    if (xxxfollowDirect) {
      return {
        success: true,
        source_webpage: pageUrl,
        direct_url: xxxfollowDirect,
      };
    }
  }

  // 4. Universal Video Finder
  const directUrl = findVideoUrlInHtmlServer(html, response.url || formattedUrl);
  if (directUrl) {
    return {
      success: true,
      source_webpage: pageUrl,
      direct_url: directUrl,
    };
  }

  return {
    success: false,
    source_webpage: pageUrl,
    error: 'No valid video stream (.mp4, .m3u8, etc.) found embedded on the webpage',
  };
}

function parseXxxfollowHtmlServer(html: string, pageUrl: string): string | null {
  try {
    // Check window.__PRELOAD_STATE__
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
                if (m.fhd_url && isDirectVideoUrl(m.fhd_url)) return m.fhd_url;
                if (m.sd_url && isDirectVideoUrl(m.sd_url)) return m.sd_url;
                if (m.url && isDirectVideoUrl(m.url)) return m.url;
                if (m.uhd_url && isDirectVideoUrl(m.uhd_url)) return m.uhd_url;

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
        // Continue to regex patterns
      }
    }

    // Regex search for media/fans/post_public images -> mp4
    const mediaImgMatches = html.matchAll(
      /https?:\/\/[^\s"'<>]+\/media\/fans\/post_public\/[0-9]+\/[0-9]+\/([0-9]+)_(?:blur|start|thumb)\.(?:jpg|webp|jpeg)/gi
    );
    for (const match of mediaImgMatches) {
      if (match[0]) {
        const directMp4 = match[0].replace(/_(?:blur|start|thumb)\.(?:jpg|webp|jpeg)$/i, '.mp4');
        return directMp4;
      }
    }

    const directMp4Match = html.match(/https?:\/\/[^\s"'<>]+\/media\/fans\/post_public\/[0-9]+\/[0-9]+\/[0-9]+(?:\_sd|\_hd)?\.mp4/gi);
    if (directMp4Match && directMp4Match[0]) {
      return directMp4Match[0];
    }
  } catch (e) {
    console.error('Server error parsing xxxfollow HTML:', e);
  }

  return null;
}

function isDirectVideoUrl(url: string): boolean {
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

function findVideoUrlInHtmlServer(html: string, baseUrl: string): string | null {
  const candidates: string[] = [];

  // A. Check <source src="..."> or <video src="...">
  const sourceMatches = html.matchAll(/<(?:source|video)[^>]+src=["']([^"']+)["']/gi);
  for (const m of sourceMatches) {
    if (m[1]) candidates.push(m[1]);
  }

  // B. Check meta tags og:video, twitter:player:stream
  const metaMatches = html.matchAll(
    /<meta[^>]+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/gi
  );
  for (const m of metaMatches) {
    if (m[1]) candidates.push(m[1]);
  }

  // C. Check contentUrl and file in JSON-LD scripts
  const jsonLdMatches = html.matchAll(/["'](?:contentUrl|videoUrl|streamUrl|fileUrl|video_url|stream_url|file|hls)["']\s*:\s*["']([^"']+)["']/gi);
  for (const m of jsonLdMatches) {
    if (m[1]) candidates.push(m[1]);
  }

  // D. Regex search for direct video file URLs (.mp4, .m3u8, etc) inside JavaScript or attributes
  const directRegex = /https?:\/\/[^\s"'<>\\}]+\.(?:mp4|m3u8|mpd|webm|mov)(?:\?[^\s"'<>\\}]*)?/gi;
  const regexMatches = html.matchAll(directRegex);
  for (const m of regexMatches) {
    if (m[0]) candidates.push(m[0]);
  }

  // E. Regex search for CDN/stream keywords
  const streamRegex =
    /https?:\/\/[^\s"'<>\\}]*(?:cdn|video_url|file_url|stream_url|get_file|master\.m3u8|index\.m3u8)[^\s"'<>\\}]*/gi;
  const streamMatches = html.matchAll(streamRegex);
  for (const m of streamMatches) {
    if (m[0]) candidates.push(m[0]);
  }

  // Filter & normalize candidates
  for (const rawCandidate of candidates) {
    let cleanCandidate = rawCandidate.replace(/\\/g, ''); // Unescape slashes if from JSON
    if (cleanCandidate.startsWith('//')) {
      cleanCandidate = 'https:' + cleanCandidate;
    } else if (cleanCandidate.startsWith('/')) {
      try {
        cleanCandidate = new URL(cleanCandidate, baseUrl).href;
      } catch (e) {
        continue;
      }
    }

    // Must be http or https
    if (!/^https?:\/\//i.test(cleanCandidate)) continue;

    // Reject non-media file extensions (images, scripts, styles)
    const lower = cleanCandidate.toLowerCase();
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

    // Prioritize direct video extensions or m3u8
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

  // If no strict .mp4/.m3u8 found, return first valid candidate if available
  if (candidates.length > 0) {
    for (const rawCandidate of candidates) {
      let cleanCandidate = rawCandidate.replace(/\\/g, '');
      if (cleanCandidate.startsWith('//')) cleanCandidate = 'https:' + cleanCandidate;

      if (/^https?:\/\//i.test(cleanCandidate)) {
        const lower = cleanCandidate.toLowerCase();
        if (!lower.endsWith('.jpg') && !lower.endsWith('.png') && !lower.endsWith('.js') && !lower.endsWith('.css')) {
          return cleanCandidate;
        }
      }
    }
  }

  return null;
}

startServer();
