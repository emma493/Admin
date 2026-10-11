import { doc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { db, VIDEOS_COLLECTION } from './firebase';
import type { VideoDocument } from '../types';

/**
 * Duplicate-video helpers (silent auto-removal).
 *
 * Two docs are duplicates ONLY when their trimmed direct_urls match exactly
 * (fragment stripped). Query strings are significant — CDN signed URLs for
 * different tokens must never merge — so same-path-different-query pairs are
 * left alone (see urlPathKey for passive counting).
 */

/** Exact-match key: trim + strip fragment. Empty string = unusable URL. */
export function normalizeVideoUrl(url: string): string {
  const t = (url || '').trim();
  if (!t) return '';
  return t.split('#')[0];
}

/** Coarse key for passive near-duplicate counting (same file, different link). */
export function urlPathKey(url: string): string {
  return normalizeVideoUrl(url).split('?')[0];
}

/** Tolerant created_at compare (Timestamp | Date | number | missing). */
export function createdAtMillis(ts: VideoDocument['created_at']): number {
  try {
    const m = (ts as { toMillis?: () => number } | null)?.toMillis?.();
    if (typeof m === 'number') return m;
    const t = ts instanceof Date ? ts.getTime() : new Date(ts as never).getTime();
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

/** Group videos by exact normalized URL. */
export function groupDuplicates(videos: VideoDocument[]): Map<string, VideoDocument[]> {
  const groups = new Map<string, VideoDocument[]>();
  for (const v of videos) {
    const key = normalizeVideoUrl(v.direct_url);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(v);
    else groups.set(key, [v]);
  }
  return groups;
}

/** Oldest doc survives (deterministic ID tiebreak); the rest are victims. */
export function pickSurvivor(group: VideoDocument[]): {
  survivor: VideoDocument;
  victims: VideoDocument[];
} {
  const sorted = [...group].sort(
    (a, b) =>
      createdAtMillis(a.created_at) - createdAtMillis(b.created_at) ||
      (a.id < b.id ? -1 : 1)
  );
  return { survivor: sorted[0], victims: sorted.slice(1) };
}

/**
 * Fold one victim into its survivor: add the victim's views/likes via
 * atomic increments (survivor's creator/caption/HLS fields untouched),
 * then delete the victim. Merge-before-delete so a crash can't lose counters.
 */
export async function mergeDuplicateVictim(
  survivorId: string,
  victim: VideoDocument
): Promise<{ views: number; likes: number }> {
  const views = typeof victim.views === 'number' ? victim.views : 0;
  const likes = typeof victim.likes === 'number' ? victim.likes : 0;
  await updateDoc(doc(db, VIDEOS_COLLECTION, survivorId), {
    views: increment(views),
    likes: increment(likes),
  });
  await deleteDoc(doc(db, VIDEOS_COLLECTION, victim.id));
  return { views, likes };
}
