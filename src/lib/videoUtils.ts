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
