import { NextResponse } from 'next/server';
import { jobsDB, departmentsDB, usersDB } from './json-db';
import { machinistSession } from './auth-guard';
import { completeTargets, visibleDepartments } from './dept-flow';

const deny = (error: string) => NextResponse.json({ error }, { status: 403 });

/**
 * Limits what a logged-in machinist can do to a job. Admins and anonymous
 * callers (while login isn't enforced) pass straight through (null).
 * A machinist may only touch jobs in their own departments, and:
 *  - kind 'toggle': Start / Pause;
 *  - kind 'update': either save productionNotes, or Complete the job into one
 *    of the allowed next departments (same rules as the dashboard).
 * Departments are read fresh from the user record, so an admin's change
 * applies right away without re-login.
 * May rewrite body.notes to stamp who completed the job.
 */
export async function machinistJobGuard(
  req: Request,
  jobId: string,
  kind: 'toggle' | 'update',
  body?: Record<string, unknown>,
): Promise<NextResponse | null> {
  const s = await machinistSession(req);
  if (!s) return null;

  const [user, job] = await Promise.all([usersDB.getAuth(s.uid), jobsDB.findById(jobId)]);
  if (!user || !user.isActive || user.role !== 'machinist') return deny('Sesión no válida');
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (!user.departmentIds.includes(job.departmentId)) return deny('Este trabajo no está en tu departamento');
  if (job.deviationStatus === 'pending' || job.shipped) return deny('Este trabajo no está disponible');

  if (kind === 'toggle') return null;

  const keys = Object.keys(body ?? {});
  if (keys.length === 1 && keys[0] === 'productionNotes' && typeof body!.productionNotes === 'string') {
    return null;
  }

  const moveKeys = new Set(['targetDeptId', 'employeeId', 'employeeName', 'notes']);
  if (keys.includes('targetDeptId') && keys.every((k) => moveKeys.has(k))) {
    const depts = visibleDepartments(await departmentsDB.findAll());
    const allowed = completeTargets(job.departmentId, depts).map((d) => d.id);
    if (!allowed.includes(String(body!.targetDeptId))) return deny('Destino no permitido');
    body!.notes = [body!.notes, `✔ Completed by ${s.name}`].filter(Boolean).join(' — ');
    return null;
  }

  return deny('Acción no permitida');
}
