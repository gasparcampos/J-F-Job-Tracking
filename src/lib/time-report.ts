/**
 * Part Time Report — client-side PDF generator (jspdf).
 *
 * Produces a one-part report with:
 *   - the job's identifying info (JOB#, part#, DWG#, customer, PO, dates)
 *   - a table of time worked per department (from the deptTimes tracking)
 *   - the grand total (formatted and in decimal hours)
 *   - the full movement history (department, employee, notes, timestamps)
 *
 * Loaded via dynamic import so jspdf stays out of the main bundle.
 */

import type { Job, Department } from '@/types';
import { formatDuration } from './utils';

const ORANGE: [number, number, number] = [249, 115, 22];
const DARK: [number, number, number] = [30, 30, 30];
const GRAY: [number, number, number] = [110, 110, 110];
const LIGHT_ROW: [number, number, number] = [245, 245, 245];

const PAGE_W = 612; // letter, pt
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// jspdf's built-in Helvetica only covers Latin-1: emoji in history notes
// (🔥 ⏱ 🚚 …) come out as garbage and break glyph spacing. Strip anything
// outside the safe range before drawing.
function pdfSafe(s: string): string {
  return s
    .replace(/[^\x20-\x7E -ÿ–—‘’“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function generateTimeReportPdf(
  job: Job,
  departments: Department[],
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const deptName = (id?: string) =>
    departments.find((d) => d.id === id)?.name ?? (id || '—');

  let y = 0;

  const ensureRoom = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // ---------- Header band ----------
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, PAGE_W, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('PART TIME REPORT', MARGIN, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `JF Job Tracker — generated ${new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    MARGIN,
    48,
  );
  y = 88;

  // ---------- Job title ----------
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const titleLines = doc.splitTextToSize(pdfSafe(job.title || 'Untitled job'), CONTENT_W);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 15 + 6;

  // ---------- Info grid (two columns of label/value pairs) ----------
  const info: Array<[string, string]> = [];
  if (job.jobNumber) info.push(['JOB#', job.jobNumber]);
  if (job.partNumber) info.push(['PART#', job.partNumber]);
  if (job.dwgNumber) info.push(['DWG#', job.dwgNumber]);
  if (job.customer) info.push(['CUSTOMER', job.customer]);
  if (job.poNumber) info.push(['PO#', job.poNumber]);
  if (job.quantity) info.push(['QTY', job.quantity]);
  if (job.dueDate) info.push(['DUE DATE', job.dueDate]);
  if (job.shippedAt)
    info.push([
      'SHIPPED',
      new Date(job.shippedAt).toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    ]);
  if (job.assignedTo) info.push(['LAST ASSIGNED', job.assignedTo]);

  doc.setFontSize(9);
  const colW = CONTENT_W / 2;
  const rowH = 14;
  info.forEach(([label, value], i) => {
    const col = i % 2;
    const x = MARGIN + col * colW;
    if (col === 0 && i > 0) y += rowH;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GRAY);
    doc.text(`${label}:`, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    doc.text(pdfSafe(String(value)), x + 78, y, { maxWidth: colW - 86 });
  });
  y += rowH + 14;

  // ---------- Time per department ----------
  const times = job.deptTimes ?? {};
  const timedDepts = departments.filter((d) => (times[d.id] ?? 0) > 0);
  // Include time recorded for departments that were later deleted.
  const orphanIds = Object.keys(times).filter(
    (id) => (times[id] ?? 0) > 0 && !departments.some((d) => d.id === id),
  );
  const totalMs =
    Object.values(times).reduce((sum, v) => sum + (v || 0), 0);

  ensureRoom(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ORANGE);
  doc.text('TIME WORKED PER DEPARTMENT', MARGIN, y);
  y += 8;
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(1);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 14;

  if (timedDepts.length === 0 && orphanIds.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(
      'No worked time was recorded for this part (the In Progress clock was never used).',
      MARGIN,
      y,
    );
    y += 20;
  } else {
    const rows: Array<[string, number]> = [
      ...timedDepts.map((d): [string, number] => [d.name, times[d.id]]),
      ...orphanIds.map((id): [string, number] => [`(removed area ${id})`, times[id]]),
    ];
    const tRowH = 18;
    rows.forEach(([name, ms], i) => {
      ensureRoom(tRowH + 30);
      if (i % 2 === 0) {
        doc.setFillColor(...LIGHT_ROW);
        doc.rect(MARGIN, y - 12, CONTENT_W, tRowH, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      doc.text(pdfSafe(name.toUpperCase()), MARGIN + 6, y);
      doc.setFont('helvetica', 'bold');
      doc.text(formatDuration(ms), MARGIN + CONTENT_W - 6, y, { align: 'right' });
      y += tRowH;
    });

    // Total row
    ensureRoom(30);
    doc.setFillColor(...ORANGE);
    doc.rect(MARGIN, y - 12, CONTENT_W, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL BUILD TIME', MARGIN + 6, y + 2);
    const hours = totalMs / 3600000;
    doc.text(
      `${formatDuration(totalMs)}  (${hours.toFixed(2)} h)`,
      MARGIN + CONTENT_W - 6,
      y + 2,
      { align: 'right' },
    );
    y += 34;
  }

  // ---------- Movement history ----------
  const history = [...(job.history ?? [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  ensureRoom(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ORANGE);
  doc.text('MOVEMENT HISTORY', MARGIN, y);
  y += 8;
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 14;

  doc.setFontSize(8.5);
  for (const h of history) {
    const when = new Date(h.timestamp).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const route = h.fromDeptId
      ? `${deptName(h.fromDeptId)} -> ${deptName(h.toDeptId)}`
      : deptName(h.toDeptId);
    const who = h.employeeName ? `  ·  ${h.employeeName}` : '';
    const headLine = pdfSafe(`${when}   ${route}${who}`);

    const cleanNotes = h.notes ? pdfSafe(h.notes) : '';
    const noteLines = cleanNotes
      ? doc.splitTextToSize(cleanNotes, CONTENT_W - 18)
      : [];
    ensureRoom(12 + noteLines.length * 10 + 6);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(headLine, MARGIN, y);
    y += 11;
    if (noteLines.length) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY);
      doc.text(noteLines, MARGIN + 18, y);
      y += noteLines.length * 10;
    }
    y += 5;
  }

  // ---------- Footer with page numbers ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 24, { align: 'right' });
    if (job.jobNumber) {
      doc.text(`JOB# ${job.jobNumber}`, MARGIN, PAGE_H - 24);
    }
  }

  return doc.output('blob');
}
