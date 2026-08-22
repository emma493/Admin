/**
 * ffmpeg pipeline: source file -> small HLS ladder (2 renditions) + a
 * hand-written master playlist + a poster JPEG.
 *
 * fluent-ffmpeg doesn't have a clean one-call API for a multi-variant HLS
 * playlist, so this runs ffmpeg once per rendition (each producing its own
 * variant playlist + segments) and then writes the master.m3u8 by hand,
 * which is the standard approach for a small fixed ladder like this.
 */
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

// Short-form clips (10-30s) don't need YouTube's 5-rung ladder, and 2s
// segments (vs. the usual 6s default) mean the player has something
// playable almost immediately relative to the clip's total length.
const DEFAULT_RENDITIONS = [
  { name: '360p', height: 360, videoBitrate: '600k', audioBitrate: '96k', bandwidth: 700_000 },
  { name: '720p', height: 720, videoBitrate: '1800k', audioBitrate: '128k', bandwidth: 1_950_000 },
];
const SEGMENT_SECONDS = 2;

function runOne(inputPath, outDir, rendition) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });
    const playlistPath = path.join(outDir, 'playlist.m3u8');
    const segmentPattern = path.join(outDir, 'seg_%03d.ts');

    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate(rendition.audioBitrate)
      .videoBitrate(rendition.videoBitrate)
      .size(`?x${rendition.height}`)
      .autopad(false)
      .outputOptions([
        '-preset veryfast',
        '-profile:v main',
        '-sc_threshold 0',
        // Keyframe every segment boundary so each .ts is independently seekable.
        `-g ${SEGMENT_SECONDS * 30}`,
        `-keyint_min ${SEGMENT_SECONDS * 30}`,
        '-hls_time ' + SEGMENT_SECONDS,
        '-hls_playlist_type vod',
        '-hls_flags independent_segments',
        `-hls_segment_filename ${segmentPattern}`,
      ])
      .output(playlistPath)
      .on('error', (err) => reject(new Error(`ffmpeg failed for ${rendition.name}: ${err.message}`)))
      .on('end', () => resolve())
      .run();
  });
}

function writeMasterPlaylist(outDir, renditions) {
  // RESOLUTION is intentionally omitted: actual width depends on each
  // source clip's aspect ratio (short-form content here is usually
  // portrait, scaled by height only via `?x${height}`), so only the true
  // height is known ahead of time. BANDWIDTH alone is sufficient for
  // hls.js (and any spec-compliant HLS player) to pick a starting
  // rendition and switch between them.
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const r of renditions) {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth}`);
    lines.push(`${r.name}/playlist.m3u8`);
  }
  fs.writeFileSync(path.join(outDir, 'master.m3u8'), lines.join('\n') + '\n');
}

/**
 * Transcodes `inputPath` into `outDir/{rendition}/playlist.m3u8` +
 * `outDir/master.m3u8`. Renditions run sequentially (not in parallel) to
 * keep peak memory/CPU predictable inside the function's resource limits.
 */
async function runHlsTranscode(inputPath, outDir, { renditions = DEFAULT_RENDITIONS } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const rendition of renditions) {
    await runOne(inputPath, path.join(outDir, rendition.name), rendition);
  }
  writeMasterPlaylist(outDir, renditions);
}

/** Grabs a single frame ~0.5s in as a poster/thumbnail image. */
function generatePoster(inputPath, outDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });
    ffmpeg(inputPath)
      .seekInput('00:00:00.5')
      .outputOptions(['-vframes 1', '-q:v 3'])
      .output(path.join(outDir, 'poster.jpg'))
      .on('error', (err) => reject(new Error(`Poster generation failed: ${err.message}`)))
      .on('end', () => resolve())
      .run();
  });
}

module.exports = { runHlsTranscode, generatePoster, DEFAULT_RENDITIONS };
