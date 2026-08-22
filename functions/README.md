# `transcodeVideo` Cloud Function

Server-side adaptive-bitrate (HLS) pipeline for shortxx, built entirely on
your existing stack - **no Cloudflare Stream / Mux / Bunny or any other
paid video CDN product**. See the research doc you already have for the
full reasoning; this is the implementation of that proposal, made to fit
this project's *actual* setup (a named Firestore database, a paste-a-link
admin flow rather than a file upload) rather than the generic sketch.

## What it does

```
Admin pastes/saves a direct_url in the dashboard
        |
        v
Firestore  videos/{videoId}.direct_url written
        |  (this function triggers on that write)
        v
Cloud Function (2nd gen, ffmpeg)
        |  1. downloads direct_url with guardrails (size cap, timeout,
        |     redirect limit, Google Drive share-link resolution)
        |  2. transcodes to a 2-rung HLS ladder (360p/720p) + poster frame
        v
Firebase Storage  hls/{videoId}/{version}/{master.m3u8, 360p/, 720p/, poster.jpg}
        |
        v
Firestore  videos/{videoId}.status = "ready", .hls_url, .poster_url
        |
        v
Public frontend's hls.js reads hls_url, adapts quality to real throughput
```

`direct_url` is never modified or removed - it's what the frontend already
falls back to while a video is mid-transcode, or if a transcode ever fails.
Nothing goes offline because of this pipeline; it only adds a better
playback path on top.

## Why a Firestore trigger, not a Storage trigger

The admin dashboard doesn't upload files - `saveVideoDoc` just writes a
`direct_url` string. There's no Storage upload event to hook, so this
listens to the Firestore write on `videos/{videoId}` instead, and fetches
`direct_url` itself as the first step.

## Deploying

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,storage,firestore:rules
```

First-time setup also needs the **Blaze (pay-as-you-go) plan** enabled on
the Firebase project - Cloud Functions 2nd gen requires it. Cost is
per-invocation compute + Storage, no separate video-CDN line item.

## Operational notes

- **Named Firestore database**: this project's Firestore data does *not*
  live in `(default)` - it's the database ID from
  `firebase-applet-config.json` (`firestoreDatabaseId`). Both the trigger
  registration and the Admin SDK client inside the function target that ID
  explicitly (`DATABASE_ID` in `src/transcodeVideo.js`). If you ever
  migrate to a different database, update that one constant.
- **Storage bucket**: also pinned explicitly (`STORAGE_BUCKET`) to the
  bucket in `firebase-applet-config.json`, rather than relying on the
  Admin SDK's "default bucket" inference.
- **Idempotency**: Firestore triggers are at-least-once, so the function
  claims each job via a Firestore transaction before doing any heavy work,
  to avoid two invocations transcoding the same write in parallel.
- **Cache-safe re-processing**: if an admin edits `direct_url` on an
  existing video, the new HLS output is written to a *new*, timestamp-
  versioned Storage path (`hls/{videoId}/{version}/...`) rather than
  overwriting the old one in place. Combined with the far-future
  `Cache-Control: immutable` header on segments (see `src/upload.js`),
  this avoids ever serving a stale cached segment against a manifest that
  has since changed.
- **Failure handling**: on any error (dead link, host blocks server-side
  fetches, transcode failure, oversized file, etc.) the doc gets
  `status: "failed"` and `status_error` with a short message - visible in
  the admin dashboard's "HLS / ABR" column. If a *previous* run had already
  produced a working `hls_url`, a failed re-transcode attempt leaves it in
  place rather than clearing it.
- **Guardrails on the fetch step**: `direct_url` can be any host an admin
  pastes. `src/download.js` caps the download at 200MB, times out after
  120s, follows at most 5 redirects, and rewrites Google Drive "view" share
  links into their direct-download form. Very large Drive files behind the
  virus-scan interstitial page aren't specially handled beyond that - the
  size cap makes this an edge case rather than a common one for 10-30s
  clips.

## Local testing

The Cloud Functions emulator can run this against a local Firestore/Storage
emulator (`firebase emulators:start --only functions,firestore,storage`),
but note the named-database + real-bucket wiring above means you'll want to
point `DATABASE_ID`/`STORAGE_BUCKET` at emulator equivalents (or just test
against a real dev project) rather than assuming emulator defaults.
