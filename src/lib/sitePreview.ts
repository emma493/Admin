import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

export const SITE_CONFIG_COLLECTION = 'site_config';
export const OG_PREVIEW_DOC = 'og_preview';

export interface OgPreviewData {
  /** Original photo URL pasted in Admin (bake source only, never hotlinked publicly). */
  sourceUrl: string;
  /** Fully composited 1200x630 thumbnail (play button + duration pill) as dataURL. */
  imageData: string;
  /** Fake duration pill text, e.g. "2:56". */
  duration: string;
  updatedAt: unknown;
}

/**
 * Live-subscribe to the global link-preview thumbnail.
 * Single-doc listener — no composite index, negligible Firestore reads.
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
      if (!data.imageData || !data.sourceUrl) {
        onData(null);
        return;
      }
      onData({
        sourceUrl: data.sourceUrl || '',
        imageData: data.imageData || '',
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
 * Publish a new global preview. No Firebase Storage involved (Spark-plan
 * safe): the Admin browser bakes the play button + duration pill into pixels
 * via canvas, and the resulting JPEG dataURL (~100-250KB) is stored inline.
 * The Cloudflare edge function serves those bytes as /og-preview.png.
 */
export async function saveOgPreview(input: {
  sourceUrl: string;
  imageData: string;
  duration: string;
}): Promise<void> {
  if (!input.sourceUrl.trim()) throw new Error('Photo URL is required');
  if (!input.imageData.startsWith('data:image/')) throw new Error('Baked image data is missing');
  // Guard the 1MB Firestore doc limit: 1200x630 JPEG q0.82 is ~100-250KB,
  // base64 inflates ~33%. Refuse anything near the ceiling.
  if (input.imageData.length > 950_000) {
    throw new Error('Baked image is too large — try a smaller/darker photo.');
  }
  const ref = doc(db, SITE_CONFIG_COLLECTION, OG_PREVIEW_DOC);
  await setDoc(
    ref,
    {
      sourceUrl: input.sourceUrl.trim(),
      imageData: input.imageData,
      duration: input.duration.trim(),
      width: 1200,
      height: 630,
      contentType: 'image/jpeg',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
