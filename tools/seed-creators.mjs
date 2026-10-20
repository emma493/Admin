// tools/seed-creators.mjs — one-shot bulk create of the 15 starter
// creators (all girls) in Firestore `creators`.
//
// Run from the Admin folder (needs network + the repo's firebase dep):
//     cd Admin && node tools/seed-creators.mjs
//
// Idempotent: deterministic doc IDs (seed-girls-01…seed-girls-15) with
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

function explain(err) {
  const msg = String((err && err.message) || err);
  if (/database was deleted/i.test(msg)) {
    return (
      'The (default) Firestore database does not exist on project ' +
      `"${firebaseConfig.projectId}". Open Firebase console → Firestore Database ` +
      `and check the database dropdown at the top: it must list "(default)". ` +
      `If you created a NAMED database instead, either create (default) too, ` +
      `or tell me its exact ID so the seed targets it.`
    );
  }
  if (/permission|denied/i.test(msg)) {
    return 'Writes rejected: deploy the open firestore.rules (Admin/firestore.rules) and republish, then rerun.';
  }
  return msg;
}

let ok = 0;
try {
  for (const s of seeds) {
    if (!s.id || !s.username || s.category !== 'girls') {
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
} catch (err) {
  console.error('\nFAILED after ' + ok + ' writes.');
  console.error(explain(err));
  process.exitCode = 1;
  process.exit(1);
}

console.log(`\nDone: ${ok}/${seeds.length} creator docs written.`);
console.log('Link videos via creatorId = doc ID (e.g. creatorId: "seed-girls-01").');
