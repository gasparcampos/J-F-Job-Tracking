/**
 * Firestore storage for the Purchase Orders carried over from Access.
 *
 *   purchaseOrders/{poNumber}   one doc per PO, lines + M-T-R files inside
 *   poSuppliers/{id}            Suppliers (ids keep the Access SupplierID)
 *   poEmployees/{id}            Employees ("Authorized By")
 *   poShippingMethods/{id}      Shipping Methods
 *   poMeta/company              My Company Information (printed PO header)
 *   poMeta/state                { lastPoNumber, version } -- PO numbering and
 *                               a change counter for the list cache / live sync
 *
 * The full PO list (~7,000) is read once per server instance and kept as a
 * compact summary list; any write bumps poMeta/state.version, which makes
 * every instance re-read it on its next request.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from './firebase-admin';
import { activeForStatus, employeeLabel, nowTime, poTotal, todayIso, workOrdersOf } from './po-shared';
import type {
  PoCompany,
  PoEmployee,
  PoKind,
  PoLine,
  PoLookups,
  PoShippingMethod,
  PoStatus,
  PoSummary,
  PoSupplier,
  PurchaseOrder,
} from '@/types/po';

const posCol = () => firestore.collection('purchaseOrders');
const suppliersCol = () => firestore.collection('poSuppliers');
const employeesCol = () => firestore.collection('poEmployees');
const shippingCol = () => firestore.collection('poShippingMethods');
const metaCol = () => firestore.collection('poMeta');
const stateRef = () => metaCol().doc('state');

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const isoDate = (v: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};
const STATUSES = new Set(['', 'OPEN', 'CLOSED', 'PENDING', 'VOID']);
const KINDS = new Set(['nde', 'os', 'none']);

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// ---------- docs -> objects ----------

function docToPo(id: string, d: FirebaseFirestore.DocumentData): PurchaseOrder {
  const lines: PoLine[] = Array.isArray(d.lines) ? d.lines : [];
  return {
    id,
    poNumber: Number(d.poNumber ?? id),
    supplierId: str(d.supplierId),
    supplierName: str(d.supplierName),
    description: str(d.description),
    employeeId: str(d.employeeId),
    employeeName: str(d.employeeName),
    orderDate: str(d.orderDate),
    eta: str(d.eta),
    timeOrder: str(d.timeOrder),
    shippingMethodId: str(d.shippingMethodId),
    shippingMethod: str(d.shippingMethod),
    materialCondition: str(d.materialCondition),
    heatNumber: str(d.heatNumber),
    partDwg: str(d.partDwg),
    matType: str(d.matType),
    hotRush: str(d.hotRush),
    active: !!d.active,
    notes: str(d.notes),
    employeeReceived: str(d.employeeReceived),
    receivedDate: str(d.receivedDate),
    status: (STATUSES.has(str(d.status)) ? str(d.status) : '') as PoStatus,
    lines,
    mtr: Array.isArray(d.mtr) ? d.mtr : [],
    workOrders: Array.isArray(d.workOrders) ? d.workOrders : workOrdersOf(lines),
    total: typeof d.total === 'number' ? d.total : poTotal(lines),
    sentWos: Array.isArray(d.sentWos) ? d.sentWos : [],
    jobMoves: Array.isArray(d.jobMoves) ? d.jobMoves : [],
    source: d.source === 'app' ? 'app' : 'access',
    legacy: d.legacy,
    createdAt: str(d.createdAt),
    updatedAt: str(d.updatedAt),
  };
}

export function toSummary(p: PurchaseOrder): PoSummary {
  return {
    id: p.id,
    poNumber: p.poNumber,
    supplierId: p.supplierId,
    supplierName: p.supplierName,
    description: p.description,
    employeeName: p.employeeName,
    orderDate: p.orderDate,
    eta: p.eta,
    shippingMethod: p.shippingMethod,
    heatNumber: p.heatNumber,
    partDwg: p.partDwg,
    matType: p.matType,
    hotRush: p.hotRush,
    active: p.active,
    status: p.status,
    receivedDate: p.receivedDate,
    employeeReceived: p.employeeReceived,
    workOrders: p.workOrders,
    total: p.total,
    // Line text, so the lists can search PROD_DESCRIP / SPEC / PART# too.
    lineText: p.lines
      .map((l) => [l.prodDescrip, l.spec, l.partNumber, l.rev].filter(Boolean).join(' '))
      .join(' | ')
      .slice(0, 600),
    hasMtr: p.mtr.length > 0,
  };
}

function docToSupplier(id: string, d: FirebaseFirestore.DocumentData): PoSupplier {
  return {
    id,
    name: str(d.name),
    contactName: str(d.contactName),
    contactTitle: str(d.contactTitle),
    address: str(d.address),
    city: str(d.city),
    state: str(d.state),
    postalCode: str(d.postalCode),
    country: str(d.country),
    phone: str(d.phone),
    fax: str(d.fax),
    email: str(d.email),
    paymentTerms: str(d.paymentTerms),
    notes: str(d.notes),
    kind: (KINDS.has(d.kind) ? d.kind : 'none') as PoKind,
  };
}

function docToEmployee(id: string, d: FirebaseFirestore.DocumentData): PoEmployee {
  return {
    id,
    firstName: str(d.firstName),
    lastName: str(d.lastName),
    title: str(d.title),
    workPhone: str(d.workPhone),
    extension: str(d.extension),
    email: str(d.email),
  };
}

const byNumericId = (a: { id: string }, b: { id: string }) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id);

// ---------- change counter + list cache ----------

async function bumpVersion(): Promise<void> {
  await stateRef().set({ version: FieldValue.increment(1), changedAt: new Date().toISOString() }, { merge: true });
}

const g = globalThis as unknown as { __jfPoCache?: { version: number; list: PoSummary[] } };

async function currentVersion(): Promise<number> {
  const s = await stateRef().get();
  return Number(s.data()?.version ?? 0);
}

// ---------- lookups ----------

const DEFAULT_COMPANY: PoCompany = {
  name: 'J&F MACHINE SHOP INC',
  address: '6300 W.LITTLE YORK RD SUITE 112',
  city: 'HOUSTON',
  state: 'TX',
  postalCode: '77091',
  country: 'USA',
  phone: '7134661760',
  fax: '',
  email: '',
};

export const poLookupsDB = {
  async all(): Promise<PoLookups> {
    const [sup, emp, ship, company] = await Promise.all([
      suppliersCol().get(),
      employeesCol().get(),
      shippingCol().get(),
      metaCol().doc('company').get(),
    ]);
    return {
      suppliers: sup.docs.map((d) => docToSupplier(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name)),
      employees: emp.docs.map((d) => docToEmployee(d.id, d.data())).sort(byNumericId),
      shippingMethods: ship.docs.map((d) => ({ id: d.id, name: str(d.data().name) })).sort((a, b) => a.name.localeCompare(b.name)),
      company: { ...DEFAULT_COMPANY, ...(company.data() ?? {}) } as PoCompany,
    };
  },

  async supplier(id: string): Promise<PoSupplier | null> {
    if (!id) return null;
    const d = await suppliersCol().doc(id).get();
    return d.exists ? docToSupplier(d.id, d.data()!) : null;
  },
};

/** Next numeric id in a small lookup collection (Access autonumber style). */
async function nextId(col: FirebaseFirestore.CollectionReference): Promise<string> {
  const snap = await col.get();
  let max = 0;
  snap.forEach((d) => (max = Math.max(max, Number(d.id) || 0)));
  return String(max + 1);
}

function makeLookupDB<T extends { id: string }>(
  col: () => FirebaseFirestore.CollectionReference,
  clean: (body: Record<string, unknown>) => Omit<T, 'id'>,
  toObj: (id: string, d: FirebaseFirestore.DocumentData) => T
) {
  return {
    async create(body: Record<string, unknown>): Promise<T> {
      const id = await nextId(col());
      const data = clean(body);
      await col().doc(id).set(stripUndefined(data as Record<string, unknown>));
      await bumpVersion();
      return toObj(id, data);
    },
    async update(id: string, body: Record<string, unknown>): Promise<T | null> {
      const ref = col().doc(id);
      const before = await ref.get();
      if (!before.exists) return null;
      const data = clean({ ...before.data(), ...body });
      await ref.set(stripUndefined(data as Record<string, unknown>));
      await bumpVersion();
      return toObj(id, data);
    },
    async delete(id: string): Promise<boolean> {
      const ref = col().doc(id);
      if (!(await ref.get()).exists) return false;
      await ref.delete();
      await bumpVersion();
      return true;
    },
  };
}

export const poSuppliersDB = makeLookupDB<PoSupplier>(
  suppliersCol,
  (b) => {
    const { id: _id, ...rest } = docToSupplier('', b);
    void _id;
    return rest;
  },
  docToSupplier
);

export const poEmployeesDB = makeLookupDB<PoEmployee>(
  employeesCol,
  (b) => {
    const { id: _id, ...rest } = docToEmployee('', b);
    void _id;
    return rest;
  },
  docToEmployee
);

export const poShippingDB = makeLookupDB<PoShippingMethod>(
  shippingCol,
  (b) => ({ name: str(b.name) }),
  (id, d) => ({ id, name: str(d.name) })
);

export async function saveCompany(body: Record<string, unknown>): Promise<PoCompany> {
  const data: PoCompany = {
    name: str(body.name),
    address: str(body.address),
    city: str(body.city),
    state: str(body.state),
    postalCode: str(body.postalCode),
    country: str(body.country),
    phone: str(body.phone),
    fax: str(body.fax),
    email: str(body.email),
  };
  await metaCol().doc('company').set(data);
  await bumpVersion();
  return data;
}

// ---------- POs ----------

/** Editable PO fields, cleaned. Names are filled from the lookups. */
async function cleanPo(body: Record<string, unknown>, base?: PurchaseOrder): Promise<Partial<PurchaseOrder>> {
  const pick = <K extends keyof PurchaseOrder>(k: K) => (k in body ? body[k] : base?.[k]);
  const lines: PoLine[] = (Array.isArray(pick('lines')) ? (pick('lines') as unknown[]) : [])
    .map((raw) => {
      const l = (raw ?? {}) as Record<string, unknown>;
      return stripUndefined({
        date: isoDate(l.date) || undefined,
        units: num(l.units),
        prodDescrip: str(l.prodDescrip) || undefined,
        spec: str(l.spec) || undefined,
        rev: str(l.rev) || undefined,
        partNumber: str(l.partNumber) || undefined,
        unitPrice: num(l.unitPrice),
        wo: str(l.wo) || undefined,
      }) as PoLine;
    })
    // Drop completely empty rows (the blank "new line" row of the form).
    .filter((l) => l.prodDescrip || l.spec || l.partNumber || l.wo || l.rev || l.units != null || l.unitPrice != null);

  const supplierId = str(pick('supplierId'));
  const employeeId = str(pick('employeeId'));
  const shippingMethodId = str(pick('shippingMethodId'));
  const [sup, emp, ship] = await Promise.all([
    supplierId ? suppliersCol().doc(supplierId).get() : null,
    employeeId ? employeesCol().doc(employeeId).get() : null,
    shippingMethodId ? shippingCol().doc(shippingMethodId).get() : null,
  ]);

  const status = str(pick('status')).toUpperCase();
  return {
    supplierId,
    supplierName: sup?.exists ? str(sup.data()!.name) : str(pick('supplierName')),
    description: str(pick('description')),
    employeeId,
    employeeName: emp?.exists ? employeeLabel(docToEmployee(emp.id, emp.data()!)) : str(pick('employeeName')),
    orderDate: isoDate(pick('orderDate')),
    eta: isoDate(pick('eta')),
    timeOrder: str(pick('timeOrder')),
    shippingMethodId,
    shippingMethod: ship?.exists ? str(ship.data()!.name) : str(pick('shippingMethod')),
    materialCondition: str(pick('materialCondition')),
    heatNumber: str(pick('heatNumber')),
    partDwg: str(pick('partDwg')),
    matType: str(pick('matType')),
    hotRush: str(pick('hotRush')),
    active: !!pick('active'),
    notes: str(pick('notes')),
    employeeReceived: str(pick('employeeReceived')),
    receivedDate: isoDate(pick('receivedDate')),
    status: (STATUSES.has(status) ? status : '') as PoStatus,
    lines,
    mtr: Array.isArray(pick('mtr')) ? (pick('mtr') as PurchaseOrder['mtr']) : [],
    workOrders: workOrdersOf(lines),
    total: Math.round(poTotal(lines) * 100) / 100,
  };
}

/** Required fields, as in the Access table. Returns the problems found. */
export function validatePo(p: Partial<PurchaseOrder>): string[] {
  const missing: string[] = [];
  if (!p.supplierId) missing.push('Supplier');
  if (!p.description) missing.push('Description');
  if (!p.employeeId) missing.push('Authorized By');
  if (!p.orderDate) missing.push('Order Date');
  if (!p.eta) missing.push('ETA');
  if (!p.shippingMethodId) missing.push('Shipping Method');
  return missing;
}

export const purchaseOrdersDB = {
  /** Every PO as a compact row, newest first. Cached until the next write. */
  async summaries(): Promise<PoSummary[]> {
    return (await this.summariesVersioned()).list;
  },

  /** Same, with the change counter (used as the list's ETag). */
  async summariesVersioned(knownVersion?: number): Promise<{ version: number; list: PoSummary[] }> {
    const version = knownVersion ?? (await currentVersion());
    const cached = g.__jfPoCache;
    if (cached && cached.version === version) return cached;
    const snap = await posCol().get();
    const list = snap.docs.map((d) => toSummary(docToPo(d.id, d.data()))).sort((a, b) => b.poNumber - a.poNumber);
    g.__jfPoCache = { version, list };
    return g.__jfPoCache;
  },

  async version(): Promise<number> {
    return currentVersion();
  },

  async findById(id: string): Promise<PurchaseOrder | null> {
    const d = await posCol().doc(String(id)).get();
    return d.exists ? docToPo(d.id, d.data()!) : null;
  },

  /** POs whose WO column has this JOB#. */
  async findByWorkOrder(wo: string): Promise<PurchaseOrder[]> {
    const digits = wo.replace(/\D/g, '');
    if (!digits) return [];
    const snap = await posCol().where('workOrders', 'array-contains', digits).get();
    return snap.docs.map((d) => docToPo(d.id, d.data())).sort((a, b) => b.poNumber - a.poNumber);
  },

  /** New PO with the next PO NUMBER (Access autonumber), stamped with today / now. */
  async create(body: Record<string, unknown>): Promise<PurchaseOrder> {
    const clean = await cleanPo({
      orderDate: todayIso(),
      timeOrder: nowTime(),
      active: true,
      ...body,
    });
    const missing = validatePo(clean);
    if (missing.length) throw new PoValidationError(missing);
    receiveStamp(clean, null);

    const now = new Date().toISOString();
    const po = await firestore.runTransaction(async (tx) => {
      const state = await tx.get(stateRef());
      let next = Number(state.data()?.lastPoNumber ?? 0) + 1;
      // Never reuse a number (e.g. if the counter was behind the data).
      while ((await tx.get(posCol().doc(String(next)))).exists) next++;
      const data = { ...clean, poNumber: next, source: 'app', sentWos: [], jobMoves: [], createdAt: now, updatedAt: now };
      tx.set(posCol().doc(String(next)), stripUndefined(data as Record<string, unknown>));
      tx.set(stateRef(), { lastPoNumber: next, version: FieldValue.increment(1), changedAt: now }, { merge: true });
      return docToPo(String(next), data);
    });
    return po;
  },

  async update(id: string, body: Record<string, unknown>): Promise<{ before: PurchaseOrder; after: PurchaseOrder } | null> {
    const before = await this.findById(id);
    if (!before) return null;
    const clean = await cleanPo(body, before);
    // Some old Access POs lack a required field; only refuse clearing one.
    const hadBefore = new Set(validatePo(before));
    const missing = validatePo(clean).filter((f) => !hadBefore.has(f));
    if (missing.length) throw new PoValidationError(missing);
    receiveStamp(clean, before);
    const now = new Date().toISOString();
    // editedInApp: a re-run of the Access import leaves this PO alone.
    await posCol().doc(before.id).set(stripUndefined({ ...clean, editedInApp: true, updatedAt: now } as Record<string, unknown>), { merge: true });
    await bumpVersion();
    return { before, after: (await this.findById(id))! };
  },

  /** Replace the attached M-T-R files (no board changes). */
  async setFiles(id: string, mtr: PurchaseOrder['mtr']): Promise<PurchaseOrder | null> {
    const ref = posCol().doc(String(id));
    if (!(await ref.get()).exists) return null;
    await ref.set({ mtr, updatedAt: new Date().toISOString() }, { merge: true });
    await bumpVersion();
    return this.findById(id);
  },

  /** Board bookkeeping written by the automation. */
  async recordMoves(id: string, sentWos: string[], moves: PurchaseOrder['jobMoves']): Promise<void> {
    await posCol().doc(id).set({ sentWos, jobMoves: moves ?? [], updatedAt: new Date().toISOString() }, { merge: true });
    await bumpVersion();
  },

  async delete(id: string): Promise<boolean> {
    const ref = posCol().doc(String(id));
    if (!(await ref.get()).exists) return false;
    await ref.delete();
    await bumpVersion();
    return true;
  },
};

/**
 * Picking EMPLOYEE RECEIVED stamps ORDER RECIVED with today. ACTIVE only
 * changes with OPEN // CLOSE (CLOSED / PENDING / VOID = off OUTSIDE).
 */
function receiveStamp(p: Partial<PurchaseOrder>, before: PurchaseOrder | null) {
  const newlyPicked = !!p.employeeReceived && p.employeeReceived !== (before?.employeeReceived ?? '');
  if (newlyPicked && (!p.receivedDate || p.receivedDate === before?.receivedDate)) p.receivedDate = todayIso();
  if (p.status !== undefined && p.status !== (before?.status ?? '')) {
    const active = activeForStatus(p.status);
    if (active !== null) p.active = active;
  }
}

export class PoValidationError extends Error {
  constructor(public missing: string[]) {
    super(`Missing: ${missing.join(', ')}`);
  }
}
