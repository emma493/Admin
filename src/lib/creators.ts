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
}): Promise<string> {
  const username = data.username.trim();
  if (!username) throw new Error('Username is required');
  const docRef = data.id
    ? doc(db, CREATORS_COLLECTION, data.id)
    : doc(collection(db, CREATORS_COLLECTION));
  await setDoc(
    docRef,
    {
      username,
      avatarUrl: data.avatarUrl || '',
      is_active: true,
      created_at: serverTimestamp(),
    },
    { merge: true }
  );
  return docRef.id;
}

export async function deleteCreatorDoc(id: string): Promise<void> {
  await deleteDoc(doc(db, CREATORS_COLLECTION, id));
}
