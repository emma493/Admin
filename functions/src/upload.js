/**
 * Uploads every file under a local directory to Firebase Storage, preserving
 * the relative folder structure, with content types and Cache-Control set
 * per file type so Cloudflare's ordinary free CDN caching can do its job on
 * the static .m3u8/.ts/.jpg output.
 */
const fs = require('fs');
const path = require('path');

function contentTypeFor(filePath) {
  if (filePath.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (filePath.endsWith('.ts')) return 'video/mp2t';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function cacheControlFor(filePath) {
  // Segments and variant playlists never change once written (each
  // transcode run writes to a fresh version-stamped path - see
  // transcodeVideo.js), so they're safe to cache aggressively at the edge.
  // The master playlist just lists filenames within that same immutable
  // path, so it's equally safe to cache long-term.
  return 'public, max-age=31536000, immutable';
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/**
 * Uploads all files under `localDir` to `bucket` under `destPrefix`,
 * returning the list of uploaded Storage paths.
 */
async function uploadDirectory(bucket, localDir, destPrefix) {
  const files = walk(localDir);
  const uploaded = [];

  for (const filePath of files) {
    const relative = path.relative(localDir, filePath).split(path.sep).join('/');
    const destination = `${destPrefix}/${relative}`;

    await bucket.upload(filePath, {
      destination,
      metadata: {
        contentType: contentTypeFor(filePath),
        cacheControl: cacheControlFor(filePath),
      },
    });
    uploaded.push(destination);
  }

  return uploaded;
}

/**
 * Builds a public Firebase Storage download URL for a path, gated by
 * storage.rules (see storage.rules - reads under hls/** are public, writes
 * are Admin-SDK-only) rather than by object ACLs. This works regardless of
 * whether the bucket has uniform bucket-level access enabled, unlike
 * `file.makePublic()`, which fails outright on buckets with that setting.
 */
function publicDownloadUrl(bucketName, storagePath) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    storagePath
  )}?alt=media`;
}

module.exports = { uploadDirectory, publicDownloadUrl };
