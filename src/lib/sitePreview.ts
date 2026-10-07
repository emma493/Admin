import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

export const SITE_CONFIG_COLLECTION = 'site_config';
export const OG_PREVIEW_DOC = 'og_preview';

export interface OgPreviewData {
  /** Original photo URL pasted in Admin (bake source only, never hotlinked publicly). */
  sourceUrl: string;
  /** Baked 1200x630 thumbnail (play button + duration pill) on Cloudinary CDN. */
  imageUrl: string;
  /** Cloudinary public ID (for future server-side cleanup). */
  publicId: string;
  /** Fake duration pill text, e.g. "2:56". */
  duration: string;
  updatedAt: unknown;
}

/**
 * Live-subscribe to the global link-preview thumbnail.
 * Single-doc listener — no composite index, negligible Firestore reads.
 * Tolerates legacy docs that still carry base64 `imageData` (pre-Cloudinary).
 */
export function subscribeToOgPreview(
  onData: (preview: OgPreviewData | null) => void,
  onError?: (err: Error) => void
) {
  const ref = doc(db, SITE_CONFIG_COLLECTION, OG_PREVIEW_DOC);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      // Legacy (pre-Cloudinary) docs stored baked bytes inline — still usable.
      const legacy = typeof data.imageData === 'string' && data.imageData.startsWith('data:image/');
      const imageUrl = data.imageUrl || (legacy ? data.imageData : '');
      if (!imageUrl || !data.sourceUrl) {
        onData(null);
        return;
      }
      onData({
        sourceUrl: data.sourceUrl || '',
        imageUrl,
        publicId: data.publicId || '',
        duration: data.duration || '',
        updatedAt: data.updatedAt || null,
      });
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `${SITE_CONFIG_COLLECTION}/${OG_PREVIEW_DOC}`);
      if (onError) onError(err);
    }
  );
}

/**
 * Publish a new global preview. The baked pixels already live on Cloudinary
 * (uploaded from the Admin browser via unsigned preset) — Firestore keeps
 * only the CDN URL, a few hundred bytes. The Cloudflare edge function points
 * crawlers' og:image straight at that URL.
 */
export async function saveOgPreview(input: {
  sourceUrl: string;
  imageUrl: string;
  publicId: string;
  duration: string;
}): Promise<void> {
  if (!input.sourceUrl.trim()) throw new Error('Photo URL is required');
  if (!/^https:\/\/res\.cloudinary\.com\//.test(input.imageUrl)) {
    throw new Error('Cloudinary image URL is missing — upload first.');
  }
  const ref = doc(db, SITE_CONFIG_COLLECTION, OG_PREVIEW_DOC);
  await setDoc(
    ref,
    {
      sourceUrl: input.sourceUrl.trim(),
      imageUrl: input.imageUrl,
      publicId: input.publicId || '',
      duration: input.duration.trim(),
      width: 1200,
      height: 630,
      provider: 'cloudinary',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
