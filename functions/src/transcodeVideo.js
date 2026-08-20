/**
 * transcodeVideo - Firestore-triggered background transcode pipeline.
 *
 * Why a Firestore trigger and not a Storage trigger: the admin dashboard
 * never uploads a file - it saves a `direct_url` pointing at a video hosted
 * elsewhere (Google Drive, a CDN link, etc, via extractLinksFromString).
 * There is no Storage upload event to hook. Instead this triggers on the
 * Firestore write itself and fetches `direct_url` as its first step.
 *
 *   Admin saves/edits direct_url
 *           |  Firestore write on videos/{videoId}
 *           v
 *   this function: download -> ffmpeg HLS transcode -> upload to Storage
 *           v
 *   videos/{videoId}.status = "ready", .hls_url, .poster_url
 *           v
 *   public frontend's hls.js reads hls_url and adaptively switches quality
 *
 * direct_url is left untouched throughout and is never removed - it's the
 * fallback the frontend already knows how to play while a transcode is
 * pending, and the safety net if a transcode ever fails.
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { downloadWithGuardrails } = require('./download');
const { runHlsTranscode, generatePoster } = require('./transcode');
const { uploadDirectory, publicDownloadUrl } = require('./upload');

// This project uses a named Firestore database, not "(default)" - both the
// trigger registration below and the Admin SDK client inside the handler
// have to target it explicitly, or the function will simply never fire.
// Matches firebase-applet-config.json's `firestoreDatabaseId`.
const DATABASE_ID = 'ai-studio-shortxxadmindash-86192a98-919e-436c-80b9-836d96e0e32b';
const STORAGE_BUCKET = 'gen-lang-client-0947623046.firebasestorage.app';

const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024; // 200MB - generous for a 10-30s clip
const DOWNLOAD_TIMEOUT_MS = 120_000;

if (getApps().length === 0) {
  initializeApp();
}

function db() {
  return getFirestore(getApps()[0], DATABASE_ID);
}

/**
 * Decide whether this write should kick off a (re)transcode.
 *   - New doc, or direct_url changed -> yes, always.
 *   - Doc has never been processed (no `status` field yet, e.g. a video
 *     created before this pipeline existed) -> yes, once.
 *   - Anything else (is_active toggle, views increment, our own
 *     status/hls_url/poster_url writes further down this same function)
 *     -> no. This is also what keeps the function from re-triggering
 *     itself in a loop off of its own status updates.
 */
function shouldProcess(before, after) {
  if (!after || !after.direct_url) return false;
  const urlChanged = (before?.direct_url || null) !== after.direct_url;
  const neverProcessed = !after.status;
  return urlChanged || neverProcessed;
}

exports.transcodeVideo = onDocumentWritten(
  {
    document: 'videos/{videoId}',
    database: DATABASE_ID,
    region: 'us-central1',
    memory: '2GiB',
    cpu: 2,
    timeoutSeconds: 300,
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!shouldProcess(before, after)) return;

    const videoId = event.params.videoId;
    const firestore = db();
    const docRef = firestore.collection('videos').doc(videoId);
    const targetUrl = after.direct_url;

    // Claim the job atomically so a duplicate delivery of the same event
    // (Firestore triggers are at-least-once) doesn't run two transcodes
    // for the same write in parallel.
    const claimed = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const current = snap.data();
      if (!current || current.direct_url !== targetUrl) return false; // stale event, doc moved on
      if (current.status === 'processing') return false; // already claimed
      tx.set(
        docRef,
        { status: 'processing', status_error: FieldValue.delete() },
        { merge: true }
      );
      return true;
    });
    if (!claimed) return;

    // Version-stamp the Storage path for this transcode run. Segments and
    // playlists are served with far-future immutable Cache-Control (see
    // upload.js), so if an admin later edits direct_url and this function
    // re-runs, writing to a *new* path (rather than overwriting the old
    // one) avoids serving stale cached segments from underneath a
    // still-changing manifest at the CDN edge.
    const version = Date.now();
    const destPrefix = `hls/${videoId}/${version}`;

    const tmpIn = path.join(os.tmpdir(), `${videoId}-${version}-in`);
    const tmpOutDir = path.join(os.tmpdir(), `${videoId}-${version}-hls`);

    try {
      logger.info(`[transcodeVideo] ${videoId}: fetching ${targetUrl}`);
      await downloadWithGuardrails(targetUrl, tmpIn, {
        maxBytes: MAX_DOWNLOAD_BYTES,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
      });

      logger.info(`[transcodeVideo] ${videoId}: transcoding`);
      await runHlsTranscode(tmpIn, tmpOutDir);
      await generatePoster(tmpIn, tmpOutDir);

      logger.info(`[transcodeVideo] ${videoId}: uploading to gs://${STORAGE_BUCKET}/${destPrefix}`);
      const bucket = getStorage().bucket(STORAGE_BUCKET);
      await uploadDirectory(bucket, tmpOutDir, destPrefix);

      const hlsUrl = publicDownloadUrl(STORAGE_BUCKET, `${destPrefix}/master.m3u8`);
      const posterUrl = publicDownloadUrl(STORAGE_BUCKET, `${destPrefix}/poster.jpg`);

      // Re-check the doc hasn't moved on to a newer direct_url while this
      // run was in flight before writing "ready" - if it has, a newer
      // invocation owns the doc now and this result is stale.
      await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const current = snap.data();
        if (!current || current.direct_url !== targetUrl) return;
        tx.set(
          docRef,
          {
            status: 'ready',
            hls_url: hlsUrl,
            poster_url: posterUrl,
            status_error: FieldValue.delete(),
          },
          { merge: true }
        );
      });
      logger.info(`[transcodeVideo] ${videoId}: ready`);
    } catch (err) {
      logger.error(`[transcodeVideo] ${videoId}: failed - ${err.message}`, err);
      // The video keeps serving from direct_url the whole time - nothing
      // goes offline just because a background transcode failed. If a
      // previous run already produced a working hls_url, leave it in place
      // rather than clearing it out from under viewers.
      await docRef.set(
        { status: 'failed', status_error: String(err.message || err).slice(0, 500) },
        { merge: true }
      );
    } finally {
      fs.rmSync(tmpIn, { force: true });
      fs.rmSync(tmpOutDir, { recursive: true, force: true });
    }
  }
);
