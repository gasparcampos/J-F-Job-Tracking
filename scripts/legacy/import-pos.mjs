// Import the Access Purchase Orders (exported by export-pos.ps1) into Firestore,
// and the M-T-R attachments into Firebase Storage.
//
//   node scripts/legacy/import-pos.mjs <export-folder>            dry run (counts only)
//   node scripts/legacy/import-pos.mjs <export-folder> --write    write
//
// Re-runnable: POs are upserted by PO number, so running it again on cut-over
// day with a fresh export only adds / refreshes the Access POs. A PO that was
// created or edited in the app (source "app") is never overwritten.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getStorage } from 'firebase-admin/storage';
import { db } from './db.mjs';
import { kindFromDescription, poTotal, workOrdersOf, employeeLabel } from '../../src/lib/po-shared.ts';

const [dir, flag] = process.argv.slice(2);
const write = flag === '--write';
if (!dir) {
  console.error('usage: node scripts/legacy/import-pos.mjs <export-folder> [--write]');
  process.exit(1);
}
const data = JSON.parse(readFileSync(join(dir, 'pos.json'), 'utf8').replace(/^﻿/, ''));
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const now = new Date().toISOString();

const bucketName =
  process.env.APP_STORAGE_BUCKET ||
  (s(process.env.FIREBASE_STORAGE_BUCKET).endsWith('.firebasestorage.app') ? process.env.FIREBASE_STORAGE_BUCKET : '') ||
  `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
const bucket = getStorage().bucket(bucketName.replace(/^gs:\/\//, ''));

// ---- lookups ----
const employees = arr(data.employees).map((e) => ({
  id: String(e.id),
  firstName: s(e.firstName),
  lastName: s(e.lastName),
  title: s(e.title),
  workPhone: s(e.workPhone),
  extension: s(e.extension),
  email: s(e.email),
}));
const empById = new Map(employees.map((e) => [e.id, e]));
const shipping = arr(data.shippingMethods).map((m) => ({ id: String(m.id), name: s(m.name) }));
const shipById = new Map(shipping.map((m) => [m.id, m]));
const pos = arr(data.purchaseOrders);

// Supplier kind = what most of its POs' descriptions say (NDE / outside
// service / material). Used when a new PO's description doesn't tell.
const votes = new Map();
for (const p of pos) {
  const k = kindFromDescription(s(p.description));
  if (!k) continue;
  const v = votes.get(String(p.supplierId)) ?? { nde: 0, os: 0, none: 0 };
  v[k]++;
  votes.set(String(p.supplierId), v);
}
const supplierKind = (id) => {
  const v = votes.get(id);
  if (!v) return 'none';
  return Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
};
const suppliers = arr(data.suppliers).map((x) => ({
  id: String(x.id),
  name: s(x.name),
  contactName: s(x.contactName),
  contactTitle: s(x.contactTitle),
  address: s(x.address),
  city: s(x.city),
  state: s(x.state),
  postalCode: s(x.postalCode),
  country: s(x.country),
  phone: s(x.phone),
  fax: s(x.fax),
  email: s(x.email),
  paymentTerms: s(x.paymentTerms),
  notes: s(x.notes),
  kind: supplierKind(String(x.id)),
}));
const supById = new Map(suppliers.map((x) => [x.id, x]));

// ---- POs ----
const docs = pos.map((p) => {
  const lines = arr(p.lines).map((l) =>
    clean({
      date: s(l.date),
      units: typeof l.units === 'number' ? l.units : undefined,
      prodDescrip: s(l.prodDescrip),
      spec: s(l.spec),
      rev: s(l.rev),
      partNumber: s(l.partNumber),
      unitPrice: typeof l.unitPrice === 'number' ? l.unitPrice : undefined,
      wo: s(l.wo),
    })
  );
  const supplierId = s(p.supplierId);
  const employeeId = s(p.employeeId);
  const shippingMethodId = s(p.shippingMethodId);
  const workOrders = workOrdersOf(lines);
  return {
    id: String(p.id),
    files: arr(p.mtr),
    doc: {
      poNumber: Number(p.id),
      supplierId,
      supplierName: supById.get(supplierId)?.name ?? '',
      description: s(p.description),
      employeeId,
      employeeName: employeeLabel(empById.get(employeeId)),
      orderDate: s(p.orderDate),
      eta: s(p.eta),
      timeOrder: s(p.timeOrder),
      shippingMethodId,
      shippingMethod: shipById.get(shippingMethodId)?.name ?? '',
      materialCondition: s(p.materialCondition),
      heatNumber: s(p.heatNumber),
      partDwg: s(p.partDwg),
      matType: s(p.matType),
      hotRush: s(p.hotRush),
      active: !!p.active,
      notes: s(p.notes),
      employeeReceived: s(p.employeeReceived),
      receivedDate: s(p.receivedDate),
      status: ['OPEN', 'CLOSED', 'PENDING', 'VOID'].includes(s(p.status).toUpperCase()) ? s(p.status).toUpperCase() : '',
      lines,
      mtr: [],
      workOrders,
      total: Math.round(poTotal(lines) * 100) / 100,
      // POs still out in Access were already handled on the board by hand:
      // mark their WOs as sent so saving them in the app won't move them again.
      sentWos: p.active ? workOrders : [],
      jobMoves: [],
      source: 'access',
      legacy: clean({
        accessTotal: p.total,
        datePromised: s(p.datePromised),
        shipDate: s(p.shipDate),
        freightCharge: p.freightCharge,
        jfPartDwg: s(p.jfPartDwg),
        dwgPartJf: s(p.dwgPartJf),
        purchaseOrderNumber: s(p.poNumberText),
      }),
      createdAt: p.orderDate ? `${p.orderDate}T12:00:00.000Z` : now,
      updatedAt: now,
    },
  };
});

const maxPo = Math.max(...docs.map((d) => d.doc.poNumber));
const fileCount = docs.reduce((n, d) => n + d.files.length, 0);
console.log(
  `POs ${docs.length} (max ${maxPo}) | lines ${docs.reduce((n, d) => n + d.doc.lines.length, 0)} | ` +
    `suppliers ${suppliers.length} | employees ${employees.length} | shipping ${shipping.length} | MTR files ${fileCount}`
);
const kinds = suppliers.reduce((m, x) => ((m[x.kind] = (m[x.kind] ?? 0) + 1), m), {});
console.log('supplier kinds:', kinds);
console.log('active POs:', docs.filter((d) => d.doc.active).map((d) => `${d.id} ${d.doc.supplierName} WO ${d.doc.workOrders.join(',')}`).join(' | '));
if (!write) {
  console.log('Dry run. Add --write to import.');
  process.exit(0);
}

// ---- write ----
async function inBatches(items, fn) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    for (const it of items.slice(i, i + 400)) fn(batch, it);
    await batch.commit();
  }
}

// Lookups: Access ids. Existing records edited in the app are kept.
for (const [col, items] of [
  ['poSuppliers', suppliers],
  ['poEmployees', employees],
  ['poShippingMethods', shipping],
]) {
  const existing = new Set((await db.collection(col).get()).docs.map((d) => d.id));
  const fresh = items.filter((x) => !existing.has(x.id));
  await inBatches(fresh, (b, { id, ...rest }) => b.set(db.collection(col).doc(id), rest));
  console.log(`${col}: +${fresh.length} (kept ${items.length - fresh.length})`);
}
const companyRef = db.collection('poMeta').doc('company');
if (!(await companyRef.get()).exists) await companyRef.set(clean(data.company ?? {}));

// POs: skip any the app created (source "app") or saved (editedInApp).
const appOwned = new Set([
  ...(await db.collection('purchaseOrders').where('source', '==', 'app').select().get()).docs.map((d) => d.id),
  ...(await db.collection('purchaseOrders').where('editedInApp', '==', true).select().get()).docs.map((d) => d.id),
]);
const existingAccess = new Map(
  (await db.collection('purchaseOrders').where('source', '==', 'access').select('mtr', 'sentWos', 'jobMoves').get()).docs.map((d) => [d.id, d.data()])
);
const toWrite = docs.filter((d) => !appOwned.has(d.id));
if (appOwned.size) {
  const clash = docs.filter((d) => appOwned.has(d.id)).map((d) => d.id);
  if (clash.length) console.log(`⚠ ${clash.length} Access PO numbers already used by app POs, skipped: ${clash.join(', ')}`);
}

// M-T-R files -> Storage (skips files already uploaded).
let uploaded = 0;
for (const d of toWrite) {
  const prev = existingAccess.get(d.id);
  d.doc.mtr = [];
  for (const f of d.files) {
    const path = `po-mtr/${d.id}/${f.file.split('/').pop()}`;
    const already = arr(prev?.mtr).some((m) => m.path === path);
    if (!already) {
      const local = join(dir, f.file);
      if (!existsSync(local)) {
        console.log(`missing file ${local}`);
        continue;
      }
      await bucket.upload(local, { destination: path, resumable: false });
      uploaded++;
    }
    d.doc.mtr.push({ name: f.name, path, size: f.size });
  }
  // Keep the board bookkeeping from an earlier import.
  if (prev) {
    d.doc.sentWos = [...new Set([...arr(prev.sentWos), ...d.doc.sentWos])];
    d.doc.jobMoves = arr(prev.jobMoves);
  }
}
console.log(`MTR uploaded: ${uploaded}`);

await inBatches(toWrite, (b, d) => b.set(db.collection('purchaseOrders').doc(d.id), d.doc));
console.log(`purchaseOrders written: ${toWrite.length}`);

// Numbering continues after the highest PO; bump the change counter.
const stateRef = db.collection('poMeta').doc('state');
const state = (await stateRef.get()).data() ?? {};
await stateRef.set(
  { lastPoNumber: Math.max(Number(state.lastPoNumber ?? 0), maxPo), version: Number(state.version ?? 0) + 1, importedAt: now },
  { merge: true }
);
console.log(`Next PO number: ${Math.max(Number(state.lastPoNumber ?? 0), maxPo) + 1}`);
