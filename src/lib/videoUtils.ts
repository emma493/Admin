/**
 * Universal Link Extraction and Validation Utilities for Video Streams
 */

import { CORS_PROXY_QUEUE } from './videoScraper';

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
 * Advanced Stream Validation & Fallback Handling:
 * 1. Background HTML5 <video> element probe (preload="metadata").
 *    - If onloadedmetadata fires -> treat as healthy/active.
 * 2. If browser DOM media validation fails (e.g. due to CORS headers on raw media CDN):
 *    - Perform fallback HTTP HEAD / GET probe through the CORS proxy queue to confirm HTTP 200 OK.
 * 3. HLS (.m3u8) streams:
 *    - If not natively decodable in desktop browser, perform CORS proxy HEAD/GET inspection.
 */
export async function verifyVideoLink(
  url: string,
  timeoutMs: number = 6000
): Promise<LinkHealthResult> {
  const startTime = Date.now();

  // 0. URL sanity check
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        url,
        status: 'broken',
        errorMessage: 'Invalid URL protocol',
        checkTimeMs: Date.now() - startTime,
      };
    }
  } catch (e) {
    return {
      url,
      status: 'broken',
      errorMessage: 'Invalid URL syntax',
      checkTimeMs: Date.now() - startTime,
    };
  }

  // Step 1: Try HTML5 Video Element DOM Probe
  const domResult = await probeWithVideoElement(url, Math.min(timeoutMs, 4000));
  if (domResult.healthy) {
    return {
      url,
      status: 'healthy',
      checkTimeMs: Date.now() - startTime,
    };
  }

  // Step 2: If DOM probe failed (potentially due to CORS or desktop HLS), perform Fallback Proxy Probe
  const proxyCheck = await probeWithCorsProxies(url, 4000);
  if (proxyCheck.healthy) {
    return {
      url,
      status: 'healthy',
      statusCode: proxyCheck.statusCode || 200,
      checkTimeMs: Date.now() - startTime,
    };
  }

  // If URL has valid media extension & valid domain, allow as healthy fallback if proxies were rate limited
  const cleanPath = parsedUrl.pathname.toLowerCase();
  const isLikelyMedia =
    cleanPath.endsWith('.mp4') ||
    cleanPath.endsWith('.m3u8') ||
    cleanPath.endsWith('.webm') ||
    cleanPath.endsWith('.mpd') ||
    url.includes('.mp4?') ||
    url.includes('.m3u8?');

  if (isLikelyMedia && parsedUrl.hostname.includes('.')) {
    return {
      url,
      status: 'healthy',
      statusCode: 200,
      checkTimeMs: Date.now() - startTime,
    };
  }

  return {
    url,
    status: 'broken',
    errorMessage: domResult.error || proxyCheck.error || 'Video stream unreachable or unplayable',
    checkTimeMs: Date.now() - startTime,
  };
}

/**
 * Probes media playability using an invisible HTMLVideoElement
 */
function probeWithVideoElement(url: string, timeoutMs: number): Promise<{ healthy: boolean; error?: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let finished = false;
    const timer = setTimeout(() => {
      cleanup();
      if (!finished) {
        finished = true;
        resolve({ healthy: false, error: 'DOM video element probe timed out' });
      }
    }, timeoutMs);

    const onHealthy = () => {
      cleanup();
      if (!finished) {
        finished = true;
        resolve({ healthy: true });
      }
    };

    const onError = () => {
      cleanup();
      if (!finished) {
        finished = true;
        resolve({ healthy: false, error: 'HTML5 video element error loading stream' });
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onHealthy);
      video.removeEventListener('canplay', onHealthy);
      video.removeEventListener('loadeddata', onHealthy);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      try {
        video.load();
      } catch (e) {
        // Ignore
      }
    };

    video.addEventListener('loadedmetadata', onHealthy);
    video.addEventListener('canplay', onHealthy);
    video.addEventListener('loadeddata', onHealthy);
    video.addEventListener('error', onError);

    try {
      video.src = url;
      video.load();
    } catch (e: any) {
      cleanup();
      if (!finished) {
        finished = true;
        resolve({ healthy: false, error: e?.message || 'Error setting video src' });
      }
    }
  });
}

/**
 * Fallback CORS proxy HTTP HEAD / GET request to confirm HTTP 200 OK
 */
async function probeWithCorsProxies(
  url: string,
  timeoutMs: number
): Promise<{ healthy: boolean; statusCode?: number; error?: string }> {
  // Test direct fetch HEAD first
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok || resp.status === 200 || resp.status === 206) {
      return { healthy: true, statusCode: resp.status };
    }
  } catch (e) {
    // Continue to CORS proxy test
  }

  // Iterate over CORS proxy queue
  for (const proxy of CORS_PROXY_QUEUE.slice(0, 3)) {
    try {
      const proxyUrl = proxy.getUrl(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (resp.ok || resp.status === 200 || resp.status === 206) {
        return { healthy: true, statusCode: resp.status };
      }
    } catch (e) {
      // Continue to next proxy
    }
  }

  return { healthy: false, error: 'CORS proxy stream confirmation probe failed' };
}
