import { jobsDB, departmentsDB } from './json-db';

// Days until the due date (negative = overdue). No date -> null.
// Mirrors the same day-math used in jobs-table.tsx so the assistant's
// "due soon" reasoning matches what the owner sees in the Table view.
function daysUntil(dueDate?: string): number | null {
  if (!dueDate) return null;
  const m = String(dueDate).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/**
 * Builds a plain-text snapshot of every job + department, formatted for
 * the assistant's system prompt. Sent fresh on every chat turn instead of
 * a retrieval/search layer -- the job count is small enough that dumping
 * the full list is cheaper to build and more reliable than search.
 */
export async function buildJobsContext(): Promise<string> {
  const [jobs, departments] = await Promise.all([
    jobsDB.findAll(),
    departmentsDB.findAll(),
  ]);

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA'); // YYYY-MM-DD

  const lines = jobs.map((job) => {
    const days = daysUntil(job.dueDate);
    const dueInfo = !job.dueDate
      ? 'no due date'
      : days === null
      ? job.dueDate
      : days < 0
      ? `${job.dueDate} (${Math.abs(days)} days OVERDUE)`
      : days === 0
      ? `${job.dueDate} (due TODAY)`
      : `${job.dueDate} (${days} days left)`;

    const parts = [
      `JOB# ${job.jobNumber || job.title}`,
      job.name ? `Name: ${job.name}` : null,
      job.customer ? `Customer: ${job.customer}` : null,
      job.poNumber ? `PO#: ${job.poNumber}` : null,
      job.line ? `Line Item: ${job.line}` : null,
      job.quantity ? `Quantity (pieces): ${job.quantity}` : null,
      job.dwgNumber ? `DWG#: ${job.dwgNumber}` : null,
      job.partNumber ? `Part#: ${job.partNumber}` : null,
      `Department: ${deptName(job.departmentId)}`,
      `Due: ${dueInfo}`,
      job.outService ? `Outside services needed: ${job.outService}` : null,
      job.notes ? `Notes: ${job.notes}` : null,
      job.deviation ? `Deviation: ${job.deviation} (status: ${job.deviationStatus || 'pending'})` : null,
    ].filter(Boolean);

    return `- ${parts.join(' | ')}`;
  });

  const deptNames = departments
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((d) => d.name);

  return [
    `Today's date is ${todayStr}.`,
    `Valid department names (use these exact names if asked to move a job): ${deptNames.join(', ')}.`,
    `There are ${jobs.length} jobs currently in the shop:`,
    ...lines,
  ].join('\n');
}
