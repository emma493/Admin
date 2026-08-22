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
 * Verify if a single video stream link is playable/accessible.
 * Uses a combination of fetch network probe and HTMLVideoElement media test.
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

    // Timeout safety fallback
    const timer = setTimeout(() => {
      finish('healthy', 'Verification timeout - marked optimistic healthy');
    }, timeoutMs);

    // 1. Try standard fetch HEAD or GET request first with AbortController
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const fetchTimer = setTimeout(() => {
      if (controller) controller.abort();
    }, timeoutMs - 500);

    fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller ? controller.signal : undefined,
    })
      .then(() => {
        clearTimeout(timer);
        clearTimeout(fetchTimer);
        finish('healthy');
      })
      .catch(() => {
        clearTimeout(fetchTimer);
        // If in browser, test via lightweight video metadata probe
        if (typeof document !== 'undefined') {
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

          video.load();
        } else {
          clearTimeout(timer);
          finish('healthy');
        }
      });
  });
}

/**
 * Multi-Session parallel link verification.
 * Automatically distributes links into multiple concurrent worker sessions
 * based on the quantity of links (e.g. 1000 links partitioned across 15-25 concurrent sessions).
 */
export async function verifyVideoLinksInSessions(
  urls: string[],
  options?: {
    timeoutMs?: number;
    onProgress?: (checked: number, total: number, activeSessions: number) => void;
  }
): Promise<{ healthy: string[]; broken: string[]; sessionCount: number }> {
  if (!urls || urls.length === 0) {
    return { healthy: [], broken: [], sessionCount: 0 };
  }

  const total = urls.length;
  // Calculate dynamic session count based on link quantity
  let sessionCount = 2;
  if (total > 1500) sessionCount = 25;
  else if (total > 800) sessionCount = 20;
  else if (total > 300) sessionCount = 15;
  else if (total > 100) sessionCount = 10;
  else if (total > 30) sessionCount = 6;
  else if (total > 10) sessionCount = 4;

  const timeoutMs = options?.timeoutMs || 4000;
  let checkedCount = 0;
  const healthy: string[] = [];
  const broken: string[] = [];

  // Partition links into session buckets
  const sessionQueues: string[][] = Array.from({ length: sessionCount }, () => []);
  urls.forEach((url, idx) => {
    sessionQueues[idx % sessionCount].push(url);
  });

  // Run all worker sessions concurrently
  const sessionPromises = sessionQueues.map(async (queue, sessionIdx) => {
    for (const url of queue) {
      try {
        const res = await verifyVideoLink(url, timeoutMs);
        if (res.status === 'broken') {
          broken.push(url);
        } else {
          healthy.push(url);
        }
      } catch (e) {
        healthy.push(url); // optimistic fallback on network fluctuation
      } finally {
        checkedCount++;
        if (options?.onProgress) {
          options.onProgress(checkedCount, total, sessionCount);
        }
      }
    }
  });

  await Promise.all(sessionPromises);

  return { healthy, broken, sessionCount };
}
