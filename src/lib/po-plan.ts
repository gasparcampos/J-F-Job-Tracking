/**
 * Pure planning for the PO -> board automation (see po-automation.ts): which
 * job goes where, with what note. No reads or writes.
 */
import { poSentNote, poBackNote, returnDeptName } from './po-shared';
import type { StoredJob, StoredDepartment } from './json-db';
import type { PoKind, PurchaseOrder } from '@/types/po';

const deptKey = (name: string) => name.replace(/[^a-z]/gi, '').toUpperCase();

export type JobLite = Pick<StoredJob, 'id' | 'jobNumber' | 'departmentId' | 'notes' | 'shipped'>;
export type DeptLite = Pick<StoredDepartment, 'id' | 'name'>;

export interface PlannedStep {
  wo: string;
  jobId: string;
  action: 'sent' | 'received' | 'note';
  toDeptId?: string;
  fromDeptName?: string;
  toDeptName?: string;
  note: string;
  logHistory: boolean;
}

export interface BoardPlan {
  steps: PlannedStep[];
  sentWos: string[];
  messages: string[];
}

/**
 * Pure: decides what the PO does to each job. No reads or writes, so it can
 * be checked without touching the real board.
 */
export function planBoardMoves(
  before: Pick<PurchaseOrder, 'receivedDate'> | null,
  po: Pick<PurchaseOrder, 'poNumber' | 'description' | 'supplierName' | 'orderDate' | 'eta' | 'receivedDate' | 'active' | 'status' | 'workOrders' | 'sentWos'>,
  kind: PoKind,
  jobs: JobLite[],
  depts: DeptLite[]
): BoardPlan {
  const plan: BoardPlan = { steps: [], sentWos: [...(po.sentWos ?? [])], messages: [] };
  if (!po.workOrders.length || po.status === 'VOID' || kind === 'none') return plan;

  const find = (key: string) => depts.find((d) => deptKey(d.name) === key) ?? null;
  const outDept = find(kind === 'nde' ? 'NDE' : 'OS');
  const backName = returnDeptName(kind, po.description, po.supplierName) ?? 'READY TO SHIP';
  const backDept = find(deptKey(backName));
  if (!outDept || !backDept) {
    plan.messages.push(`No encontré el departamento ${kind === 'nde' ? 'NDE' : 'O.S'} / ${backName} en el tablero.`);
    return plan;
  }

  const sent = new Set(plan.sentWos);
  const received = !!po.receivedDate;
  const justReceived = received && !before?.receivedDate;
  const sentNote = poSentNote(po);

  for (const wo of po.workOrders) {
    const job = jobs.find((j) => !j.shipped && (j.jobNumber ?? '').replace(/\D/g, '') === wo);
    if (!job) {
      if (!received && po.active && !sent.has(wo)) plan.messages.push(`JOB# ${wo} no está activo en el tablero; no se movió.`);
      continue;
    }

    if (justReceived) {
      // Only bring it back if it is still where this PO sent it.
      if (job.departmentId === outDept.id) {
        const note = poBackNote(po);
        plan.steps.push({ wo, jobId: job.id, action: 'received', toDeptId: backDept.id, fromDeptName: outDept.name, toDeptName: backDept.name, note, logHistory: true });
        plan.messages.push(`JOB# ${wo}: ${outDept.name} → ${backDept.name}`);
      }
      continue;
    }
    // Only an ACTIVE PO (out, on the OUTSIDE list) sends jobs.
    if (received || !po.active) continue;

    const currentNote = (job.notes ?? '').trim();
    if (!sent.has(wo)) {
      if (job.departmentId !== outDept.id) {
        plan.steps.push({ wo, jobId: job.id, action: 'sent', toDeptId: outDept.id, toDeptName: outDept.name, note: sentNote, logHistory: true });
        plan.messages.push(`JOB# ${wo} → ${outDept.name} (${sentNote})`);
      } else if (currentNote !== sentNote) {
        plan.steps.push({ wo, jobId: job.id, action: 'note', toDeptName: outDept.name, note: sentNote, logHistory: true });
        plan.messages.push(`JOB# ${wo}: nota actualizada (${sentNote})`);
      }
      sent.add(wo);
    } else if (job.departmentId === outDept.id && currentNote !== sentNote && currentNote.includes(`PO# ${po.poNumber}`)) {
      // PO edited (e.g. new ETA) while the job is still out: refresh the note.
      plan.steps.push({ wo, jobId: job.id, action: 'note', toDeptName: outDept.name, note: sentNote, logHistory: false });
      plan.messages.push(`JOB# ${wo}: nota actualizada (${sentNote})`);
    }
  }
  plan.sentWos = [...sent];
  return plan;
}
