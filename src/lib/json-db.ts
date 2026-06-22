/**
 * Firestore-backed data layer.
 *
 * Keeps the same public API as the previous JSON-file implementation
 * (jobsDB / departmentsDB / employeesDB / seedDB / resetDepartments) so
 * existing API routes only need to `await` the calls.
 */

import { firestore } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// ---------- Types ----------

export interface StoredJob {
  id: string;
  title: string;
  description?: string;
  priority: number;
  departmentId: string;
  order: number;
  assignedTo?: string;
  fileUrl?: string;
  fileName?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachments?: Array<{ url: string; name: string }>;
  previewUrl?: string;
  pageCount?: number;
  notes?: string;
  inProgress: boolean;
  inProgressAt?: string;
  jobNumber?: string;
  name?: string;
  customer?: string;
  poNumber?: string;
  line?: string;
  quantity?: string;
  dwgNumber?: string;
  partNumber?: string;
  dueDate?: string;
  outService?: string;
  deviation?: string;
  deviationStatus?: 'pending' | 'accepted' | 'rejected' | '';
  history: Array<{
    id: string;
    jobId: string;
    fromDeptId?: string;
    toDeptId: string;
    employeeId?: string;
    employeeName?: string;
    notes?: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredDepartment {
  id: string;
  name: string;
  color: string;
  order: number;
  defaultEmployee?: string;
}

export interface StoredEmployee {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  isActive: boolean;
}

// ---------- Collections ----------

const JOBS = 'jobs';
const DEPARTMENTS = 'departments';
const EMPLOYEES = 'employees';

const jobsCol = () => firestore.collection(JOBS);
const deptsCol = () => firestore.collection(DEPARTMENTS);
const empsCol = () => firestore.collection(EMPLOYEES);

// ---------- Defaults / Seed data ----------

const DEFAULT_DEPARTMENTS: StoredDepartment[] = [
  { id: 'd1', name: 'NEW MATERIAL', color: '#f59e0b', order: 0, defaultEmployee: 'Gaspar' },
  { id: 'd2', name: 'Cut Saw (Segueta)', color: '#ef4444', order: 1, defaultEmployee: 'Gaspar' },
  { id: 'd3', name: 'WOOD PALLET', color: '#8b5cf6', order: 2, defaultEmployee: 'All' },
  { id: 'd4', name: 'Night shift', color: '#1e293b', order: 3, defaultEmployee: 'Aldo' },
  { id: 'd5', name: 'BLUE PALLET', color: '#3b82f6', order: 4, defaultEmployee: 'All' },
  { id: 'd6', name: 'ARTURO', color: '#10b981', order: 5, defaultEmployee: 'Arturo' },
  { id: 'd7', name: 'GERMAN', color: '#f97316', order: 6, defaultEmployee: 'German' },
  { id: 'd8', name: 'ROMULO', color: '#06b6d4', order: 7, defaultEmployee: 'Romulo' },
  { id: 'd9', name: 'LATHE DEBURR', color: '#84cc16', order: 8, defaultEmployee: 'Meno' },
  { id: 'd10', name: 'LATHE INSPECTION', color: '#eab308', order: 9, defaultEmployee: 'Estrada' },
  { id: 'd11', name: 'MILL', color: '#ec4899', order: 10, defaultEmployee: 'JR' },
  { id: 'd12', name: 'MILL DEBURR', color: '#a855f7', order: 11, defaultEmployee: 'Meno' },
  { id: 'd13', name: 'FINAL INSPECTION', color: '#14b8a6', order: 12, defaultEmployee: 'Estrada' },
  { id: 'd14', name: 'STAMP', color: '#f43f5e', order: 13, defaultEmployee: 'Chito' },
  { id: 'd15', name: 'NDE', color: '#6366f1', order: 14, defaultEmployee: '' },
  { id: 'd16', name: 'O.S', color: '#0ea5e9', order: 15, defaultEmployee: '' },
  { id: 'd17', name: 'READY TO SHIP', color: '#22c55e', order: 16, defaultEmployee: '' },
];

const DEFAULT_EMPLOYEES: StoredEmployee[] = [
  { id: 'e1', name: 'Gaspar', isActive: true },
  { id: 'e2', name: 'Aldo', isActive: true },
  { id: 'e3', name: 'Mazo', isActive: true },
  { id: 'e4', name: 'Arturo', isActive: true },
  { id: 'e5', name: 'German', isActive: true },
  { id: 'e6', name: 'Romulo', isActive: true },
  { id: 'e7', name: 'Meno', isActive: true },
  { id: 'e8', name: 'Estrada', isActive: true },
  { id: 'e9', name: 'JR', isActive: true },
  { id: 'e10', name: 'Daniel', isActive: true },
  { id: 'e11', name: 'Fedex', isActive: true },
  { id: 'e12', name: 'Chito', isActive: true },
  { id: 'e13', name: 'All', isActive: true },
];

// ---------- Helpers ----------

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function docToJob(id: string, data: FirebaseFirestore.DocumentData): StoredJob {
  return {
    id,
    title: data.title ?? '',
    description: data.description,
    priority: data.priority ?? 3,
    departmentId: data.departmentId,
    order: data.order ?? 0,
    assignedTo: data.assignedTo,
    fileUrl: data.fileUrl,
    fileName: data.fileName,
    attachmentUrl: data.attachmentUrl,
    attachmentName: data.attachmentName,
    attachments: Array.isArray(data.attachments) ? data.attachments : undefined,
    previewUrl: data.previewUrl,
    pageCount: data.pageCount,
    notes: data.notes,
    inProgress: data.inProgress ?? false,
    inProgressAt: data.inProgressAt,
    jobNumber: data.jobNumber,
    name: data.name,
    customer: data.customer,
    poNumber: data.poNumber,
    line: data.line,
    quantity: data.quantity,
    dwgNumber: data.dwgNumber,
    partNumber: data.partNumber,
    dueDate: data.dueDate,
    outService: data.outService,
    deviation: data.deviation,
    deviationStatus: data.deviationStatus,
    history: Array.isArray(data.history) ? data.history : [],
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

async function getNextOrder(deptId: string): Promise<number> {
  const snap = await jobsCol().where('departmentId', '==', deptId).get();
  if (snap.empty) return 0;
  let max = -1;
  snap.forEach((d) => {
    const o = (d.data().order as number) ?? 0;
    if (o > max) max = o;
  });
  return max + 1;
}

// ---------- jobsDB ----------

export const jobsDB = {
  async findAll(): Promise<StoredJob[]> {
    const snap = await jobsCol().get();
    const jobs: StoredJob[] = [];
    snap.forEach((d) => jobs.push(docToJob(d.id, d.data())));
    return jobs.sort((a, b) => {
      if (a.departmentId !== b.departmentId) {
        return a.departmentId.localeCompare(b.departmentId);
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });
  },

  async findById(id: string): Promise<StoredJob | null> {
    const doc = await jobsCol().doc(id).get();
    if (!doc.exists) return null;
    return docToJob(doc.id, doc.data()!);
  },

  /**
   * Find a job by its JOB# (work number). Case-insensitive, trimmed.
   * Used to block duplicate work numbers on create.
   */
  async findByJobNumber(jobNumber: string): Promise<StoredJob | null> {
    const target = jobNumber.trim().toLowerCase();
    if (!target) return null;
    const snap = await jobsCol().get();
    let match: StoredJob | null = null;
    snap.forEach((d) => {
      if (match) return;
      const jn = (d.data().jobNumber as string | undefined) ?? '';
      if (jn.trim().toLowerCase() === target) {
        match = docToJob(d.id, d.data());
      }
    });
    return match;
  },

  async create(data: {
    title: string;
    description?: string;
    priority?: number;
    departmentId: string;
    assignedTo?: string;
    fileUrl?: string;
    fileName?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    previewUrl?: string;
    pageCount?: number;
    notes?: string;
    jobNumber?: string;
    name?: string;
    customer?: string;
    poNumber?: string;
    line?: string;
    quantity?: string;
    dwgNumber?: string;
    partNumber?: string;
    dueDate?: string;
    outService?: string;
  }): Promise<StoredJob> {
    const id = generateId();
    const order = await getNextOrder(data.departmentId);
    const now = new Date().toISOString();

    const job: StoredJob = {
      id,
      title: data.title,
      description: data.description,
      priority: data.priority || 3,
      departmentId: data.departmentId,
      order,
      assignedTo: data.assignedTo,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      attachmentUrl: data.attachmentUrl,
      attachmentName: data.attachmentName,
      previewUrl: data.previewUrl,
      pageCount: data.pageCount,
      notes: data.notes,
      inProgress: false,
      jobNumber: data.jobNumber,
      name: data.name,
      customer: data.customer,
      poNumber: data.poNumber,
      line: data.line,
      quantity: data.quantity,
      dwgNumber: data.dwgNumber,
      partNumber: data.partNumber,
      dueDate: data.dueDate,
      outService: data.outService,
      history: [
        {
          id: generateId(),
          jobId: id,
          toDeptId: data.departmentId,
          notes: '📄 Job created',
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    await jobsCol().doc(id).set(stripUndefined(job as unknown as Record<string, unknown>));
    return job;
  },

  async update(id: string, data: Partial<StoredJob>): Promise<StoredJob | null> {
    const ref = jobsCol().doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;

    const patch = stripUndefined({ ...data, updatedAt: new Date().toISOString() } as Record<string, unknown>);
    await ref.update(patch);

    const updated = await ref.get();
    return docToJob(updated.id, updated.data()!);
  },

  async reorder(jobId: string, targetDeptId: string, newOrder: number): Promise<StoredJob | null> {
    const ref = jobsCol().doc(jobId);
    const doc = await ref.get();
    if (!doc.exists) return null;

    // Re-number every job in the target department so orders stay contiguous.
    const deptSnap = await jobsCol().where('departmentId', '==', targetDeptId).get();
    const others: { id: string; order: number }[] = [];
    deptSnap.forEach((d) => {
      if (d.id !== jobId) {
        others.push({ id: d.id, order: (d.data().order as number) ?? 0 });
      }
    });
    others.sort((a, b) => a.order - b.order);

    const batch = firestore.batch();
    const now = new Date().toISOString();

    batch.update(ref, {
      departmentId: targetDeptId,
      order: newOrder,
      updatedAt: now,
    });

    let currentOrder = 0;
    for (const o of others) {
      if (currentOrder === newOrder) currentOrder++;
      if (o.order !== currentOrder) {
        batch.update(jobsCol().doc(o.id), { order: currentOrder, updatedAt: now });
      }
      currentOrder++;
    }

    await batch.commit();
    const updated = await ref.get();
    return docToJob(updated.id, updated.data()!);
  },

  async addHistory(
    jobId: string,
    entry: {
      fromDeptId?: string;
      toDeptId: string;
      employeeId?: string;
      employeeName?: string;
      notes?: string;
    },
  ): Promise<StoredJob | null> {
    const ref = jobsCol().doc(jobId);
    const doc = await ref.get();
    if (!doc.exists) return null;

    const historyEntry = stripUndefined({
      id: generateId(),
      jobId,
      fromDeptId: entry.fromDeptId,
      toDeptId: entry.toDeptId,
      employeeId: entry.employeeId,
      employeeName: entry.employeeName,
      notes: entry.notes,
      timestamp: new Date().toISOString(),
    } as Record<string, unknown>);

    await ref.update({
      history: FieldValue.arrayUnion(historyEntry),
      updatedAt: new Date().toISOString(),
    });

    const updated = await ref.get();
    return docToJob(updated.id, updated.data()!);
  },

  async addAnnotation(jobId: string, annotation: string): Promise<StoredJob | null> {
    const ref = jobsCol().doc(jobId);
    const doc = await ref.get();
    if (!doc.exists) return null;
    const data = doc.data()!;

    const historyEntry = {
      id: generateId(),
      jobId,
      toDeptId: data.departmentId,
      notes: annotation,
      timestamp: new Date().toISOString(),
    };

    await ref.update({
      history: FieldValue.arrayUnion(historyEntry),
      updatedAt: new Date().toISOString(),
    });

    const updated = await ref.get();
    return docToJob(updated.id, updated.data()!);
  },

  async toggleInProgress(jobId: string): Promise<StoredJob | null> {
    const ref = jobsCol().doc(jobId);
    const doc = await ref.get();
    if (!doc.exists) return null;
    const data = doc.data()!;

    const inProgress = !(data.inProgress ?? false);
    const now = new Date().toISOString();
    const historyEntry = {
      id: generateId(),
      jobId,
      toDeptId: data.departmentId,
      notes: inProgress ? '🔥 In Progress started' : '⏸️ In Progress stopped',
      timestamp: now,
    };

    const patch: Record<string, unknown> = {
      inProgress,
      updatedAt: now,
      history: FieldValue.arrayUnion(historyEntry),
    };
    if (inProgress) {
      patch.inProgressAt = now;
    } else {
      patch.inProgressAt = FieldValue.delete();
    }

    await ref.update(patch);
    const updated = await ref.get();
    return docToJob(updated.id, updated.data()!);
  },

  async delete(id: string): Promise<boolean> {
    const ref = jobsCol().doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  },

  async deleteAll(): Promise<void> {
    const snap = await jobsCol().get();
    // Firestore batch limit is 500. Chunk just in case.
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = firestore.batch();
      docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  },
};

// ---------- departmentsDB ----------

export const departmentsDB = {
  async findAll(): Promise<StoredDepartment[]> {
    const snap = await deptsCol().get();
    const out: StoredDepartment[] = [];
    snap.forEach((d) => {
      const data = d.data();
      out.push({
        id: d.id,
        name: data.name,
        color: data.color,
        order: data.order ?? 0,
        defaultEmployee: data.defaultEmployee ?? '',
      });
    });
    return out.sort((a, b) => a.order - b.order);
  },

  async update(id: string, data: Partial<StoredDepartment>): Promise<StoredDepartment | null> {
    const ref = deptsCol().doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;
    await ref.update(stripUndefined(data as Record<string, unknown>));
    const updated = await ref.get();
    const d = updated.data()!;
    return {
      id: updated.id,
      name: d.name,
      color: d.color,
      order: d.order ?? 0,
      defaultEmployee: d.defaultEmployee ?? '',
    };
  },

  /**
   * Resolve a department by display name (e.g. for the assistant's
   * move-job action). Case-insensitive exact match first, then falls back
   * to a substring match so loose/partial phrasing still has a chance.
   */
  async findByName(name: string): Promise<StoredDepartment | null> {
    const target = name.trim().toLowerCase();
    if (!target) return null;
    const depts = await this.findAll();
    const exact = depts.find((d) => d.name.toLowerCase() === target);
    if (exact) return exact;
    return (
      depts.find(
        (d) => d.name.toLowerCase().includes(target) || target.includes(d.name.toLowerCase())
      ) ?? null
    );
  },
};

// ---------- employeesDB ----------

export const employeesDB = {
  async findAll(): Promise<StoredEmployee[]> {
    const snap = await empsCol().get();
    const out: StoredEmployee[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.isActive === false) return;
      out.push({
        id: d.id,
        name: data.name,
        email: data.email,
        avatar: data.avatar,
        isActive: data.isActive ?? true,
      });
    });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  async findById(id: string): Promise<StoredEmployee | null> {
    const doc = await empsCol().doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    return {
      id: doc.id,
      name: data.name,
      email: data.email,
      avatar: data.avatar,
      isActive: data.isActive ?? true,
    };
  },
};

// ---------- Seed / reset ----------

/**
 * Seeds defaults if collections are empty. Safe to call on every request —
 * it bails out quickly when data already exists.
 */
export async function seedDB(): Promise<void> {
  const [deptsSnap, empsSnap] = await Promise.all([
    deptsCol().limit(1).get(),
    empsCol().limit(1).get(),
  ]);

  const tasks: Promise<unknown>[] = [];

  if (deptsSnap.empty) {
    const batch = firestore.batch();
    for (const d of DEFAULT_DEPARTMENTS) {
      const { id, ...rest } = d;
      batch.set(deptsCol().doc(id), rest);
    }
    tasks.push(batch.commit());
  }

  if (empsSnap.empty) {
    const batch = firestore.batch();
    for (const e of DEFAULT_EMPLOYEES) {
      const { id, ...rest } = e;
      batch.set(empsCol().doc(id), rest);
    }
    tasks.push(batch.commit());
  }

  if (tasks.length) await Promise.all(tasks);
}

/**
 * Wipes departments and re-seeds them with defaults. Mirrors the previous
 * `resetDepartments` behavior used by the /api/seed route.
 */
export async function resetDepartments(): Promise<StoredDepartment[]> {
  const existing = await deptsCol().get();
  if (!existing.empty) {
    const batch = firestore.batch();
    existing.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  const batch = firestore.batch();
  for (const d of DEFAULT_DEPARTMENTS) {
    const { id, ...rest } = d;
    batch.set(deptsCol().doc(id), rest);
  }
  await batch.commit();
  return [...DEFAULT_DEPARTMENTS].sort((a, b) => a.order - b.order);
}
