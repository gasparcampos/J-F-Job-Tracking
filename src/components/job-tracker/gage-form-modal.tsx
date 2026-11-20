'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Save, Ruler, Printer } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { Gage, Job, Employee, CreateGageInput } from '@/types';
import { GAGE_PLACE_OPTIONS } from '@/lib/extra-parts-places';
import { printHtml, escHtml } from '@/lib/print-html';
import { lookupJob, exactJobByNumber, fmtAccessDate } from '@/lib/job-lookup';
import { useJobsWithHistory } from '@/lib/use-job-history';
import { DictationButton } from './dictation-button';

interface GageFormModalProps {
  // null = closed. {} = creating new. Otherwise = editing existing.
  gage: Gage | Record<string, never> | null;
  jobs: Job[];
  employees: Employee[];
  onSave: (data: CreateGageInput, existingId?: string) => Promise<boolean> | void;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
// Gages are stored on the marble table, so new gages start there.
const DEFAULT_GAGE_PLACE = 'MARBLE TABLE';
// Customers that usually lend us gages (the box also takes any other name).
const LENDER_SUGGESTIONS = ['BAKER HUGHES', 'HALLIBURTON'];
const LABEL = 'text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block';

/**
 * Add / edit a gage. Same flow and fields as Fixtures: look the job up by
 * JOB#, DWG# or Part# and the identifying fields fill in from that job.
 */
export function GageFormModal({ gage, jobs: currentJobs, employees, onSave, onClose }: GageFormModalProps) {
  const isEditing = !!gage && 'id' in gage && typeof (gage as Gage).id === 'string';
  const existing = isEditing ? (gage as Gage) : null;

  const [jobLookup, setJobLookup] = useState('');
  // Current jobs plus matches from the Access archive (jobHistory).
  const jobs = useJobsWithHistory(currentJobs, jobLookup);
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [jobNumber, setJobNumber] = useState('');
  const [company, setCompany] = useState('');
  const [dwgNumber, setDwgNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [name, setName] = useState('');
  const [place, setPlace] = useState(DEFAULT_GAGE_PLACE);
  const [qty, setQty] = useState('');
  const [dateIn, setDateIn] = useState(today());
  const [dateOut, setDateOut] = useState('');
  const [active, setActive] = useState(true);
  const [employeeName, setEmployeeName] = useState('__none__');
  const [notes, setNotes] = useState('');
  // Ours (in-house) or lent to us by a customer, with loan dates.
  const [ownership, setOwnership] = useState<'in-house' | 'customer'>('in-house');
  const [loanedBy, setLoanedBy] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [returnedDate, setReturnedDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  // Scanning the QR opens the app on the Gages tab with this record open.
  const qrValue =
    existing && typeof window !== 'undefined'
      ? `${window.location.origin}/?gage=${existing.id}`
      : '';

  useEffect(() => {
    if (existing) {
      setJobLookup(existing.jobNumber || '');
      setJobId(existing.jobId);
      setJobNumber(existing.jobNumber ?? '');
      setCompany(existing.company ?? '');
      setDwgNumber(existing.dwgNumber ?? '');
      setPartNumber(existing.partNumber ?? '');
      setName(existing.name ?? '');
      setPlace(existing.place ?? '');
      setQty(existing.qty ?? '');
      setDateIn(existing.dateIn || today());
      setDateOut(existing.dateOut ?? '');
      setActive(existing.active ?? true);
      setEmployeeName(existing.employeeName || '__none__');
      setNotes(existing.notes ?? '');
      setOwnership(existing.ownership === 'customer' ? 'customer' : 'in-house');
      setLoanedBy(existing.loanedBy ?? '');
      setReceivedDate(existing.receivedDate ?? '');
      setReturnedDate(existing.returnedDate ?? '');
    } else if (gage) {
      setJobLookup('');
      setJobId(undefined);
      setJobNumber('');
      setCompany('');
      setDwgNumber('');
      setPartNumber('');
      setName('');
      setPlace(DEFAULT_GAGE_PLACE);
      setQty('');
      setDateIn(today());
      setDateOut('');
      setActive(true);
      setEmployeeName('__none__');
      setNotes('');
      setOwnership('in-house');
      setLoanedBy('');
      setReceivedDate('');
      setReturnedDate('');
    }
  }, [gage, existing]);

  // Picking "Customer" starts the loan: lender = the job's company and
  // received = today, both editable.
  const chooseOwnership = (o: 'in-house' | 'customer') => {
    setOwnership(o);
    if (o === 'customer') {
      setLoanedBy((v) => v || company);
      setReceivedDate((v) => v || today());
    }
  };
  const isLoaned = ownership === 'customer';

  const { matchedJob, matchCount } = useMemo(() => lookupJob(jobs, jobLookup), [jobLookup, jobs]);

  const fillFromJob = (j: Job) => {
    setJobId(j.id);
    setJobNumber(j.jobNumber || '');
    setCompany(j.customer || '');
    setDwgNumber(j.dwgNumber || '');
    setPartNumber(j.partNumber || '');
    setName(j.name || '');
  };

  const applyMatch = () => {
    if (matchedJob) fillFromJob(matchedJob);
  };

  // Typing an exact JOB# fills the form right away (no "Use match" click).
  useEffect(() => {
    if (isEditing) return;
    const exact = exactJobByNumber(jobs, jobLookup);
    if (exact && exact.id !== jobId) fillFromJob(exact);
  }, [jobLookup, jobs, isEditing, jobId]);

  // The box (JOB#/DWG#/Part#) that contains what was searched flashes green.
  const lookupQ = jobLookup.trim().toLowerCase();
  const isHit = (v: string) =>
    !isEditing && !!lookupQ && !!matchedJob && matchedJob.id === jobId && v.trim().toLowerCase().includes(lookupQ);
  const hitJob = isHit(jobNumber);
  const hitDwg = isHit(dwgNumber);
  const hitPart = isHit(partNumber);
  const hitClass = 'search-flash bg-green-500/15 border-2';
  const matchBadge = (
    <span className="ml-1.5 text-[9px] font-bold text-white bg-green-600 rounded px-1.5 py-px normal-case tracking-normal">✓ match</span>
  );

  // QTY drives GAGE ACTIVE: 0 means the gage is out; above 0 means it is
  // on the shelf. Blank (mid-edit) leaves it as it is.
  const handleQtyChange = (value: string) => {
    setQty(value);
    const v = value.trim();
    if (!v) return;
    const n = Number(v);
    if (Number.isFinite(n)) setActive(n > 0);
  };

  const handlePrintLabel = () => {
    const qrSvg = qrRef.current?.querySelector('svg')?.outerHTML ?? '';
    // Same order as the Fixture label. JOB# prints big under the QR.
    const rows: [string, string][] = [
      ['COMPANY', company],
      ['DWG#', dwgNumber],
      ['PART#', partNumber],
      ['NAME', name],
      ['GAGE PLACE', place],
      ['GAGE QTY', qty],
      ['GAGE DATE IN', fmtAccessDate(dateIn)],
      ['EMPLOYEE', employeeName === '__none__' ? '' : employeeName],
      ['GAGE NOTES', notes],
      ['OWNER', isLoaned ? `CUSTOMER — ${loanedBy.trim()}` : 'IN-HOUSE'],
    ];
    if (isLoaned) {
      rows.push(['RECEIVED', fmtAccessDate(receivedDate)]);
      if (returnedDate) rows.push(['RETURNED', fmtAccessDate(returnedDate)]);
    }
    if (!active) rows.push(['GAGE DATE OUT', fmtAccessDate(dateOut || today())]);
    const rowsHtml = rows
      .map(([k, v]) => `<tr><th>${escHtml(k)}</th><td>${escHtml((v || '').trim())}</td></tr>`)
      .join('');

    printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Gage Label</title>
      <style>
        @page { margin: 10mm; }
        * { box-sizing: border-box; }
        .print-page { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; color: #000; background: #fff; }
        .label { max-width: 90mm; margin: 0 auto; border: 2px solid #000; border-radius: 8px; padding: 14px; width: 100%; }
        .title { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; text-align:center; }
        .qr { display:flex; justify-content:center; margin: 4px 0 12px; }
        .qr svg { width: 170px; height: 170px; }
        .job { text-align: center; font-size: 44px; font-weight: 900; line-height: 1; letter-spacing: 1px; margin: 0 0 12px; word-break: break-all; }
        .job small { display: block; font-size: 11px; font-weight: 700; letter-spacing: 2px; margin-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; font-weight: 700; white-space: nowrap; padding: 3px 8px 3px 0; vertical-align: top; width: 1%; }
        td { padding: 3px 0; border-bottom: 1px solid #bbb; word-break: break-word; white-space: pre-wrap; }
        .hint { font-size: 10px; text-align:center; margin-top: 10px; color:#444; }
      </style></head><body>
      <div class="label">
        <div class="title">J&amp;F Machine Shop — Gage</div>
        <div class="qr">${qrSvg}</div>
        <div class="job"><small>JOB#</small>${escHtml(jobNumber.trim())}</div>
        <table>${rowsHtml}</table>
        <div class="hint">Scan to open this record</div>
      </div>
    </body></html>`);
  };

  if (!gage) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const result = await onSave(
        {
          jobId,
          jobNumber: jobNumber.trim() || undefined,
          company: company.trim() || undefined,
          dwgNumber: dwgNumber.trim() || undefined,
          partNumber: partNumber.trim() || undefined,
          name: name.trim() || undefined,
          place: place.trim() || undefined,
          qty: qty.trim() || undefined,
          dateIn: dateIn || undefined,
          employeeName: employeeName === '__none__' ? undefined : employeeName,
          notes: notes.trim() || undefined,
          active,
          // Server fills GAGE DATE OUT on the first active -> inactive flip.
          dateOut: !active ? (dateOut || today()) : undefined,
          ownership,
          // '' (not undefined) so switching back to in-house clears the loan.
          loanedBy: isLoaned ? loanedBy.trim() : '',
          receivedDate: isLoaned ? receivedDate : '',
          returnedDate: isLoaned ? returnedDate : '',
        },
        existing?.id
      );
      if (result === false) return;
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="bg-card border-b border-border px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Ruler size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-card-foreground">
                {isEditing ? 'Edit Gage' : 'New Gage'}
              </h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">J&F MACHINE SHOP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <Button type="button" variant="outline" size="sm" onClick={handlePrintLabel} className="gap-1.5 rounded-lg" title="Print label">
                <Printer size={16} />
                <span className="hidden sm:inline">Print Label</span>
              </Button>
            )}
            <button onClick={onClose} className="hover:bg-muted p-2 rounded-lg transition-all text-muted-foreground hover:text-card-foreground">
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* JOB lookup */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block">
              Look up by JOB#, DWG#, or Part#
            </Label>
            <div className="flex gap-2">
              <Input
                value={jobLookup}
                onChange={(e) => setJobLookup(e.target.value)}
                placeholder="Type a JOB#, DWG#, or Part#..."
                className="rounded-lg h-10 bg-background border-border"
              />
              <Button type="button" onClick={applyMatch} disabled={!matchedJob} variant="outline" className="h-10 rounded-lg whitespace-nowrap">
                Use match
              </Button>
            </div>
            {jobLookup.trim() && (
              <p className="text-[11px] text-muted-foreground">
                {matchedJob ? (
                  <>
                    Match: <span className="font-semibold text-primary">JOB# {matchedJob.jobNumber}</span>
                    {matchedJob.shipped ? (
                      <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-white bg-green-600 rounded px-1.5 py-px">
                        Shipped{matchedJob.shippedAt ? ` ${new Date(matchedJob.shippedAt).toLocaleDateString('en-US')}` : ''}
                      </span>
                    ) : (
                      <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-white bg-amber-600 rounded px-1.5 py-px">
                        Not shipped
                      </span>
                    )}
                    {matchedJob.customer ? ` · ${matchedJob.customer}` : ''}
                    {matchedJob.partNumber ? ` · Part ${matchedJob.partNumber}` : ''}
                    {matchCount > 1 && (
                      <span className="block mt-1 font-semibold text-amber-600 dark:text-amber-400">
                        ⚠ {matchCount} trabajos coinciden con lo que escribiste. Se tomó {matchedJob.shipped ? 'el enviado más reciente' : 'el primero que se encontró'}; si no es ese, escribe el JOB# exacto.
                      </span>
                    )}
                  </>
                ) : (
                  <>No matching job found — you can still type the fields manually below.</>
                )}
              </p>
            )}
          </div>

          {/* Identifying fields, Access order: JOB#, COMPANY, DWG#, PART#, NAME */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className={LABEL}>JOB#{hitJob && matchBadge}</Label>
              <Input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} className={`rounded-lg h-10 bg-background border-border text-sm ${hitJob ? hitClass : ''}`} />
            </div>
            <div>
              <Label className={LABEL}>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-lg h-10 bg-background border-border text-sm" />
            </div>
            <div>
              <Label className={LABEL}>DWG#{hitDwg && matchBadge}</Label>
              <Input value={dwgNumber} onChange={(e) => setDwgNumber(e.target.value)} className={`rounded-lg h-10 bg-background border-border text-sm ${hitDwg ? hitClass : ''}`} />
            </div>
            <div>
              <Label className={LABEL}>Part#{hitPart && matchBadge}</Label>
              <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} className={`rounded-lg h-10 bg-background border-border text-sm ${hitPart ? hitClass : ''}`} />
            </div>
            <div className="col-span-2">
              <Label className={LABEL}>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg h-10 bg-background border-border text-sm" />
            </div>
          </div>

          {/* GAGE PLACE, GAGE QTY, GAGE DATE IN, GAGE EMPL */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className={LABEL}>Gage Place</Label>
              <select
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="w-full rounded-lg h-10 bg-background border border-border text-sm px-3 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">—</option>
                {/* Keep a saved place that isn't in the list selectable. */}
                {place && !GAGE_PLACE_OPTIONS.includes(place) && <option value={place}>{place}</option>}
                {GAGE_PLACE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className={LABEL}>Gage Qty</Label>
              <Input value={qty} onChange={(e) => handleQtyChange(e.target.value)} placeholder="e.g. 1" className="rounded-lg h-10 bg-background border-border" />
            </div>
            <div>
              <Label className={LABEL}>Gage Date In</Label>
              <Input type="date" value={dateIn} onChange={(e) => setDateIn(e.target.value)} className="rounded-lg h-10 bg-background border-border" />
            </div>
            <div>
              <Label className={LABEL}>Gage Empl</Label>
              <select
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                className="w-full rounded-lg h-10 bg-background border border-border text-sm px-3 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="__none__">Unassigned</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Owner: ours, or lent by a customer with received / returned dates. */}
          <div className="rounded-xl border border-border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label className={`${LABEL} mb-0 mr-1`}>Gage Owner</Label>
              {(['in-house', 'customer'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => chooseOwnership(o)}
                  className={`h-9 px-4 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-colors ${
                    ownership === o
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:text-card-foreground'
                  }`}
                >
                  {o === 'in-house' ? 'In-House (J&F)' : 'Customer (loaned)'}
                </button>
              ))}
            </div>
            {isLoaned && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className={LABEL}>Loaned By</Label>
                  <Input
                    value={loanedBy}
                    onChange={(e) => setLoanedBy(e.target.value)}
                    list="gage-lenders"
                    placeholder="BAKER HUGHES, HALLIBURTON..."
                    className="rounded-lg h-10 bg-background border-border text-sm"
                  />
                  <datalist id="gage-lenders">
                    {Array.from(new Set([company.trim(), ...LENDER_SUGGESTIONS].filter(Boolean))).map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label className={LABEL}>Received From Customer</Label>
                  <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="rounded-lg h-10 bg-background border-border" />
                </div>
                <div>
                  <Label className={LABEL}>Returned To Customer</Label>
                  <Input type="date" value={returnedDate} onChange={(e) => setReturnedDate(e.target.value)} className="rounded-lg h-10 bg-background border-border" />
                </div>
              </div>
            )}
            {isLoaned && !returnedDate && (
              <p className="text-[10px] text-muted-foreground">Leave Returned blank while we still have it; fill it the day it goes back.</p>
            )}
          </div>

          {/* Active / Date out / Notes on the left, QR on the right. */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer h-10 px-3 rounded-lg bg-background border border-border self-end">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-primary" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Gage Active</span>
                </label>
                {!active && (
                  <div>
                    <Label className={LABEL}>Gage Date Out</Label>
                    <Input type="date" value={dateOut} onChange={(e) => setDateOut(e.target.value)} className="rounded-lg h-10 bg-background border-border" />
                  </div>
                )}
              </div>
              {!active && (
                <p className="text-[10px] text-muted-foreground -mt-1">Leave Date Out blank to use today&apos;s date when saving.</p>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block">Gage Notes</Label>
                  <DictationButton value={notes} onChange={setNotes} />
                </div>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition, where it was used, etc." rows={2} className="rounded-lg bg-background border-border resize-none" />
              </div>
            </div>

            {isEditing && qrValue && (
              <div className="flex flex-col items-center justify-center gap-1.5 p-3 border border-dashed border-border rounded-xl bg-muted/20 sm:w-40 shrink-0">
                <div ref={qrRef} className="bg-white p-2 rounded-lg">
                  <QRCode value={qrValue} size={104} />
                </div>
                <p className="text-[9px] text-muted-foreground text-center leading-tight">
                  Scan to open &amp; edit this gage
                </p>
              </div>
            )}
          </div>

          {/* Save bar pinned to the bottom so Save is always visible. */}
          <div className="sticky bottom-0 z-10 -mx-6 -mb-6 px-6 py-4 bg-card border-t border-border flex gap-3">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 h-12 rounded-lg font-semibold uppercase tracking-wider border-border">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-lg font-semibold uppercase tracking-wider shadow-lg shadow-primary/30 disabled:opacity-50">
              <Save size={16} className="mr-2" />
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Gage'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
