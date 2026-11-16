// One-off: back up then delete the test data in jobs / extraParts / fixtures.
// Departments, employees and users are NOT touched.
// Usage: node scripts/legacy/wipe-test-data.mjs <backupDir> [--delete]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './db.mjs';

const [backupDir, flag] = process.argv.slice(2);
if (!backupDir) throw new Error('backupDir required');
mkdirSync(backupDir, { recursive: true });

const COLS = ['jobs', 'extraParts', 'fixtures'];
const dump = {};
for (const c of COLS) {
  const snap = await db.collection(c).get();
  dump[c] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`${c}: ${snap.size}`);
}
const file = join(backupDir, `firestore-backup-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(file, JSON.stringify(dump, null, 1));
console.log('backup ->', file);

if (flag === '--delete') {
  for (const c of COLS) {
    const snap = await db.collection(c).get();
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = db.batch();
      snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`deleted ${snap.size} from ${c}`);
  }
}
