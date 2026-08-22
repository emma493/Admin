/**
 * Cloud Functions entry point.
 *
 * Deploy with:
 *   firebase deploy --only functions:transcodeVideo
 *
 * This project's frontend (Netlify admin dashboard + Cloudflare Pages public
 * site) stays exactly as-is - this is the only new piece of infrastructure,
 * and it is 100% Firebase native (Cloud Functions 2nd gen + Storage +
 * Firestore), no third-party video CDN involved.
 */
const { setGlobalOptions } = require('firebase-functions/v2');

// Applies to all v2 functions in this codebase unless overridden per-function.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const { transcodeVideo } = require('./src/transcodeVideo');

exports.transcodeVideo = transcodeVideo;
