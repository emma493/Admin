/**
 * Downloads a source video from an arbitrary admin-supplied `direct_url` to
 * local disk, with guardrails so a bad or huge link can't hang the function
 * or blow through its memory/time budget.
 *
 * This is deliberately NOT a reuse of the browser-only `verifyVideoLink`
 * helper in the admin dashboard's videoUtils.ts - that function relies on
 * `fetch(..., { mode: 'no-cors' })` and `document.createElement('video')`,
 * both of which are browser/DOM APIs that don't exist in the Cloud
 * Functions Node runtime. This is a from-scratch server-side equivalent.
 */
const fs = require('fs');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const MAX_REDIRECTS = 5;

/**
 * Rewrites well-known "share page" URLs (currently just Google Drive) into
 * their direct-download form. `extractLinksFromString` in the admin
 * dashboard already accepts Google Drive links as-is, but a Drive
 * `/file/d/{id}/view` URL serves an HTML viewer page, not the raw file - an
 * unmodified fetch would download a few KB of HTML instead of the video.
 */
function resolveDownloadUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === 'drive.google.com' || url.hostname === 'docs.google.com') {
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
      const id = fileMatch ? fileMatch[1] : url.searchParams.get('id');
      if (id) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
      }
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

/**
 * Streams `sourceUrl` to `destPath`, enforcing:
 *  - only http/https protocols
 *  - a hard timeout on the whole download
 *  - a hard byte cap, checked against Content-Length up front AND enforced
 *    while streaming (in case the header is missing or lies)
 *  - a bounded number of redirect hops
 *
 * Throws with a descriptive message on any guardrail violation or network
 * failure - the caller is expected to catch this and write
 * `status: "failed"` to Firestore rather than let the function crash.
 */
async function downloadWithGuardrails(sourceUrl, destPath, { maxBytes, timeoutMs }) {
  let currentUrl = resolveDownloadUrl(sourceUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    for (let hop = 0; ; hop++) {
      if (hop > MAX_REDIRECTS) {
        throw new Error(`Too many redirects (>${MAX_REDIRECTS}) resolving source URL`);
      }

      const parsed = new URL(currentUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
      }

      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Some hosts (and Google Drive in particular) reject requests
          // with no User-Agent at all.
          'User-Agent': 'Mozilla/5.0 (compatible; ShortxxTranscoder/1.0; +https://firebase.google.com/)',
          Accept: '*/*',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Redirect response (${response.status}) missing Location header`);
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      break;
    }

    if (!response.ok) {
      throw new Error(`Source responded with HTTP ${response.status} ${response.statusText}`);
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) {
      throw new Error(
        `Source file is ${(declaredLength / (1024 * 1024)).toFixed(1)}MB, over the ${(
          maxBytes /
          (1024 * 1024)
        ).toFixed(0)}MB limit`
      );
    }

    if (!response.body) {
      throw new Error('Source response had no readable body');
    }

    // Enforce the byte cap while streaming too, since Content-Length can be
    // absent or wrong (chunked responses, misconfigured hosts, etc).
    let received = 0;
    const capped = new TransformStreamByteCounter(maxBytes, (n) => {
      received = n;
    });

    const nodeReadable = Readable.fromWeb(response.body);
    await pipeline(nodeReadable, capped, fs.createWriteStream(destPath));

    if (received === 0) {
      throw new Error('Downloaded file was empty');
    }

    return { bytes: received, resolvedUrl: currentUrl };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Download timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A tiny Transform stream that throws once more than `maxBytes` has passed
 * through it, and reports the running total via `onProgress`.
 */
function TransformStreamByteCounter(maxBytes, onProgress) {
  let total = 0;
  return new Transform({
    transform(chunk, _enc, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new Error(`Download exceeded ${(maxBytes / (1024 * 1024)).toFixed(0)}MB limit mid-stream`));
        return;
      }
      onProgress(total);
      callback(null, chunk);
    },
  });
}

module.exports = { downloadWithGuardrails, resolveDownloadUrl };
