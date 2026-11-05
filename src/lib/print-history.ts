import type { Job, Department } from '@/types';
import { formatDuration } from './utils';
import { moveInfo, deptLabel } from './history-format';
import { printHtml, escHtml as esc } from './print-html';

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US')} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * Prints a job's full history as a clean white page: job details, time
 * worked per department and every history entry (oldest first). Uses a
 * hidden iframe so no popup window is needed.
 */
export function printJobHistory(
  job: Job,
  departments: Department[],
  workedTimes: Record<string, number>
) {
  const current = deptLabel(departments, job.departmentId);

  const details: Array<[string, string | undefined]> = [
    ['JOB#', job.jobNumber],
    ['Name', job.name],
    ['Customer', job.customer],
    ['PO#', job.poNumber],
    ['Line', job.line],
    ['DWG#', job.dwgNumber],
    ['Part#', job.partNumber],
    ['QTY', job.quantity],
    ['Due date', job.dueDate],
    ['Material PO', job.materialPo],
    ['Heat#', job.heatNumber],
    ['HRC', job.hrc],
    ['Out service', job.outService],
    ['Deviation', job.deviation],
    [
      'Status',
      job.shipped
        ? `SHIPPED${job.shippedAt ? ` — ${fmtDateTime(job.shippedAt)}` : ''}`
        : current?.name,
    ],
    ['Assigned to', job.assignedTo],
  ];
  const detailRows = details
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`)
    .join('');

  const timed = Object.entries(workedTimes).filter(([, ms]) => (ms ?? 0) > 0);
  const totalMs = timed.reduce((s, [, ms]) => s + ms, 0);
  // Departments in route order, then any unknown ones.
  timed.sort((a, b) => {
    const ia = departments.findIndex((d) => d.id === a[0]);
    const ib = departments.findIndex((d) => d.id === b[0]);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const timeRows = timed
    .map(
      ([id, ms]) =>
        `<tr><td>${esc(deptLabel(departments, id)?.name)}</td><td class="num">${esc(formatDuration(ms))}</td></tr>`
    )
    .join('');

  const history = [...(job.history ?? [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const historyRows = history
    .map((h, i) => {
      const move = moveInfo(h, departments);
      const where = move
        ? `<span class="tag">MOVED</span> ${esc(move.from.name)} &rarr; <b>${esc(move.to.name)}</b>`
        : esc(deptLabel(departments, h.toDeptId, h.toDeptName)?.name ?? '');
      return `<tr>
        <td class="num">${i + 1}</td>
        <td class="nowrap">${esc(fmtDateTime(h.timestamp))}</td>
        <td>${where}</td>
        <td>${esc(h.employeeName ?? '')}</td>
        <td>${esc(h.notes ?? '')}</td>
      </tr>`;
    })
    .join('');

  const title = `History ${job.jobNumber ? `JOB# ${job.jobNumber}` : job.title}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; }
  :root { color-scheme: light; }
  html, body { background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  header h1 { font-size: 18px; margin: 0; }
  header .shop { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #444; }
  header .printed { font-size: 10px; color: #444; text-align: right; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 14px 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
  .details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; }
  .kv { display: flex; gap: 6px; border-bottom: 1px dotted #ccc; padding: 2px 0; }
  .kv span { color: #555; min-width: 70px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 10px; text-transform: uppercase; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .nowrap { white-space: nowrap; }
  .tag { font-size: 8px; font-weight: bold; border: 1px solid #666; border-radius: 3px; padding: 0 3px; }
  .time { width: 50%; }
  .total td { font-weight: bold; background: #f4f4f4; }
  .sign { display: flex; gap: 40px; margin-top: 28px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 3px; font-size: 10px; color: #444; }
</style></head><body>
<header>
  <div>
    <div class="shop">J&amp;F Machine Shop</div>
    <h1>Job History — ${esc(job.jobNumber ? `JOB# ${job.jobNumber}` : job.title)}</h1>
  </div>
  <div class="printed">Printed ${esc(fmtDateTime(new Date().toISOString()))}</div>
</header>

<h2>Job details</h2>
<div class="details">${detailRows || `<div class="kv"><b>${esc(job.title)}</b></div>`}</div>

${
  timed.length
    ? `<h2>Time worked per department</h2>
<table class="time"><thead><tr><th>Department</th><th class="num">Time</th></tr></thead>
<tbody>${timeRows}<tr class="total"><td>Total</td><td class="num">${esc(formatDuration(totalMs))}</td></tr></tbody></table>`
    : ''
}

<h2>History (${history.length} entries)</h2>
${
  history.length
    ? `<table><thead><tr><th>#</th><th>Date / time</th><th>Department / move</th><th>Employee</th><th>Note</th></tr></thead>
<tbody>${historyRows}</tbody></table>`
    : '<p>No history entries.</p>'
}

<div class="sign"><div>Reviewed by</div><div>Date</div></div>
</body></html>`;

  printHtml(html);
}
