/**
 * Universal Link Extraction and Validation Utilities for Video Streams
 */

/**
 * Advanced Link Extractor: Extracts clean URL strings from any arbitrary input text or format.
 * Handles:
 * - URLs with commas, semicolons, quotes (single ' or double "), angle brackets <>, brackets [], parens ()
 * - Markdown links [Title](https://...) and HTML <a href="..."> / <iframe src="...">
 * - JSON arrays of strings ["https://..."]
 * - Multiline text with surrounding conversational text (e.g., "Check this https://... and https://...")
 * - URLs missing protocol (e.g., www.xxxfollow.com/... -> https://www.xxxfollow.com/...)
 * - Trailing punctuation removal (trailing commas, periods, quotes, brackets)
 */
export function extractLinksFromString(input: string): string[] {
  if (!input || typeof input !== 'string') return [];

  // Remove zero-width and invisible control characters
  const cleanInput = input.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!cleanInput) return [];

  const foundUrls = new Set<string>();

  // 1. Regex pattern for full HTTP/HTTPS URLs
  const httpRegex = /https?:\/\/[^\s"'<>\`{}|\\^]+[a-zA-Z0-9/_~%&=?#\-+]/gi;
  const httpMatches = cleanInput.match(httpRegex) || [];
  for (const match of httpMatches) {
    const trimmed = cleanTrailingPunctuation(match);
    if (trimmed) foundUrls.add(trimmed);
  }

  // 2. Regex pattern for URLs starting with www.
  const wwwRegex = /(?:^|[\s,;\"'<(])((?:www\.)[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+(?:\/[^\s"'<>\`{}|\\^]*)?)/gi;
  let wwwMatch: RegExpExecArray | null;
  while ((wwwMatch = wwwRegex.exec(cleanInput)) !== null) {
    const trimmed = cleanTrailingPunctuation(wwwMatch[1]);
    if (trimmed) foundUrls.add('https://' + trimmed);
  }

  // 3. Regex pattern for domain-like video site paths (e.g. xxxfollow.com/..., cdn.site.com/...)
  const domainRegex = /(?:^|[\s,;\"'<(])((?:xxxfollow\.com|[a-zA-Z0-9\-]+\.(?:com|org|net|io|co|cc|tv|to|me|cc|video|cam|xxx|adult|club))\/(?:[^\s"'<>\`{}|\\^]*))/gi;
  let domainMatch: RegExpExecArray | null;
  while ((domainMatch = domainRegex.exec(cleanInput)) !== null) {
    const trimmed = cleanTrailingPunctuation(domainMatch[1]);
    if (trimmed && !trimmed.startsWith('http')) {
      foundUrls.add('https://' + trimmed);
    }
  }

  // 4. Token-based fallback for quoted strings, JSON tokens, and comma/space separated lists
  const tokenMatches = cleanInput.match(/(?:"[^"]+"|'[^']+'|<[^>]+>|\[[^\]]+\]|\([^\)]+\)|[^\s,;\n\r]+)/g) || [];
  for (let token of tokenMatches) {
    token = token.trim().replace(/^["'<(\[\{]+|["'>)\],;\}]+$/g, '').trim();
    if (!token) continue;

    if (
      token.startsWith('http://') ||
      token.startsWith('https://') ||
      token.startsWith('//') ||
      token.match(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/.*)?$/) ||
      token.match(/\.(mp4|m3u8|webm|mov|avi|flv|mkv|mpd)(\?.*)?$/i)
    ) {
      let normalized = token;
      if (normalized.startsWith('//')) {
        normalized = 'https:' + normalized;
      } else if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'https://' + normalized;
      }
      const trimmed = cleanTrailingPunctuation(normalized);
      if (trimmed) foundUrls.add(trimmed);
    }
  }

  // Final normalization and validation pass
  const validList: string[] = [];
  for (const candidate of foundUrls) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        if (!validList.includes(parsed.href)) {
          validList.push(parsed.href);
        }
      }
    } catch (e) {
      // Ignore unparseable fragments
    }
  }

  return validList;
}

/**
 * Strips trailing commas, dots, quotes, parens, brackets, semicolons from URL string
 */
function cleanTrailingPunctuation(url: string): string {
  if (!url) return '';
  return url.trim().replace(/[\.,;:!?)\]>\"\'\}]+$/, '').trim();
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
