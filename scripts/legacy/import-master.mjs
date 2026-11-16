// One-off: import the Access MASTER table (exported to JSON by
// master_dryrun.ps1) into Firestore.
//   - Active jobs with a 2026+ due date -> `jobs` (the board), in NEW MATERIAL.
//   - Everything else -> `jobHistory` (searchable archive, not loaded by the board).
// Usage: node scripts/legacy/import-master.mjs <master_export.json> [--write]
import { readFileSync } from 'node:fs';
import { db } from './db.mjs';

const [file, flag] = process.argv.slice(2);
const write = flag === '--write';
const rows = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));

const BOARD_DEPT = 'd1';
const now = new Date().toISOString();
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
const norm = (v) => String(v ?? '').trim().toLowerCase();
const mdY = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
};
// Prefixes (3+ chars) of JOB#, DWG# and Part# so the inventory lookup can
// match with a single array-contains query.
function searchKeys(r) {
  const keys = new Set();
  for (const v of [r.jobNumber, r.dwgNumber, r.partNumber]) {
    const s = norm(v);
    if (!s) continue;
    for (let i = Math.min(3, s.length); i <= s.length; i++) keys.add(s.slice(0, i));
  }
  return [...keys];
}

const board = [];
const history = [];
for (const r of rows) {
  if (!r.jobNumber && !r.name && !r.customer) continue; // blank Access rows
  const legacy = r.legacy || {};
  const status = legacy.status;
  delete legacy.status;
  const base = {
    jobNumber: r.jobNumber,
    name: r.name,
    customer: r.customer,
    poNumber: r.poNumber,
    line: r.line,
    quantity: r.quantity,
    dwgNumber: r.dwgNumber,
    partNumber: r.partNumber,
    dueDate: r.dueDate,
    orderDate: r.orderDate,
    materialPo: r.materialPo,
    heatNumber: r.heatNumber,
    hrc: r.hrc,
    outService: r.outService,
    deviation: r.deviation,
    source: 'access-master',
    legacyId: r.legacyId,
  };
  const isBoard = r.legacyActive && (r.dueDate || '') >= '2026-01-01';
  if (isBoard) {
    board.push(clean({
      ...base,
      productionNotes: [status, r.productionNotes].filter(Boolean).join(' | '),
      title: `JOB# ${r.jobNumber}${r.dueDate ? ` / DUE DATE: ${mdY(r.dueDate)}` : ''}`,
      priority: 3,
      departmentId: BOARD_DEPT,
      inProgress: false,
      legacy,
    }));
  } else {
    history.push(clean({
      ...base,
      productionNotes: [status, r.productionNotes].filter(Boolean).join(' | '),
      title: `${r.jobNumber ?? ''} ${r.name ?? ''}`.trim(),
      shipped: true,
      shippedAt: r.shippedAt,
      searchKeys: searchKeys(r),
      legacy,
      importedAt: now,
    }));
  }
}

console.log(`board: ${board.length}  history: ${history.length}  skipped blank: ${rows.length - board.length - history.length}`);
console.log('board JOB#s:', board.map((b) => b.jobNumber).join(', '));
if (!write) process.exit(0);

// Refuse to run twice / on top of existing jobs.
const existingJobs = (await db.collection('jobs').count().get()).data().count;
const existingHist = (await db.collection('jobHistory').count().get()).data().count;
if (existingJobs || existingHist) throw new Error(`Not empty: jobs=${existingJobs} jobHistory=${existingHist}`);

const dept = (await db.collection('departments').doc(BOARD_DEPT).get()).data() || {};
const t0 = Date.now();

board.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
let batch = db.batch();
board.forEach((j, i) => {
  const id = j.legacyId;
  batch.set(db.collection('jobs').doc(id), clean({
    ...j,
    id,
    order: i,
    assignedTo: dept.defaultEmployee || undefined,
    history: [{ id: `${id}-h0`, jobId: id, toDeptId: BOARD_DEPT, notes: '📄 Imported from Access', timestamp: now }],
    createdAt: now,
    updatedAt: now,
  }));
});
await batch.commit();
console.log(`wrote ${board.length} board jobs`);

for (let i = 0; i < history.length; i += 400) {
  batch = db.batch();
  for (const h of history.slice(i, i + 400)) batch.set(db.collection('jobHistory').doc(h.legacyId), { ...h, id: h.legacyId });
  await batch.commit();
  process.stdout.write(`\rhistory ${Math.min(i + 400, history.length)}/${history.length}`);
}
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
