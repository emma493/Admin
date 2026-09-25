# Shortxx Admin

Internal dashboard for managing the `shortxx.live` short-video feed.
React 19 + Vite 6 + Tailwind 4 + Firebase (project `shortxx-live`).

## What it does

- **Videos** — add direct stream links (bulk paste supported), verify link
  health (auto-purge broken), scan/remove duplicates, toggle `is_active`,
  test-play preview, batch copy/delete. Views + likes columns mirror the
  public site's live counters.
- **Analytics** — total / 24h views, likes, HLS adoption, top videos,
  live event breakdown from the `events` collection.
- **Pipeline** — HLS transcode status per video (`ready / processing /
  failed / legacy`) written by `functions/src/transcodeVideo.js`.
  Admin never writes these fields.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint     # tsc --noEmit
npm run build    # -> dist/
```

## Deploy

Two independent deployables from this directory:

1. **Dashboard (this SPA)** → Netlify. `npm run build` produces `dist/`,
   which `netlify.toml` points at. `_redirects` keeps client routing working.
2. **`functions/`** → Firebase Cloud Functions 2nd gen (nodejs20) for
   adaptive multi-bitrate HLS. See [`functions/README.md`](functions/README.md):

```bash
firebase deploy --only functions,firestore:rules,storage
```

## Data contract (shared with the public site — do not break unilaterally)

Firestore default DB on `shortxx-live`, collection `videos`:

```
direct_url / hls_url / poster_url / is_active / status / views / likes
```

`saveVideoDoc` uses `merge: true` and never touches `likes`, `views`,
or pipeline fields. The public site prefers `hls_url` when
`status === 'ready'`, else `direct_url`.

Team rule: this repo is owned by the Admin session; `shortxx.live/`
(public site) is owned by the other session. Coordinate via
`../AI/MEMORY.md` (append-only).
