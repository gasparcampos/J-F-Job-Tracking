'use client';

import { useMemo, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { PoLookups, PoReportRow } from '@/types/po';
import { money, todayIso, usDate } from '@/lib/po-shared';
import { printHtml, escHtml as esc } from '@/lib/print-html';
import { PO_FIELD, PO_LABEL } from './po-form-modal';

type ReportKind = 'company' | 'employee' | 'catDetails' | 'catTotal' | 'priceNeeds';

/** The TONY-ONLY buttons, each with the Access parameter form it opened. */
const REPORTS: Array<{ kind: ReportKind; button: string; title: string; params: Array<'supplier' | 'employee' | 'description'> }> = [
  { kind: 'company', button: 'COMPANY', title: 'BY: Company', params: ['supplier'] },
  { kind: 'employee', button: 'EMPLOYEES', title: 'BY: EMPLOYEE', params: ['employee'] },
  { kind: 'catDetails', button: 'Categories BY DETAILS', title: 'CATEGORIES BY: DETAILS', params: ['description'] },
  { kind: 'catTotal', button: 'Categories BY TOTAL', title: 'CATEGORIES TOTAL', params: ['description'] },
  { kind: 'priceNeeds', button: 'PRICE NEEDS', title: 'PRICE NEEDS BY: EMPLOYEES', params: ['employee'] },
];

interface Group {
  key: string;
  label: string;
  rows: PoReportRow[];
  total: number;
}

const firstOfMonth = () => `${todayIso().slice(0, 8)}01`;
const sub = (r: PoReportRow) => r.units * r.unitPrice;
// Employee names are stored "Last, First"; Access filtered by first name.
const firstName = (n: string) => (n.split(',')[1] ?? n).trim().toUpperCase();

/** TONY-ONLY cost reports: date range + supplier / employee / category. */
export function PoReports({ lookups }: { lookups: PoLookups }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<ReportKind>('company');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const [supplierId, setSupplierId] = useState(''); // '' = All Suppliers
  const [employee, setEmployee] = useState('');
  const [description, setDescription] = useState(''); // '' = All
  const [rows, setRows] = useState<PoReportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const report = REPORTS.find((r) => r.kind === kind)!;

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pos/report?from=${from}&to=${to}`);
      if (!res.ok) throw new Error();
      setRows(await res.json());
    } catch {
      toast({ title: 'Could not build the report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const descriptions = useMemo(() => [...new Set((rows ?? []).map((r) => r.description).filter(Boolean))].sort(), [rows]);

  const groups: Group[] = useMemo(() => {
    if (!rows) return [];
    let list = rows;
    if (report.params.includes('supplier') && supplierId) list = list.filter((r) => r.supplierId === supplierId);
    if (report.params.includes('employee') && employee) list = list.filter((r) => firstName(r.employeeName) === employee);
    if (report.params.includes('description') && description) list = list.filter((r) => r.description === description);
    if (kind === 'priceNeeds') list = list.filter((r) => !r.priced);
    const keyOf = (r: PoReportRow) =>
      kind === 'catTotal' ? r.description || '(none)' : kind === 'catDetails' ? `${r.description}` : r.supplierName || '(no supplier)';
    const map = new Map<string, Group>();
    for (const r of list) {
      const k = keyOf(r);
      const g = map.get(k) ?? { key: k, label: k, rows: [], total: 0 };
      g.rows.push(r);
      g.total += sub(r);
      map.set(k, g);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, report, supplierId, employee, description, kind]);
  const grand = groups.reduce((s, g) => s + g.total, 0);

  const employeeNames = [...new Set(lookups.employees.map((e) => e.firstName.toUpperCase()).filter(Boolean))].sort();

  const print = () => {
    const body = groups
      .map(
        (g) => `<h3>${esc(g.label)}</h3>
        ${
          kind === 'catTotal'
            ? ''
            : `<table><thead><tr><th>Purchase Order</th><th>Order Date</th>${kind === 'company' ? '' : '<th>Company</th>'}<th>Employee</th><th>PROD_DESCRIP</th><th>Units</th><th>Unit Price</th><th>TOTAL</th></tr></thead><tbody>
          ${g.rows
            .map(
              (r) => `<tr><td>${r.poNumber}</td><td>${usDate(r.orderDate)}</td>${kind === 'company' ? '' : `<td>${esc(r.supplierName)}</td>`}<td>${esc(r.employeeName)}</td><td>${esc(r.prodDescrip)}</td><td class="r">${r.units}</td><td class="r">${money(r.unitPrice)}</td><td class="r">${money(sub(r))}</td></tr>`
            )
            .join('')}</tbody></table>`
        }
        <p class="t">TOTAL ${money(g.total)}</p>`
      )
      .join('');
    printHtml(`<!doctype html><html><head><title>${esc(report.title)}</title><style>
      @page { size: letter; margin: 0.5in; }
      .print-page { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
      h1 { font-size: 18px; margin: 0; } h3 { margin: 12px 0 4px; font-size: 12px; border-bottom: 1px solid #000; }
      table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #999; padding: 2px 4px; text-align: left; }
      th { background: #eee; } .r { text-align: right; } .t { text-align: right; font-weight: 700; margin: 2px 0; }
      .g { text-align: right; font-size: 14px; font-weight: 800; border-top: 2px solid #000; margin-top: 10px; padding-top: 4px; }
    </style></head><body>
      <h1>${esc(report.title)}</h1><div>Between ${usDate(from)} And ${usDate(to)} · ${new Date().toLocaleString()}</div>
      ${body}<div class="g">GRAN TOTAL ${money(grand)}</div></body></html>`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {REPORTS.map((r) => (
            <Button key={r.kind} size="sm" variant={kind === r.kind ? 'default' : 'outline'} onClick={() => setKind(r.kind)}>
              {r.button}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={PO_LABEL}>Start Date</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={PO_LABEL}>End Date</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {report.params.includes('supplier') && (
            <div className="min-w-[240px]">
              <label className={PO_LABEL}>Supplier</label>
              <select className={PO_FIELD} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">All Suppliers</option>
                {lookups.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {report.params.includes('employee') && (
            <div className="min-w-[180px]">
              <label className={PO_LABEL}>Employee</label>
              <select className={PO_FIELD} value={employee} onChange={(e) => setEmployee(e.target.value)}>
                <option value="">All</option>
                {employeeNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
          {report.params.includes('description') && (
            <div className="min-w-[220px]">
              <label className={PO_LABEL}>Categories (Description)</label>
              <select className={PO_FIELD} value={description} onChange={(e) => setDescription(e.target.value)}>
                <option value="">All</option>
                {descriptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          <Button onClick={run} disabled={loading} className="gap-1.5">
            {loading && <Loader2 size={14} className="animate-spin" />} OK
          </Button>
          {rows && groups.length > 0 && (
            <Button variant="outline" onClick={print} className="gap-1.5">
              <Printer size={14} /> Print
            </Button>
          )}
        </div>
      </div>

      {rows && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-bold">
              {report.title} <span className="text-xs font-normal text-muted-foreground">Between {usDate(from)} And {usDate(to)}</span>
            </h3>
            <span className="font-bold">GRAN TOTAL {money(grand)}</span>
          </div>
          {!groups.length && <p className="text-sm text-muted-foreground">Nothing in that range.</p>}
          {groups.map((g) => (
            <div key={g.key} className="mb-3">
              <div className="flex justify-between border-b border-border font-semibold text-sm py-1">
                <span>{g.label}</span>
                <span>TOTAL {money(g.total)}</span>
              </div>
              {kind !== 'catTotal' && (
                <table className="w-full text-xs">
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-0.5 pr-2 w-16 font-semibold">{r.poNumber}</td>
                        <td className="pr-2 w-20">{usDate(r.orderDate)}</td>
                        {kind !== 'company' && <td className="pr-2">{r.supplierName}</td>}
                        <td className="pr-2">{r.employeeName}</td>
                        <td className="pr-2">{r.prodDescrip}</td>
                        <td className="pr-2 text-right w-12">{r.units}</td>
                        <td className="pr-2 text-right w-20">{money(r.unitPrice)}</td>
                        <td className="text-right w-24">{money(sub(r))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
