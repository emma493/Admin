<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/86192a98-919e-436c-80b9-836d96e0e32b

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploying

This repo now has two independent deployables:

1. **Admin dashboard (this app)** → Netlify, as before. `npm run build` produces
   `dist/`, which `netlify.toml` already points at. No change needed here.
2. **`functions/`** → Firebase Cloud Functions (2nd gen), a *new* piece of
   infrastructure that powers adaptive (multi-bitrate) HLS playback for the
   public site, without adding any third-party video CDN. See
   [`functions/README.md`](functions/README.md) for what it does and how to
   deploy it.

Deploy the function once (from this directory, with the [Firebase CLI](https://firebase.google.com/docs/cli) installed and `firebase login` run):

```bash
firebase deploy --only functions,firestore:rules,storage
```

This also pushes `storage.rules` (public read for the generated HLS files
under `hls/**`) and re-applies `firestore.rules` (unchanged). The public
Cloudflare Pages site needs no deploy step of its own for this feature - the
`shortieshub_app_fix` frontend already knows how to read the new fields
(`hls_url`, `poster_url`, `status`) once they start showing up on `videos/*`
docs, and gracefully keeps using `direct_url` for anything not processed
yet.

