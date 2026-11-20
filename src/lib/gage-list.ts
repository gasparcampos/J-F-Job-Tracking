import type { Gage } from '@/types';
import { fmtAccessDate } from './job-lookup';
import { printHtml, escHtml } from './print-html';

/**
 * Gage owner filter + the "loaned gages" list (Excel / print), so the shop
 * knows which gages belong to a customer and still have to go back.
 */

export type GageFilter = 'all' | 'in-house' | 'loaned' | 'to-return';

export const isLoaned = (g: Gage) => g.ownership === 'customer';
/** Lent by a customer and not given back yet. */
export const isToReturn = (g: Gage) => isLoaned(g) && !g.returnedDate;

export function filterGages(gages: Gage[], filter: GageFilter): Gage[] {
  switch (filter) {
    case 'in-house':
      return gages.filter((g) => !isLoaned(g));
    case 'loaned':
      return gages.filter(isLoaned);
    case 'to-return':
      return gages.filter(isToReturn);
    default:
      return gages;
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Days we have had (or had) a loaned gage: received -> returned or today. */
export function daysHeld(g: Gage): string {
  if (!isLoaned(g) || !g.receivedDate) return '';
  const from = Date.parse(g.receivedDate);
  const to = Date.parse(g.returnedDate || todayIso());
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '';
  return String(Math.max(0, Math.round((to - from) / 86400000)));
}

/** Loaned gages grouped per customer, e.g. [['BAKER HUGHES', 3], ...]. */
export function countByLender(gages: Gage[]): [string, number][] {
  const m = new Map<string, number>();
  for (const g of gages) {
    const k = (g.loanedBy || 'CUSTOMER').trim().toUpperCase();
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const COLUMNS: [header: string, value: (g: Gage) => string][] = [
  ['OWNER', (g) => (isLoaned(g) ? (g.loanedBy || 'CUSTOMER').toUpperCase() : 'IN-HOUSE')],
  ['STATUS', (g) => (!isLoaned(g) ? '' : g.returnedDate ? 'RETURNED' : 'TO RETURN')],
  ['JOB#', (g) => g.jobNumber || ''],
  ['COMPANY', (g) => g.company || ''],
  ['DWG#', (g) => g.dwgNumber || ''],
  ['PART#', (g) => g.partNumber || ''],
  ['NAME', (g) => g.name || ''],
  ['QTY', (g) => g.qty || ''],
  ['PLACE', (g) => g.place || ''],
  ['RECEIVED', (g) => (isLoaned(g) ? fmtAccessDate(g.receivedDate) : '')],
  ['RETURNED', (g) => (isLoaned(g) ? fmtAccessDate(g.returnedDate) : '')],
  ['DAYS WITH US', daysHeld],
  ['NOTES', (g) => g.notes || ''],
];

// Customer first, then oldest received first (longest-held on top).
function sortForList(gages: Gage[]): Gage[] {
  return [...gages].sort(
    (a, b) =>
      Number(isLoaned(b)) - Number(isLoaned(a)) ||
      (a.loanedBy || '').localeCompare(b.loanedBy || '') ||
      (a.receivedDate || '').localeCompare(b.receivedDate || '')
  );
}

const FILTER_TITLE: Record<GageFilter, string> = {
  all: 'All Gages',
  'in-house': 'In-House Gages',
  loaned: 'Customer Loaned Gages',
  'to-return': 'Customer Gages To Return',
};

/** Downloads the list as a CSV that opens straight in Excel. */
export function downloadGagesExcel(gages: Gage[], filter: GageFilter) {
  const cell = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const lines = [
    COLUMNS.map(([h]) => cell(h)).join(','),
    ...sortForList(gages).map((g) => COLUMNS.map(([, f]) => cell(f(g))).join(',')),
  ];
  // BOM so Excel reads accents / symbols as UTF-8.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${FILTER_TITLE[filter].replace(/\s+/g, '-')}_${todayIso()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Prints the list (one table, with a per-customer count on top). */
export function printGagesList(gages: Gage[], filter: GageFilter) {
  const rows = sortForList(gages);
  const loaned = rows.filter(isLoaned);
  const summary = loaned.length
    ? countByLender(loaned).map(([c, n]) => `${escHtml(c)}: <b>${n}</b>`).join(' &nbsp;·&nbsp; ')
    : '';
  const head = COLUMNS.map(([h]) => `<th>${escHtml(h)}</th>`).join('');
  const body = rows
    .map((g) => `<tr>${COLUMNS.map(([, f]) => `<td>${escHtml(f(g))}</td>`).join('')}</tr>`)
    .join('');

  printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(FILTER_TITLE[filter])}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      .print-page { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
      h1 { font-size: 16px; margin: 0 0 2px; }
      .sub { font-size: 11px; margin-bottom: 8px; color: #333; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th { text-align: left; background: #eee; border: 1px solid #999; padding: 3px 4px; white-space: nowrap; }
      td { border: 1px solid #bbb; padding: 3px 4px; vertical-align: top; }
    </style></head><body>
    <h1>J&amp;F Machine Shop — ${escHtml(FILTER_TITLE[filter])}</h1>
    <div class="sub">${fmtAccessDate(todayIso())} · ${rows.length} gage(s)${summary ? ` · ${summary}` : ''}</div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </body></html>`);
}
