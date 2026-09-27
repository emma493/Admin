import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app, db, CREATORS_COLLECTION, handleFirestoreError, OperationType } from './firebase';
import type { CreatorDocument } from '../types';

const storage = getStorage(app);

/** Creator group badge shared by the Creators + Upload pages.
 * Explicit owner choice always wins; otherwise video-majority decides
 * (exact ties read as Girls); no data means no badge. */
export type CreatorBadge = 'Girls' | 'Couples' | null;

export function resolveCreatorBadge(
  explicit: 'girls' | 'couples' | undefined,
  girls: number,
  couples: number
): CreatorBadge {
  if (explicit === 'girls') return 'Girls';
  if (explicit === 'couples') return 'Couples';
  if (girls === 0 && couples === 0) return null;
  return girls >= couples ? 'Girls' : 'Couples';
}

export function subscribeToCreators(
  onData: (creators: CreatorDocument[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, CREATORS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: CreatorDocument[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          username: data.username || 'Unnamed',
          avatarUrl: data.avatarUrl || '',
          is_active: typeof data.is_active === 'boolean' ? data.is_active : true,
          category: data.category === 'girls' || data.category === 'couples' ? data.category : undefined,
          created_at: data.created_at || new Date(),
        };
      });
      items.sort((a, b) => {
        const tA = (a.created_at as any)?.toMillis?.() ?? new Date(a.created_at as any).getTime() ?? 0;
        const tB = (b.created_at as any)?.toMillis?.() ?? new Date(b.created_at as any).getTime() ?? 0;
        return tB - tA;
      });
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, CREATORS_COLLECTION);
      if (onError) onError(err);
    }
  );
}

export async function uploadCreatorAvatar(file: File, creatorId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const avatarRef = ref(storage, `creators/${creatorId}/avatar.${ext}`);
  await uploadBytes(avatarRef, file, { contentType: file.type });
  return getDownloadURL(avatarRef);
}

export async function saveCreatorDoc(data: {
  id?: string;
  username: string;
  avatarUrl?: string;
  category?: 'girls' | 'couples';
}): Promise<string> {
  const username = data.username.trim();
  if (!username) throw new Error('Username is required');
  const docRef = data.id
    ? doc(db, CREATORS_COLLECTION, data.id)
    : doc(collection(db, CREATORS_COLLECTION));
  const payload: Record<string, unknown> = {
    username,
    avatarUrl: data.avatarUrl || '',
    is_active: true,
  };
  // Only written when explicitly chosen — legacy docs without a group stay untouched.
  if (data.category === 'girls' || data.category === 'couples') {
    payload.category = data.category;
  }
  // Only stamp created_at on create — edits must not reset the join date.
  if (!data.id) {
    payload.created_at = serverTimestamp();
  }
  await setDoc(docRef, payload, { merge: true });
  return docRef.id;
}

export async function deleteCreatorDoc(id: string): Promise<void> {
  await deleteDoc(doc(db, CREATORS_COLLECTION, id));
}
