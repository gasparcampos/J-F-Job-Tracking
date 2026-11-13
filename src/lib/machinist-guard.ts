import { NextResponse } from 'next/server';
import { jobsDB, departmentsDB, usersDB } from './json-db';
import { machinistSession } from './auth-guard';
import { completeTargets, visibleDepartments } from './dept-flow';
import { verifyPinAttempt } from './pin-attempt';
import { sameName } from './names';

const deny = (error: string, status = 403) => NextResponse.json({ error }, { status });

/**
 * Limits what a logged-in machinist can do to a job. Admins and anonymous
 * callers (while login isn't enforced) pass straight through (null).
 * A machinist may only touch jobs in their own departments, and:
 *  - kind 'toggle': Start (job assigned to them + their PIN) / Pause;
 *  - kind 'update': either save productionNotes, or Complete the job (assigned
 *    to them + their PIN) into one of the allowed next departments.
 * Departments are read fresh from the user record, so an admin's change
 * applies right away without re-login.
 * Always removes body.pin. May set body.notes (who completed it) and
 * body.startedBy (who started it, PIN-verified).
 */
export async function machinistJobGuard(
  req: Request,
  jobId: string,
  kind: 'toggle' | 'update',
  body?: Record<string, unknown>,
): Promise<NextResponse | null> {
  const pin = body?.pin;
  if (body) delete body.pin;

  const s = await machinistSession(req);
  if (!s) return null;

  const [user, job] = await Promise.all([usersDB.getAuth(s.uid), jobsDB.findById(jobId)]);
  if (!user || !user.isActive || user.role !== 'machinist') return deny('Sesión no válida');
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (!user.departmentIds.includes(job.departmentId)) return deny('Este trabajo no está en tu departamento');
  if (job.deviationStatus === 'pending' || job.shipped) return deny('Este trabajo no está disponible');

  // Start and Complete: only the person the job is assigned to, confirmed with their PIN.
  const requireOwnerPin = async (): Promise<NextResponse | null> => {
    if (!sameName(job.assignedTo, user.name)) {
      return deny(job.assignedTo ? `This job is assigned to ${job.assignedTo}` : 'Unassigned — talk to your manager');
    }
    const check = await verifyPinAttempt(user, pin);
    return check.ok ? null : deny(check.error, check.status === 429 ? 429 : 403);
  };

  if (kind === 'toggle') {
    if (job.inProgress) return null; // Pause needs no PIN
    const denied = await requireOwnerPin();
    if (denied) return denied;
    if (body) body.startedBy = user.name;
    return null;
  }

  const keys = Object.keys(body ?? {});
  if (keys.length === 1 && keys[0] === 'productionNotes' && typeof body!.productionNotes === 'string') {
    return null;
  }

  const moveKeys = new Set(['targetDeptId', 'employeeId', 'employeeName', 'notes']);
  if (keys.includes('targetDeptId') && keys.every((k) => moveKeys.has(k))) {
    const depts = visibleDepartments(await departmentsDB.findAll());
    const allowed = completeTargets(job.departmentId, depts).map((d) => d.id);
    if (!allowed.includes(String(body!.targetDeptId))) return deny('Destino no permitido');
    const denied = await requireOwnerPin();
    if (denied) return denied;
    body!.notes = [body!.notes, `✔ Completed by ${user.name} (PIN)`].filter(Boolean).join(' — ');
    return null;
  }

  return deny('Acción no permitida');
}
