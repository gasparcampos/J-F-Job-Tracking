/**
 * What saving a PO does to the board, applied right away (no review):
 *
 *  - PO out (ACTIVE, not received, not VOID): each WO (JOB#) goes to NDE (NDE
 *    work) or O.S (outside service) with the note "@ SUPPLIER MM/DD PO# N ETA MM/DD".
 *    A WO is sent once per PO; editing the PO later only refreshes the note
 *    while the job is still out with this PO's note.
 *  - PO received: a job still in NDE goes back to KARINA; still in O.S goes to
 *    READY TO SHIP (heat treat / stress relief: WOOD PALLET), with the note
 *    "BACK FROM SUPPLIER MM/DD PO# N".
 *  - Material / tooling POs never move anything.
 *
 * Every move is written to the job's History with the PO#.
 */
import { jobsDB, departmentsDB, type StoredJob } from './json-db';
import { purchaseOrdersDB, poLookupsDB } from './po-db';
import { poKind } from './po-shared';
import { planBoardMoves } from './po-plan';
import { formatDuration } from './utils';
import { workingMsBetween, shiftForDepartment } from './work-hours';
import type { PoJobMove, PurchaseOrder } from '@/types/po';

/** Same as a Move from the board: bank the stage time, log it in History. */
async function moveJob(job: StoredJob, toDeptId: string, note: string, poNumber: number) {
  const worked =
    (job.deptTimes?.[job.departmentId] ?? 0) +
    (job.inProgress && job.inProgressAt
      ? workingMsBetween(new Date(job.inProgressAt).getTime(), Date.now(), shiftForDepartment(job.departmentId))
      : 0);
  const updated = await jobsDB.update(job.id, { departmentId: toDeptId, notes: note, inProgress: false });
  await jobsDB.addHistory(job.id, {
    fromDeptId: job.departmentId,
    toDeptId,
    employeeName: updated?.assignedTo,
    notes: [`🧾 PO# ${poNumber}: ${note}`, worked > 0 ? `⏱ Worked in stage: ${formatDuration(worked)}` : ''].filter(Boolean).join(' — '),
  });
}

export interface PoBoardResult {
  moves: PoJobMove[];
  messages: string[]; // human-readable, shown after saving
}

export async function applyPoToBoard(before: PurchaseOrder | null, po: PurchaseOrder): Promise<PoBoardResult> {
  if (!po.workOrders.length || po.status === 'VOID') return { moves: [], messages: [] };
  const supplier = await poLookupsDB.supplier(po.supplierId);
  const kind = poKind(po, supplier);
  if (kind === 'none') return { moves: [], messages: [] };

  const [jobs, depts] = await Promise.all([jobsDB.findAll(), departmentsDB.findAll()]);
  const plan = planBoardMoves(before, po, kind, jobs, depts);
  const now = new Date().toISOString();
  const moves: PoJobMove[] = [];

  for (const step of plan.steps) {
    const job = jobs.find((j) => j.id === step.jobId)!;
    if (step.toDeptId && step.action !== 'note') {
      await moveJob(job, step.toDeptId, step.note, po.poNumber);
    } else {
      await jobsDB.update(job.id, { notes: step.note });
      if (step.logHistory) await jobsDB.addAnnotation(job.id, `🧾 PO# ${po.poNumber}: ${step.note}`);
    }
    moves.push({ wo: step.wo, jobId: step.jobId, action: step.action, fromDept: step.fromDeptName, toDept: step.toDeptName, at: now });
  }

  const sentChanged = plan.sentWos.length !== (po.sentWos ?? []).length;
  if (moves.length || sentChanged) {
    await purchaseOrdersDB.recordMoves(po.id, plan.sentWos, [...(po.jobMoves ?? []), ...moves]);
  }
  return { moves, messages: plan.messages };
}
