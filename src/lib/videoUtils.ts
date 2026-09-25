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
 * Rebuilt 2026-09-25: old HEAD no-cors probe ALWAYS resolved "healthy"
 * (opaque response), so broken links were never caught. New order:
 * 1) HTMLVideoElement metadata probe (real decode test, catches 404s),
 * 2) fetch Range GET fallback (catches CORS-blocked-but-alive hosts as
 *    "unreachable", not "healthy").
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
      finish('unreachable', 'Connection timeout (6s)');
    }, timeoutMs);

    // 1. Primary: HTMLVideoElement metadata probe (real playback test)
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    // @ts-ignore - playsInline for iOS probe
    video.playsInline = true;

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onCanPlay);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      try { video.load(); } catch (_) { /* noop */ }
    };

    const onCanPlay = () => {
      cleanup();
      finish('healthy');
    };

    const onError = () => {
      cleanup();
      // 2. Fallback: Range GET — distinguishes dead hosts (broken)
      // from CORS-blocked-but-alive hosts (unreachable, not healthy).
      fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
        .then((res) => {
          if (res.ok || res.status === 206 || res.status === 200) {
            finish('unreachable', 'Host alive but blocked media probe (CORS?)');
          } else if (res.status === 404 || res.status === 410) {
            finish('broken', `HTTP ${res.status} — stream not found`, res.status);
          } else {
            finish('broken', `HTTP ${res.status} — stream failed`, res.status);
          }
        })
        .catch(() => {
          finish('broken', 'Video stream failed to load or decode');
        });
    };

    video.addEventListener('loadedmetadata', onCanPlay);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    video.src = url;
    try {
      video.load();
    } catch (_) {
      onError();
    }
  });
}
