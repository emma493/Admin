// tools/seed-creators.mjs — one-shot bulk create of the 30 starter
// creators (15 girls + 15 couples) in Firestore `creators`.
//
// Run from the Admin folder (needs network + the repo's firebase dep):
//     cd Admin && node tools/seed-creators.mjs
//
// Idempotent: deterministic doc IDs (seed-girls-01…/seed-couples-15) with
// merge:true, so re-running never duplicates — it just repairs fields.
// Requires the open firestore.rules to be deployed (reads+writes: true).
// When you later upload videos, link each video's creatorId to the doc ID
// shown in the mapping table printed at the end.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const here = dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(readFileSync(join(here, 'seed-creators.json'), 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let ok = 0;
for (const s of seeds) {
  if (!s.id || !s.username || (s.category !== 'girls' && s.category !== 'couples')) {
    console.warn('SKIP invalid entry:', JSON.stringify(s));
    continue;
  }
  await setDoc(
    doc(db, 'creators', s.id),
    {
      username: s.username,
      avatarUrl: '',
      is_active: true,
      category: s.category,
      created_at: serverTimestamp(),
    },
    { merge: true }
  );
  ok++;
  console.log(`OK ${s.id}  @${s.username}  [${s.category}]`);
}

console.log(`\nDone: ${ok}/${seeds.length} creator docs written.`);
console.log('Link videos via creatorId = doc ID (e.g. creatorId: "seed-girls-01").');
