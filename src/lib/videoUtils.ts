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
 * Uses network probe and HTMLVideoElement media test to reliably catch broken links.
 */
export async function verifyVideoLink(
  url: string,
  timeoutMs: number = 5000
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

    // 0. Quick sanity check on URL string
    try {
      new URL(url);
    } catch (e) {
      finish('broken', 'Invalid URL format');
      return;
    }

    // Timeout fallback - if nothing responds in time, mark broken/unreachable
    const timer = setTimeout(() => {
      finish('broken', 'Connection timeout - link unreachable');
    }, timeoutMs);

    // 1. Media Element Probe (most accurate for video streams)
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;

    const onHealthy = () => {
      cleanup();
      finish('healthy');
    };

    const onError = () => {
      cleanup();
      finish('broken', 'Video stream failed to load or returned error');
    };

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onHealthy);
      video.removeEventListener('canplay', onHealthy);
      video.removeEventListener('loadeddata', onHealthy);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
    };

    video.addEventListener('loadedmetadata', onHealthy);
    video.addEventListener('canplay', onHealthy);
    video.addEventListener('loadeddata', onHealthy);
    video.addEventListener('error', onError);

    // 2. Fetch probe in parallel
    fetch(url, { method: 'HEAD' })
      .then((res) => {
        if (res.ok || res.status === 200 || res.status === 206) {
          cleanup();
          finish('healthy', undefined, res.status);
        } else if (res.status >= 400) {
          cleanup();
          finish('broken', `HTTP ${res.status}`, res.status);
        }
      })
      .catch(() => {
        // CORS restriction might block fetch, so let video element complete probe
      });

    // Start video loading probe
    video.load();
  });
}
