'use client';

import { useEffect, useState } from 'react';
import { Archive, ArrowRight, Loader2, Printer, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtAccessDate } from '@/lib/job-lookup';
import { printHtml, escHtml as esc } from '@/lib/print-html';

/** A job from the Access archive, as returned by /api/job-history?full=1. */
interface HistoryJob {
  id: string;
  jobNumber?: string;
  name?: string;
  customer?: string;
  poNumber?: string;
  line?: string;
  quantity?: string;
  dwgNumber?: string;
  partNumber?: string;
  dueDate?: string;
  orderDate?: string;
  materialPo?: string;
  heatNumber?: string;
  hrc?: string;
  outService?: string;
  productionNotes?: string;
  shippedAt?: string;
  legacy?: Record<string, unknown>;
}

interface Page {
  items: HistoryJob[];
  next: string | null;
  capped?: boolean;
}

const TH = 'px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest';

/**
 * Read-only view of the jobs imported from the Access MASTER table. Shows
 * the newest 50 by due date (with "Load more"), or searches the archive by
 * JOB#, DWG#, Part# or Company — never loads the whole archive.
 */
/**
 * Search box for the Historial tab. Lives in the sub-tab row, right next to
 * the Historial button, with a blinking arrow pointing at it.
 */
export function AccessHistorySearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 min-w-[200px] flex-1 max-w-md">
      <ArrowRight size={18} className="text-primary shrink-0 animate-blink" aria-hidden />
      <div className="relative w-full">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar JOB#, DWG#, Part# o Company…"
          className="w-full h-9 pl-9 pr-8 rounded-xl border border-primary/60 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-card-foreground"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export function AccessHistoryView({ query }: { query: string }) {
  const [items, setItems] = useState<HistoryJob[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<HistoryJob | null>(null);

  const q = query.trim();

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      setError(false);
      fetch(`/api/job-history?full=1${q ? `&q=${encodeURIComponent(q)}` : ''}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((page: Page) => {
          setItems(page.items ?? []);
          setNext(page.next ?? null);
          setCapped(!!page.capped);
        })
        .catch((e) => {
          if (e?.name !== 'AbortError') setError(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, q ? 300 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const loadMore = async () => {
    if (!next) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/job-history?full=1&after=${encodeURIComponent(next)}`);
      const page: Page = await r.json();
      setItems((prev) => [...prev, ...(page.items ?? [])]);
      setNext(page.next ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {q
            ? `${items.length} resultado${items.length === 1 ? '' : 's'}${capped ? ' (los primeros 200 de esa compañía; escribe JOB# o DWG# para afinar)' : ''}`
            : 'Trabajos de Access (tabla MASTER), los más recientes primero. Clic en un trabajo para ver todo.'}
        </p>
        {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      </div>

      <div className="w-full bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                <TableHead className={TH}>JOB#</TableHead>
                <TableHead className={TH}>Company</TableHead>
                <TableHead className={TH}>Name</TableHead>
                <TableHead className={TH}>DWG#</TableHead>
                <TableHead className={TH}>Part#</TableHead>
                <TableHead className={`${TH} text-center`}>Qty</TableHead>
                <TableHead className={TH}>PO#</TableHead>
                <TableHead className={TH}>Due Date</TableHead>
                <TableHead className={TH}>HT#</TableHead>
                <TableHead className={TH}>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((j) => (
                <TableRow
                  key={j.id}
                  onClick={() => setSelected(j)}
                  className="hover:bg-muted/30 border-b border-border transition-colors cursor-pointer"
                >
                  <TableCell className="px-3 py-2 font-semibold text-sm text-primary">{j.jobNumber || '—'}</TableCell>
                  <TableCell className="px-3 py-2 text-xs">{j.customer || ''}</TableCell>
                  <TableCell className="px-3 py-2 text-xs">{j.name || ''}</TableCell>
                  <TableCell className="px-3 py-2 text-xs">{j.dwgNumber || ''}</TableCell>
                  <TableCell className="px-3 py-2 text-xs">{j.partNumber || ''}</TableCell>
                  <TableCell className="px-3 py-2 text-xs text-center">{j.quantity || ''}</TableCell>
                  <TableCell className="px-3 py-2 text-xs">{j.poNumber || ''}</TableCell>
                  <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{fmtAccessDate(j.dueDate)}</TableCell>
                  <TableCell className="px-3 py-2 text-xs">{j.heatNumber || ''}</TableCell>
                  <TableCell className="px-3 py-2 text-xs max-w-[260px] truncate" title={j.productionNotes}>
                    {j.productionNotes || ''}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {error
                      ? 'No se pudo cargar el historial. Intenta otra vez.'
                      : q.length < 2
                      ? 'Escribe al menos 2 letras.'
                      : 'No se encontró ningún trabajo.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {!q && next && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Load more'}
          </Button>
        </div>
      )}

      {selected && <AccessJobModal job={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AccessJobModal({ job, onClose }: { job: HistoryJob; onClose: () => void }) {
  const main: [string, string | undefined][] = [
    ['JOB#', job.jobNumber],
    ['Company', job.customer],
    ['Name', job.name],
    ['DWG#', job.dwgNumber],
    ['Part#', job.partNumber],
    ['Qty', job.quantity],
    ['PO#', job.poNumber],
    ['Line', job.line],
    ['Order Date', fmtAccessDate(job.orderDate)],
    ['Due Date', fmtAccessDate(job.dueDate)],
    ['Shipped', fmtAccessDate(job.shippedAt)],
    ['Material PO', job.materialPo],
    ['HT#', job.heatNumber],
    ['HRC', job.hrc],
    ['Out Service', job.outService],
  ];
  const legacy = Object.entries(job.legacy ?? {})
    .filter(([, v]) => v !== '' && v !== null && v !== false && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-border px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Archive size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-card-foreground">JOB# {job.jobNumber || '—'}</h3>
              <p className="text-[10px] text-muted-foreground">Historial de Access (solo lectura)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => printAccessJob(job, main, legacy)}>
              <Printer size={14} />
              Print
            </Button>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-card-foreground" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {main
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{k}</dt>
                  <dd className="text-sm text-card-foreground break-words">{v}</dd>
                </div>
              ))}
          </dl>

          {job.productionNotes && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm text-card-foreground whitespace-pre-wrap">{job.productionNotes}</p>
            </div>
          )}

          {legacy.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                Otros campos de Access
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {legacy.map(([k, v]) => (
                  <div key={k} className="flex gap-2 min-w-0">
                    <dt className="text-muted-foreground shrink-0">{k}:</dt>
                    <dd className="text-card-foreground break-all">{v === true ? '✓' : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Prints one Access job (main fields, notes, other Access fields) on a white page. */
function printAccessJob(job: HistoryJob, main: [string, string | undefined][], legacy: [string, unknown][]) {
  const kv = (k: string, v: unknown) =>
    `<div class="kv"><span>${esc(k)}</span><b>${esc(v === true ? '✓' : String(v))}</b></div>`;
  const now = new Date();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>JOB# ${esc(job.jobNumber ?? '')}</title>
<style>
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; }
  .print-page { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; margin: 0; background: #fff; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  header h1 { font-size: 18px; margin: 0; }
  header .shop { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #444; }
  header .printed { font-size: 10px; color: #444; text-align: right; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 14px 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; }
  .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 16px; }
  .kv { display: flex; gap: 6px; border-bottom: 1px dotted #ccc; padding: 2px 0; page-break-inside: avoid; }
  .kv span { color: #555; min-width: 70px; }
  .kv b { word-break: break-all; }
  .notes { white-space: pre-wrap; font-size: 12px; }
</style></head><body>
<header>
  <div>
    <div class="shop">J&amp;F Machine Shop — Historial de Access</div>
    <h1>JOB# ${esc(job.jobNumber ?? '—')}</h1>
  </div>
  <div class="printed">Printed ${esc(now.toLocaleDateString('en-US'))} ${esc(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))}</div>
</header>
<h2>Job details</h2>
<div class="grid3">${main.filter(([, v]) => v).map(([k, v]) => kv(k, v)).join('')}</div>
${job.productionNotes ? `<h2>Notes</h2><p class="notes">${esc(job.productionNotes)}</p>` : ''}
${legacy.length ? `<h2>Otros campos de Access</h2><div class="grid2">${legacy.map(([k, v]) => kv(k, v)).join('')}</div>` : ''}
</body></html>`;
  printHtml(html);
}
