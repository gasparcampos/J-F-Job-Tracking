'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Paperclip, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Department, Job } from '@/types';
import type { PoLookups, PoSummary, PoSupplier } from '@/types/po';
import { KIND_LABEL, daysOver, money, todayIso, usDate } from '@/lib/po-shared';
import { PoFormModal } from './po-form-modal';
import { PoSupplierModal } from './po-supplier-modal';
import { PoReports } from './po-reports';
import { PoSetup } from './po-setup';

type View = 'outside' | 'all' | 'suppliers' | 'reports' | 'setup';
const TH = 'px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap';
const TD = 'px-2 py-1.5 text-xs';
const PAGE = 200;

const EMPTY_LOOKUPS: PoLookups = {
  suppliers: [],
  employees: [],
  shippingMethods: [],
  company: { name: '', address: '', city: '', state: '', postalCode: '', country: '', phone: '', fax: '', email: '' },
};

const norm = (s: unknown) => String(s ?? '').toLowerCase();

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-80">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-8 pr-8 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

interface Props {
  jobs: Job[];
  departments: Department[];
  /** Bumped by the board's live sync: reload when it changes. */
  refreshKey: number;
  /** Open this PO (e.g. from a link). */
  openPo?: string | null;
  onOpenPoHandled?: () => void;
  onCountChange?: (activeCount: number) => void;
  /** Leave POs, back to the job tabs. */
  onBack?: () => void;
}

/**
 * The Access PO system inside the tracker. OUTSIDE = the POs still out
 * (Access startup screen), OLD FILES = every PO (MAIN-VIEW), SUPPLIERS,
 * REPORTS (TONY-ONLY) and SETUP (employees, shipping methods, company).
 */
export function PurchaseOrdersView({ jobs, departments, refreshKey, openPo, onOpenPoHandled, onCountChange, onBack }: Props) {
  const [view, setView] = useState<View>('outside');
  const [pos, setPos] = useState<PoSummary[] | null>(null);
  const [lookups, setLookups] = useState<PoLookups>(EMPTY_LOOKUPS);
  const [error, setError] = useState('');
  const [poId, setPoId] = useState<string | null>(null);
  const [supplierEdit, setSupplierEdit] = useState<{ s: PoSupplier | null; done?: (s: PoSupplier) => void } | undefined>();

  // One search: PO#, supplier, DWG/Part, WO, MAT-TYPE, HT#, description, line text.
  const [q, setQ] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [supQ, setSupQ] = useState('');

  // The PO list is big (~7,000 rows): only re-read it when it changed (ETag).
  const etagRef = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      const p = await fetch('/api/pos', {
        cache: 'no-store',
        headers: etagRef.current ? { 'If-None-Match': etagRef.current } : undefined,
      });
      if (p.status === 304) return;
      const l = await fetch('/api/pos/lookups', { cache: 'no-store' });
      if (!p.ok || !l.ok) throw new Error();
      const list = await p.json();
      etagRef.current = p.headers.get('ETag');
      setPos(list);
      setLookups(await l.json());
      setError('');
    } catch {
      setError('Could not load the purchase orders.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (openPo) {
      setPoId(openPo);
      onOpenPoHandled?.();
    }
  }, [openPo, onOpenPoHandled]);

  const active = useMemo(
    () => (pos ?? []).filter((p) => p.active).sort((a, b) => (a.eta || '9').localeCompare(b.eta || '9') || a.poNumber - b.poNumber),
    [pos]
  );
  useEffect(() => onCountChange?.(active.length), [active.length, onCountChange]);

  const deptOf = useMemo(() => {
    const byWo = new Map<string, string>();
    for (const j of jobs) {
      if (j.shipped) continue;
      const wo = (j.jobNumber ?? '').replace(/\D/g, '');
      if (wo) byWo.set(wo, departments.find((d) => d.id === j.departmentId)?.name ?? '');
    }
    return byWo;
  }, [jobs, departments]);

  const matches = (p: PoSummary, s: string) =>
    !s ||
    norm(p.poNumber).includes(s) ||
    norm(p.supplierName).includes(s) ||
    norm(p.partDwg).includes(s) ||
    p.workOrders.some((w) => w.includes(s)) ||
    norm(p.matType).includes(s) ||
    norm(p.heatNumber).includes(s) ||
    norm(p.description).includes(s) ||
    norm(p.lineText).includes(s);

  const outsideRows = useMemo(() => active.filter((p) => matches(p, q.trim().toLowerCase())), [active, q]);
  const allRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (pos ?? []).filter((p) => (!activeOnly || p.active) && matches(p, s));
  }, [pos, q, activeOnly]);

  const supplierStats = useMemo(() => {
    const m = new Map<string, { count: number; last: string }>();
    for (const p of pos ?? []) {
      const s = m.get(p.supplierId) ?? { count: 0, last: '' };
      s.count++;
      if (p.orderDate > s.last) s.last = p.orderDate;
      m.set(p.supplierId, s);
    }
    return m;
  }, [pos]);

  // Daily summary: made today, received today, ETA past while still out.
  const today = todayIso();
  const madeToday = (pos ?? []).filter((p) => p.orderDate === today).length;
  const receivedToday = (pos ?? []).filter((p) => p.receivedDate === today).length;
  const overdue = active.filter((p) => (daysOver(p.eta) ?? 0) > 0).length;

  useEffect(() => setLimit(PAGE), [q, activeOnly, view]);

  const tab = (v: View, label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setView(v)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
        view === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:text-card-foreground'
      }`}
    >
      {label}
      {count !== undefined && <span className={`text-[10px] px-1 rounded ${view === v ? 'bg-primary-foreground/20' : 'bg-background'}`}>{count}</span>}
    </button>
  );

  const woChips = (p: PoSummary) =>
    p.workOrders.map((w) => (
      <span key={w} className="inline-block mr-1 font-semibold" title={deptOf.get(w) ? `On the board: ${deptOf.get(w)}` : 'Not on the board'}>
        {w}
        {deptOf.get(w) && <span className="ml-0.5 text-[9px] text-green-600">●{deptOf.get(w)}</span>}
      </span>
    ));

  const poLink = (p: PoSummary) => (
    <button type="button" onClick={() => setPoId(p.id)} className="font-bold text-primary underline underline-offset-2">
      {p.poNumber}
    </button>
  );

  return (
    <div className="po-access bg-card min-h-full rounded-2xl p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {onBack && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onBack} title="Back to the job tabs">
            <ArrowLeft size={14} /> Jobs
          </Button>
        )}
        <span className="text-sm font-bold text-[#002b5c] px-1">Purchase Orders</span>
        {tab('outside', 'OUTSIDE', active.length)}
        {tab('all', 'OLD FILES', pos?.length)}
        {tab('suppliers', 'SUPPLIERS', lookups.suppliers.length)}
        {tab('reports', 'REPORTS')}
        {tab('setup', 'SETUP')}
        <Button size="sm" className="ml-auto gap-1.5 shadow-lg shadow-primary/30" onClick={() => setPoId('new')}>
          <Plus size={14} /> NEW PO
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!pos && !error && (
        <div className="py-10 flex justify-center text-muted-foreground">
          <Loader2 className="animate-spin" />
        </div>
      )}

      {pos && view === 'outside' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SearchBox value={q} onChange={setQ} placeholder="Search PO#, supplier, DWG/Part, WO, HT#, MAT-TYPE..." />
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-lg bg-muted px-2 py-1">Today: <b>{madeToday}</b> POs made</span>
              <span className="rounded-lg bg-muted px-2 py-1"><b>{receivedToday}</b> received</span>
              <span className={`rounded-lg px-2 py-1 ${overdue ? 'bg-red-600 text-white' : 'bg-muted'}`}><b>{overdue}</b> past ETA</span>
            </div>
          </div>
          <div className="bg-background rounded-2xl border border-border shadow-xl overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className={TH}>Purchase Order ID</th>
                  <th className={TH}>Supplier Name</th>
                  <th className={TH}>Description</th>
                  <th className={TH}>WO (board)</th>
                  <th className={TH}>Shipping Method</th>
                  <th className={TH}>Order Date</th>
                  <th className={TH}>Date Required</th>
                  <th className={TH}>Employee</th>
                  <th className={`${TH} text-right`}>Days Over</th>
                </tr>
              </thead>
              <tbody>
                {outsideRows.map((p) => {
                  const d = daysOver(p.eta);
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className={TD}>{poLink(p)}</td>
                      <td className={`${TD} font-medium`}>{p.supplierName}</td>
                      <td className={TD}>{p.description}</td>
                      <td className={TD}>{woChips(p)}</td>
                      <td className={TD}>{p.shippingMethod}</td>
                      <td className={TD}>{usDate(p.orderDate)}</td>
                      <td className={TD}>{usDate(p.eta)}</td>
                      <td className={TD}>{p.employeeName.split(',').reverse().join(' ').trim()}</td>
                      <td className={`${TD} text-right font-bold ${d !== null && d > 0 ? 'text-white bg-red-600' : ''}`}>{d ?? ''}</td>
                    </tr>
                  );
                })}
                {!outsideRows.length && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                      {q ? 'No active PO matches.' : 'No POs out right now.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pos && view === 'all' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search PO#, supplier, DWG/Part, WO, HT#, MAT-TYPE..." />
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="accent-green-600" /> active only
            </label>
            <span className="text-xs text-muted-foreground ml-auto">{allRows.length.toLocaleString()} POs</span>
          </div>
          <div className="bg-background rounded-2xl border border-border shadow-xl overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className={TH}>PO#</th>
                  <th className={TH}>Supplier</th>
                  <th className={TH}>Description</th>
                  <th className={TH}>WO</th>
                  <th className={TH}>Order Date</th>
                  <th className={TH}>ETA</th>
                  <th className={TH}>Received</th>
                  <th className={TH}>Open//Close</th>
                  <th className={TH}>HT#</th>
                  <th className={TH}>DWG# & Part</th>
                  <th className={TH}>MAT-TYPE</th>
                  <th className={`${TH} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {allRows.slice(0, limit).map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <td className={`${TD} whitespace-nowrap`}>
                      {poLink(p)}
                      {p.active && <span className="ml-1 text-[9px] font-bold text-white bg-green-600 rounded px-1">OUT</span>}
                      {p.hasMtr && <Paperclip size={11} className="inline ml-1 text-muted-foreground" aria-label="Has MTR" />}
                    </td>
                    <td className={`${TD} font-medium`}>{p.supplierName}</td>
                    <td className={TD}>{p.description}</td>
                    <td className={TD}>{woChips(p)}</td>
                    <td className={`${TD} whitespace-nowrap`}>{usDate(p.orderDate)}</td>
                    <td className={`${TD} whitespace-nowrap`}>{usDate(p.eta)}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {usDate(p.receivedDate)} {p.employeeReceived && <span className="text-muted-foreground">{p.employeeReceived}</span>}
                    </td>
                    <td className={TD}>{p.status}</td>
                    <td className={TD}>{p.heatNumber}</td>
                    <td className={TD}>{p.partDwg}</td>
                    <td className={TD}>{p.matType}</td>
                    <td className={`${TD} text-right tabular-nums`}>{p.total ? money(p.total) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allRows.length > limit && (
              <div className="p-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({(allRows.length - limit).toLocaleString()} left)
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {pos && view === 'suppliers' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={supQ} onChange={setSupQ} placeholder="Search supplier, contact, city..." />
            <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setSupplierEdit({ s: null })}>
              <Plus size={14} /> Add Supplier
            </Button>
          </div>
          <div className="bg-background rounded-2xl border border-border shadow-xl overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className={TH}>ID</th>
                  <th className={TH}>Supplier Name</th>
                  <th className={TH}>Contact</th>
                  <th className={TH}>Phone</th>
                  <th className={TH}>City</th>
                  <th className={TH}>Email</th>
                  <th className={TH}>Job on the board</th>
                  <th className={`${TH} text-right`}>POs</th>
                  <th className={TH}>Last PO</th>
                </tr>
              </thead>
              <tbody>
                {lookups.suppliers
                  .filter((s) => {
                    const t = supQ.trim().toLowerCase();
                    return !t || [s.name, s.contactName, s.city, s.phone, s.email].some((v) => norm(v).includes(t));
                  })
                  .map((s) => {
                    const st = supplierStats.get(s.id);
                    return (
                      <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                        <td className={TD}>{s.id}</td>
                        <td className={TD}>
                          <button type="button" className="font-semibold text-primary underline underline-offset-2 text-left" onClick={() => setSupplierEdit({ s })}>
                            {s.name}
                          </button>
                        </td>
                        <td className={TD}>{s.contactName}</td>
                        <td className={`${TD} whitespace-nowrap`}>{s.phone}</td>
                        <td className={TD}>{[s.city, s.state].filter(Boolean).join(', ')}</td>
                        <td className={TD}>{s.email}</td>
                        <td className={`${TD} text-[10px]`}>{s.kind === 'none' ? '—' : KIND_LABEL[s.kind].split(',')[0]}</td>
                        <td className={`${TD} text-right`}>{st?.count ?? 0}</td>
                        <td className={`${TD} whitespace-nowrap`}>{usDate(st?.last)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'reports' && <PoReports lookups={lookups} />}
      {view === 'setup' && <PoSetup lookups={lookups} onChanged={load} />}

      <PoFormModal
        poId={poId}
        lookups={lookups}
        jobs={jobs}
        departments={departments}
        onClose={() => setPoId(null)}
        onSaved={load}
        onEditSupplier={(s, done) => setSupplierEdit({ s, done })}
      />
      <PoSupplierModal
        supplier={supplierEdit?.s}
        poCount={supplierEdit?.s ? supplierStats.get(supplierEdit.s.id)?.count ?? 0 : 0}
        onClose={() => setSupplierEdit(undefined)}
        onSaved={(s) => {
          supplierEdit?.done?.(s);
          load();
        }}
        onDeleted={load}
      />
    </div>
  );
}
