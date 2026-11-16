// One-off: for jobs imported from Access, move the Access status note from
// Production Notes into Daily Notes (`notes`).
// Usage: node scripts/legacy/move-notes.mjs [--write]
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './db.mjs';

const write = process.argv[2] === '--write';
const snap = await db.collection('jobs').where('source', '==', 'access-master').get();
let n = 0;
for (const d of snap.docs) {
  const j = d.data();
  if (!j.productionNotes) continue;
  const notes = [j.productionNotes, j.notes].filter(Boolean).join(' | ');
  console.log(`${j.jobNumber}: notes="${j.notes ?? ''}" prod="${j.productionNotes}" -> notes="${notes}"`);
  if (write) {
    await d.ref.update({ notes, productionNotes: FieldValue.delete(), updatedAt: new Date().toISOString() });
  }
  n++;
}
console.log(`${write ? 'updated' : 'would update'} ${n} of ${snap.size}`);
