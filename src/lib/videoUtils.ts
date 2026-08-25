/**
 * Universal Link Extraction and Validation Utilities for Video Streams
 */

/**
 * Extract clean URL strings from any arbitrary input text.
 * Handles:
 * - Double quotes: "https://example.com/video.mp4" or "video.mp4"
 * - Single quotes: 'https://example.com/stream.m3u8'
 * - Angle brackets: <https://example.com/video.webm>
 * - Comma, newline, space, tab, or bracket separated list of links
 * - URLs missing protocol (e.g., cdn.site.com/video.mp4 -> https://cdn.site.com/video.mp4)
 */
export function extractLinksFromString(input: string): string[] {
  if (!input || typeof input !== 'string') return [];

  // Match quoted strings, angle brackets, or space/comma separated tokens
  // Matches "url", 'url', <url>, or raw tokens
  const rawTokens = input.match(/(?:"[^"]+"|'[^']+'|<[^>]+>|[^\s,;\n\r"<>]+)/g) || [];

  const extracted: string[] = [];

  for (let token of rawTokens) {
    // Strip leading and trailing quotes, brackets, whitespace, commas, semicolons
    token = token.trim().replace(/^["'<(\[\{]+|["'>)\],;]+$/g, '').trim();

    if (!token) continue;

    // Check if token looks like a URL or video path
    // Accept http://, https://, //, or domain-like formats (e.g. cdn.domain.com/path or filename.mp4)
    if (
      token.startsWith('http://') ||
      token.startsWith('https://') ||
      token.startsWith('//') ||
      token.match(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/) ||
      token.match(/\.(mp4|m3u8|webm|mov|avi|flv|mkv|mpd)(\?.*)?$/i)
    ) {
      // Normalize protocol
      let normalized = token;
      if (normalized.startsWith('//')) {
        normalized = 'https:' + normalized;
      } else if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'https://' + normalized;
      }

      // Basic URL validity test
      try {
        new URL(normalized);
        if (!extracted.includes(normalized)) {
          extracted.push(normalized);
        }
      } catch (e) {
        // Invalid URL format ignored
      }
    }
  }

  return extracted;
}

export interface LinkHealthResult {
  url: string;
  status: 'healthy' | 'broken' | 'unreachable';
  statusCode?: number;
  errorMessage?: string;
  checkTimeMs: number;
}

/**
 * Verify if a video stream link is playable/accessible.
 * Uses a combination of fetch network probe and HTMLVideoElement media test.
 */
export async function verifyVideoLink(
  url: string,
  timeoutMs: number = 6000
): Promise<LinkHealthResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (
      status: 'healthy' | 'broken' | 'unreachable',
      errorMessage?: string,
      statusCode?: number
    ) => {
      if (resolved) return;
      resolved = true;
      resolve({
        url,
        status,
        statusCode,
        errorMessage,
        checkTimeMs: Date.now() - startTime,
      });
    };

    // Timeout safety fallback
    const timer = setTimeout(() => {
      // If network is slow or CORS blocks, check via video element or fetch
      finish('unreachable', 'Connection timeout (6s)');
    }, timeoutMs);

    // 1. Try standard fetch HEAD or GET request first
    fetch(url, { method: 'HEAD', mode: 'no-cors' })
      .then(() => {
        // In no-cors mode, opaque response means the server responded!
        clearTimeout(timer);
        finish('healthy');
      })
      .catch(() => {
        // Fallback: Test via HTMLVideoElement probe in memory
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = url;

        const onCanPlay = () => {
          cleanup();
          finish('healthy');
        };

        const onError = () => {
          cleanup();
          finish('broken', 'Video stream failed to load or decode');
        };

        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener('loadedmetadata', onCanPlay);
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          video.removeAttribute('src');
          video.load();
        };

        video.addEventListener('loadedmetadata', onCanPlay);
        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('error', onError);

        // Trigger load
        video.load();
      });
  });
}

export interface XvideosConvertedLink {
  original: string;
  embedUrl: string;
  videoId: string;
}

/**
 * Convert XVideos Watch or Embed URLs into canonical iframe embed format:
 * https://www.xvideos.com/embedframe/{VIDEO_ID}
 *
 * Uses the specification regex:
 * xvideos\.[a-z]+/(?:video(?:\.([a-zA-Z0-9]+)|(\d+))|embedframe/([a-zA-Z0-9]+))
 */
export function convertXvideosToEmbedUrl(urlOrText: string): XvideosConvertedLink | null {
  if (!urlOrText || typeof urlOrText !== 'string') return null;
  const trimmed = urlOrText.trim().replace(/^["'<(\[\{]+|["'>)\],;]+$/g, '').trim();
  if (!trimmed) return null;

  // Extract from iframe src if user pasted an entire <iframe> embed HTML snippet
  let target = trimmed;
  const iframeSrcMatch = trimmed.match(/src=["']([^"']+)["']/i);
  if (iframeSrcMatch && iframeSrcMatch[1]) {
    target = iframeSrcMatch[1];
  }

  // 1. User regex pattern matching xvideos domains
  const regex = /xvideos\.[a-z]+(?::\d+)?\/(?:video(?:\.([a-zA-Z0-9]+)|(\d+)|_([a-zA-Z0-9]+))|embedframe\/([a-zA-Z0-9]+))/i;
  const match = target.match(regex);

  if (match) {
    const videoId = match[1] || match[2] || match[4] || match[3];
    if (videoId) {
      return {
        original: trimmed,
        videoId,
        embedUrl: `https://www.xvideos.com/embedframe/${videoId}`,
      };
    }
  }

  // 2. Direct embedframe match fallback (e.g. /embedframe/71628173)
  const embedDirectMatch = target.match(/embedframe\/([a-zA-Z0-9]+)/i);
  if (embedDirectMatch && embedDirectMatch[1]) {
    return {
      original: trimmed,
      videoId: embedDirectMatch[1],
      embedUrl: `https://www.xvideos.com/embedframe/${embedDirectMatch[1]}`,
    };
  }

  // 3. If raw video ID was provided (e.g. 71628173 or ubvpkab90c5)
  if (/^[a-zA-Z0-9_]{4,24}$/.test(target)) {
    return {
      original: trimmed,
      videoId: target,
      embedUrl: `https://www.xvideos.com/embedframe/${target}`,
    };
  }

  // 4. If standard http(s) URL, keep and normalize
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return {
      original: trimmed,
      videoId: '',
      embedUrl: target,
    };
  }

  return null;
}

/**
 * Extract and convert multiple XVideos links from user input string.
 * Handles comma-separated, newlines, raw links, or <iframe> HTML tags.
 */
export function extractXvideosLinksFromString(input: string): XvideosConvertedLink[] {
  if (!input || typeof input !== 'string') return [];

  // Match tokens (iframe tags, quoted strings, bracketed strings, or whitespace/comma-delimited items)
  const rawTokens = input.match(/(?:<iframe[^>]*>.*?<\/iframe>|<iframe[^>]*\/>|"[^"]+"|'[^']+'|<[^>]+>|[^\s,;\n\r"<>]+)/gi) || [];

  const results: XvideosConvertedLink[] = [];
  const seenEmbedUrls = new Set<string>();

  for (const token of rawTokens) {
    const converted = convertXvideosToEmbedUrl(token);
    if (converted && !seenEmbedUrls.has(converted.embedUrl)) {
      seenEmbedUrls.add(converted.embedUrl);
      results.push(converted);
    }
  }

  return results;
}
