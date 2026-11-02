import { jobsDB, departmentsDB, extraPartsDB } from './json-db';
import { PLACE_OPTIONS } from './extra-parts-places';
import type { AssistantAction } from '@/types';

export type AssistantLang = 'es' | 'en';

export interface ToolCall {
  function?: { name?: string; arguments?: string };
}

const READY_TO_SHIP = 'ready to ship';
const ASSISTANT_TAG = '🤖 Asistente';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * OpenAI-style tool definitions the model can call to propose changes. The
 * department / place enums come from live data so the model can only pick
 * names that actually exist.
 */
export function buildAssistantTools(deptNames: string[]) {
  const jobNumber = { type: 'string', description: 'The JOB# exactly as listed in the job data.' };
  const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
  });

  return [
    fn(
      'move_job',
      'Move a job to another department / stage. Also use this when the user says a job is done ("complete") in its current stage and names where it goes next.',
      {
        job_number: jobNumber,
        department: { type: 'string', enum: deptNames },
        notes: { type: 'string', description: 'Optional card note for the new stage (replaces the current card note).' },
      },
      ['job_number', 'department']
    ),
    fn(
      'set_in_progress',
      'Start (in_progress=true) or pause/stop (in_progress=false) the work clock on a job in its current department.',
      { job_number: jobNumber, in_progress: { type: 'boolean' } },
      ['job_number', 'in_progress']
    ),
    fn(
      'update_job',
      'Change fields on a job. Only include the fields the user asked to change.',
      {
        job_number: jobNumber,
        priority: { type: 'integer', minimum: 0, maximum: 5, description: 'P0-P5, lower number = more urgent.' },
        due_date: { type: 'string', description: 'New due date as YYYY-MM-DD.' },
        notes: { type: 'string', description: 'Card note (replaces the current one).' },
        assigned_to: { type: 'string', description: 'Employee name.' },
        quantity: { type: 'string', description: 'Number of pieces.' },
        out_service: { type: 'string', description: 'Outside services needed (e.g. phosphate, NDE).' },
      },
      ['job_number']
    ),
    fn(
      'add_history_note',
      "Add a note to a job's history log without changing anything else.",
      { job_number: jobNumber, note: { type: 'string' } },
      ['job_number', 'note']
    ),
    fn(
      'ship_job',
      'Mark a job that is in READY TO SHIP as shipped (it leaves the board).',
      { job_number: jobNumber },
      ['job_number']
    ),
    fn(
      'return_shipped_job',
      'Bring a shipped job back to the active board.',
      { job_number: jobNumber },
      ['job_number']
    ),
    fn(
      'add_extra_part',
      'Store a leftover/extra piece in the extra parts inventory.',
      {
        job_number: jobNumber,
        place: { type: 'string', enum: [...PLACE_OPTIONS] },
        quantity: { type: 'string' },
        employee_name: { type: 'string' },
        notes: { type: 'string' },
      },
      ['job_number', 'place']
    ),
    fn(
      'remove_extra_part',
      'Mark an in-stock extra part as taken out of inventory.',
      {
        job_number: { type: 'string', description: 'JOB# of the extra part.' },
        part_number: { type: 'string', description: 'Part# of the extra part, if no JOB#.' },
        place: { type: 'string', description: 'Where it is stored, to tell apart several entries.' },
      },
      []
    ),
  ];
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/**
 * Turns the model's tool calls into concrete, validated API requests. Nothing
 * is written here -- the client runs the returned actions only after the user
 * confirms. Anything that can't be resolved (unknown job, wrong stage, ...)
 * comes back as a human-readable error instead.
 */
export async function resolveToolCalls(
  toolCalls: ToolCall[],
  lang: AssistantLang
): Promise<{ actions: AssistantAction[]; errors: string[] }> {
  const t = (es: string, en: string) => (lang === 'es' ? es : en);
  const [jobs, departments, extraParts] = await Promise.all([
    jobsDB.findAll(),
    departmentsDB.findAll(),
    extraPartsDB.findAll(),
  ]);

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? id;
  const findJob = (num?: string) =>
    jobs.find((j) => norm(j.jobNumber || j.title) === norm(num));

  const actions: AssistantAction[] = [];
  const errors: string[] = [];

  for (const call of toolCalls) {
    const name = call.function?.name ?? '';
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(call.function?.arguments || '{}');
    } catch {
      continue;
    }

    if (name === 'remove_extra_part') {
      const matches = extraParts.filter(
        (p) =>
          p.active &&
          (!args.job_number || norm(p.jobNumber) === norm(args.job_number)) &&
          (!args.part_number || norm(p.partNumber) === norm(args.part_number)) &&
          (!args.place || norm(p.place) === norm(args.place))
      );
      const what = args.job_number ? `JOB# ${args.job_number}` : `Part# ${args.part_number ?? '?'}`;
      if (!args.job_number && !args.part_number) {
        errors.push(t('¿De qué JOB# o Part# es la pieza extra?', 'Which JOB# or Part# is the extra part from?'));
      } else if (matches.length === 0) {
        errors.push(t(`No hay pieza extra en inventario de ${what}.`, `No in-stock extra part found for ${what}.`));
      } else if (matches.length > 1) {
        const places = matches.map((p) => p.place || '?').join(', ');
        errors.push(t(`Hay ${matches.length} piezas extra de ${what} (${places}). ¿Cuál?`, `There are ${matches.length} extra parts for ${what} (${places}). Which one?`));
      } else {
        const p = matches[0];
        actions.push({
          label: t(`Sacar pieza extra de ${what} (${p.place || 'sin lugar'})`, `Take out extra part for ${what} (${p.place || 'no place'})`),
          method: 'PUT',
          path: `/api/extra-parts/${p.id}`,
          body: { active: false, exitDate: today() },
        });
      }
      continue;
    }

    const job = findJob(args.job_number);
    if (!job) {
      errors.push(t(`No encontré el JOB# ${args.job_number ?? '?'}.`, `Couldn't find JOB# ${args.job_number ?? '?'}.`));
      continue;
    }
    const jobLabel = `JOB# ${job.jobNumber || job.title}`;
    const jobPath = `/api/jobs/${job.id}`;

    switch (name) {
      case 'move_job': {
        const dept = departments.find((d) => norm(d.name) === norm(args.department));
        if (!dept) {
          errors.push(t(`No existe el departamento "${args.department}".`, `There's no department "${args.department}".`));
        } else if (dept.id === job.departmentId) {
          errors.push(t(`${jobLabel} ya está en ${dept.name}.`, `${jobLabel} is already in ${dept.name}.`));
        } else {
          const label = t(
            `Mover ${jobLabel}: ${deptName(job.departmentId)} → ${dept.name}`,
            `Move ${jobLabel}: ${deptName(job.departmentId)} → ${dept.name}`
          );
          actions.push({
            label,
            method: 'PUT',
            path: jobPath,
            body: { targetDeptId: dept.id, ...(args.notes ? { notes: args.notes } : {}) },
            jobId: job.id,
            annotation: `${ASSISTANT_TAG}: ${label}`,
          });
        }
        break;
      }
      case 'set_in_progress': {
        const wanted = !!args.in_progress;
        if (!!job.inProgress === wanted) {
          errors.push(
            wanted
              ? t(`${jobLabel} ya está en progreso.`, `${jobLabel} is already in progress.`)
              : t(`${jobLabel} no está en progreso.`, `${jobLabel} isn't in progress.`)
          );
        } else {
          // The route toggles and logs its own history entry, so no annotation.
          actions.push({
            label: wanted
              ? t(`Iniciar progreso de ${jobLabel} en ${deptName(job.departmentId)}`, `Start progress on ${jobLabel} in ${deptName(job.departmentId)}`)
              : t(`Pausar ${jobLabel}`, `Pause ${jobLabel}`),
            method: 'POST',
            path: `${jobPath}/in-progress`,
            jobId: job.id,
          });
        }
        break;
      }
      case 'update_job': {
        const body: Record<string, unknown> = {};
        const changes: string[] = [];
        if (Number.isInteger(args.priority) && args.priority >= 0 && args.priority <= 5) {
          body.priority = args.priority;
          changes.push(`P${args.priority}`);
        }
        if (typeof args.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date)) {
          body.dueDate = args.due_date;
          changes.push(t(`fecha ${args.due_date}`, `due ${args.due_date}`));
        }
        if (typeof args.notes === 'string') {
          body.notes = args.notes;
          changes.push(t(`nota "${args.notes}"`, `note "${args.notes}"`));
        }
        if (typeof args.assigned_to === 'string' && args.assigned_to.trim()) {
          body.assignedTo = args.assigned_to.trim();
          changes.push(t(`asignado a ${body.assignedTo}`, `assigned to ${body.assignedTo}`));
        }
        if (typeof args.quantity === 'string' && args.quantity.trim()) {
          body.quantity = args.quantity.trim();
          changes.push(t(`${body.quantity} pzas`, `${body.quantity} pcs`));
        }
        if (typeof args.out_service === 'string') {
          body.outService = args.out_service;
          changes.push(`O.S: ${args.out_service}`);
        }
        if (!changes.length) {
          errors.push(t(`¿Qué quieres cambiar en ${jobLabel}?`, `What should I change on ${jobLabel}?`));
          break;
        }
        const label = t(`Cambiar ${jobLabel}: ${changes.join(', ')}`, `Update ${jobLabel}: ${changes.join(', ')}`);
        actions.push({ label, method: 'PUT', path: jobPath, body, jobId: job.id, annotation: `${ASSISTANT_TAG}: ${label}` });
        break;
      }
      case 'add_history_note': {
        const note = String(args.note ?? '').trim();
        if (!note) break;
        actions.push({
          label: t(`Nota en ${jobLabel}: "${note}"`, `Note on ${jobLabel}: "${note}"`),
          method: 'PUT',
          path: jobPath,
          body: { annotation: `${ASSISTANT_TAG}: ${note}` },
          jobId: job.id,
        });
        break;
      }
      case 'ship_job': {
        if (job.shipped) {
          errors.push(t(`${jobLabel} ya fue enviado.`, `${jobLabel} was already shipped.`));
        } else if (norm(deptName(job.departmentId)) !== READY_TO_SHIP) {
          errors.push(t(
            `${jobLabel} está en ${deptName(job.departmentId)}, solo se puede enviar desde READY TO SHIP.`,
            `${jobLabel} is in ${deptName(job.departmentId)}; only jobs in READY TO SHIP can be shipped.`
          ));
        } else {
          const label = t(`Enviar (Ship) ${jobLabel}`, `Ship ${jobLabel}`);
          actions.push({ label, method: 'PUT', path: jobPath, body: { shipAction: 'ship' }, jobId: job.id, annotation: `${ASSISTANT_TAG}: ${label}` });
        }
        break;
      }
      case 'return_shipped_job': {
        if (!job.shipped) {
          errors.push(t(`${jobLabel} no está enviado.`, `${jobLabel} isn't shipped.`));
        } else {
          const label = t(`Regresar ${jobLabel} a activos`, `Return ${jobLabel} to active`);
          actions.push({ label, method: 'PUT', path: jobPath, body: { shipAction: 'return' }, jobId: job.id, annotation: `${ASSISTANT_TAG}: ${label}` });
        }
        break;
      }
      case 'add_extra_part': {
        const place = PLACE_OPTIONS.find((p) => norm(p) === norm(args.place));
        if (!place) {
          errors.push(t(`El lugar "${args.place ?? ''}" no existe.`, `Place "${args.place ?? ''}" doesn't exist.`));
          break;
        }
        const qty = String(args.quantity ?? '').trim();
        actions.push({
          label: t(
            `Guardar pieza extra de ${jobLabel}${qty ? ` (${qty} pzas)` : ''} en ${place}`,
            `Store extra part from ${jobLabel}${qty ? ` (${qty} pcs)` : ''} in ${place}`
          ),
          method: 'POST',
          path: '/api/extra-parts',
          body: {
            jobId: job.id,
            jobNumber: job.jobNumber,
            company: job.customer,
            dwgNumber: job.dwgNumber,
            partNumber: job.partNumber,
            poNumber: job.poNumber,
            name: job.name,
            heatNumber: job.heatNumber,
            partQty: qty || undefined,
            place,
            partDate: today(),
            employeeName: args.employee_name || undefined,
            partNotes: args.notes || undefined,
            active: true,
          },
        });
        break;
      }
    }
  }

  return { actions, errors };
}
