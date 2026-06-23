'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Save, Package, Printer } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { ExtraPart, Job, Employee, CreateExtraPartInput } from '@/types';
import { PLACE_OPTIONS } from '@/lib/extra-parts-places';

interface ExtraPartFormModalProps {
  // null = closed. {} = creating new. Otherwise = editing existing.
  part: ExtraPart | Record<string, never> | null;
  jobs: Job[];
  employees: Employee[];
  onSave: (data: CreateExtraPartInput, existingId?: string) => Promise<boolean> | void;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ExtraPartFormModal({ part, jobs, employees, onSave, onClose }: ExtraPartFormModalProps) {
  const isEditing = !!part && 'id' in part && typeof (part as ExtraPart).id === 'string';
  const existing = isEditing ? (part as ExtraPart) : null;

  const [jobLookup, setJobLookup] = useState('');
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [jobNumber, setJobNumber] = useState('');
  const [company, setCompany] = useState('');
  const [dwgNumber, setDwgNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [name, setName] = useState('');
  const [heatNumber, setHeatNumber] = useState('');
  const [partQty, setPartQty] = useState('');
  const [place, setPlace] = useState<string>('');
  const [partDate, setPartDate] = useState(today());
  const [employeeName, setEmployeeName] = useState('__none__');
  const [partNotes, setPartNotes] = useState('');
  const [active, setActive] = useState(true);
  const [exitDate, setExitDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  // Deep link encoded in the QR. Scanning it opens the app, jumps to the
  // Extra Parts tab, and pops this record open in edit mode so the part can
  // be pulled from inventory. Uses the current origin so it works on both
  // localhost and production.
  const qrValue =
    existing && typeof window !== 'undefined'
      ? `${window.location.origin}/?extraPart=${existing.id}`
      : '';

  // Load existing values when opening for edit, or reset when opening for new.
  useEffect(() => {
    if (existing) {
      setJobLookup(existing.jobNumber || '');
      setJobId(existing.jobId);
      setJobNumber(existing.jobNumber ?? '');
      setCompany(existing.company ?? '');
      setDwgNumber(existing.dwgNumber ?? '');
      setPartNumber(existing.partNumber ?? '');
      setPoNumber(existing.poNumber ?? '');
      setName(existing.name ?? '');
      setHeatNumber(existing.heatNumber ?? '');
      setPartQty(existing.partQty ?? '');
      setPlace(existing.place ?? '');
      setPartDate(existing.partDate || today());
      setEmployeeName(existing.employeeName || '__none__');
      setPartNotes(existing.partNotes ?? '');
      setActive(existing.active ?? true);
      setExitDate(existing.exitDate ?? '');
    } else if (part) {
      // New: reset to defaults.
      setJobLookup('');
      setJobId(undefined);
      setJobNumber('');
      setCompany('');
      setDwgNumber('');
      setPartNumber('');
      setPoNumber('');
      setName('');
      setHeatNumber('');
      setPartQty('');
      setPlace('');
      setPartDate(today());
      setEmployeeName('__none__');
      setPartNotes('');
      setActive(true);
      setExitDate('');
    }
  }, [part, existing]);

  // Look up a job by JOB#, DWG#, or Part# (case-insensitive substring). The
  // first match auto-fills the identifying fields; user can edit afterwards.
  const matchedJob = useMemo(() => {
    const q = jobLookup.trim().toLowerCase();
    if (!q) return null;
    return (
      jobs.find((j) => (j.jobNumber ?? '').trim().toLowerCase() === q) ||
      jobs.find((j) => (j.dwgNumber ?? '').trim().toLowerCase() === q) ||
      jobs.find((j) => (j.partNumber ?? '').trim().toLowerCase() === q) ||
      jobs.find((j) =>
        [(j.jobNumber ?? ''), (j.dwgNumber ?? ''), (j.partNumber ?? '')]
          .some((v) => v.toLowerCase().includes(q))
      ) ||
      null
    );
  }, [jobLookup, jobs]);

  const applyMatch = () => {
    if (!matchedJob) return;
    setJobId(matchedJob.id);
    setJobNumber(matchedJob.jobNumber || '');
    setCompany(matchedJob.customer || '');
    setDwgNumber(matchedJob.dwgNumber || '');
    setPartNumber(matchedJob.partNumber || '');
    setPoNumber(matchedJob.poNumber || '');
    setName(matchedJob.name || '');
    setHeatNumber(matchedJob.heatNumber || '');
  };

  // When the user types a lookup that matches a single job by JOB#, auto-fill
  // without requiring the "Use match" click. (Match by other fields requires
  // confirmation to avoid surprises.)
  useEffect(() => {
    const q = jobLookup.trim().toLowerCase();
    if (!q || isEditing) return;
    const exactByJobNumber = jobs.find((j) => (j.jobNumber ?? '').trim().toLowerCase() === q);
    if (exactByJobNumber && exactByJobNumber.id !== jobId) {
      setJobId(exactByJobNumber.id);
      setJobNumber(exactByJobNumber.jobNumber || '');
      setCompany(exactByJobNumber.customer || '');
      setDwgNumber(exactByJobNumber.dwgNumber || '');
      setPartNumber(exactByJobNumber.partNumber || '');
      setPoNumber(exactByJobNumber.poNumber || '');
      setName(exactByJobNumber.name || '');
      setHeatNumber(exactByJobNumber.heatNumber || '');
    }
  }, [jobLookup, jobs, isEditing, jobId]);

  // Print a small storage label: the QR plus the key identifying info, so it
  // can be taped to the stored piece. Opens a clean print window with just
  // the label (window.print on the modal would print the whole UI).
  const handlePrintLabel = () => {
    const qrSvg = qrRef.current?.querySelector('svg')?.outerHTML ?? '';
    const rows: [string, string][] = [
      ['JOB#', jobNumber],
      ['Part#', partNumber],
      ['Company', company],
      ['Place', place],
      ['Qty', partQty],
      ['Heat#', heatNumber],
    ];
    const rowsHtml = rows
      .filter(([, v]) => v && v.trim())
      .map(
        ([k, v]) =>
          `<tr><td style="font-weight:700;padding:2px 8px 2px 0;white-space:nowrap;">${k}</td><td style="padding:2px 0;">${v}</td></tr>`
      )
      .join('');

    const win = window.open('', '_blank', 'width=460,height=620');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Extra Part Label</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 16px; color: #000; }
        .label { border: 2px solid #000; border-radius: 8px; padding: 16px; width: 100%; }
        .title { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 10px; text-align:center; }
        .qr { display:flex; justify-content:center; margin: 8px 0 14px; }
        .qr svg { width: 200px; height: 200px; }
        table { font-size: 14px; margin: 0 auto; }
        .hint { font-size: 10px; text-align:center; margin-top: 10px; color:#444; }
      </style></head><body onload="window.print()">
      <div class="label">
        <div class="title">J&amp;F Machine Shop — Extra Part</div>
        <div class="qr">${qrSvg}</div>
        <table>${rowsHtml}</table>
        <div class="hint">Scan to open this record</div>
      </div>
    </body></html>`);
    win.document.close();
  };

  if (!part) return null;

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
          poNumber: poNumber.trim() || undefined,
          name: name.trim() || undefined,
          heatNumber: heatNumber.trim() || undefined,
          partQty: partQty.trim() || undefined,
          place: place.trim() || undefined,
          partDate: partDate || undefined,
          employeeName: employeeName === '__none__' ? undefined : employeeName,
          partNotes: partNotes.trim() || undefined,
          active,
          // Only send exitDate explicitly when the user has marked the entry
          // out of stock. Server fills it on first active->inactive flip.
          exitDate: !active ? (exitDate || today()) : undefined,
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
        <div className="bg-card border-b border-border px-6 py-4 flex justify-between items-center sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Package size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-card-foreground">
                {isEditing ? 'Edit Extra Part' : 'New Extra Part'}
              </h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                J&F MACHINE SHOP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrintLabel}
                className="gap-1.5 rounded-lg"
                title="Print label"
              >
                <Printer size={16} />
                <span className="hidden sm:inline">Print Label</span>
              </Button>
            )}
            <button onClick={onClose} className="hover:bg-muted p-2 rounded-lg transition-all text-muted-foreground hover:text-card-foreground">
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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
              <Button
                type="button"
                onClick={applyMatch}
                disabled={!matchedJob}
                variant="outline"
                className="h-10 rounded-lg whitespace-nowrap"
              >
                Use match
              </Button>
            </div>
            {jobLookup.trim() && (
              <p className="text-[11px] text-muted-foreground">
                {matchedJob ? (
                  <>
                    Match: <span className="font-semibold text-primary">JOB# {matchedJob.jobNumber}</span>
                    {matchedJob.customer ? ` · ${matchedJob.customer}` : ''}
                    {matchedJob.partNumber ? ` · Part ${matchedJob.partNumber}` : ''}
                  </>
                ) : (
                  <>No matching job found — you can still type the fields manually below.</>
                )}
              </p>
            )}
          </div>

          {/* Identifying fields (auto-filled but editable) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">JOB#</Label>
              <Input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} className="rounded-lg h-10 bg-background border-border text-sm" />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-lg h-10 bg-background border-border text-sm" />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">PO#</Label>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="rounded-lg h-10 bg-background border-border text-sm" />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">DWG#</Label>
              <Input value={dwgNumber} onChange={(e) => setDwgNumber(e.target.value)} className="rounded-lg h-10 bg-background border-border text-sm" />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Part#</Label>
              <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} className="rounded-lg h-10 bg-background border-border text-sm" />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg h-10 bg-background border-border text-sm" />
            </div>
          </div>

          {/* Per-entry fields */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Part Qty</Label>
              <Input value={partQty} onChange={(e) => setPartQty(e.target.value)} placeholder="e.g. 2" className="rounded-lg h-10 bg-background border-border" />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Heat#</Label>
              <Input value={heatNumber} onChange={(e) => setHeatNumber(e.target.value)} placeholder="e.g. T3015" className="rounded-lg h-10 bg-background border-border" />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Place</Label>
              {/* Native select: reliably shows the saved value on open and gives
                  a native picker on mobile (better for shop-floor phones). */}
              <select
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="w-full rounded-lg h-10 bg-background border border-border text-sm px-3 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">—</option>
                {PLACE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Date</Label>
              <Input type="date" value={partDate} onChange={(e) => setPartDate(e.target.value)} className="rounded-lg h-10 bg-background border-border" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Employee</Label>
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
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 cursor-pointer flex-1 h-10 px-3 rounded-lg bg-background border border-border">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm font-semibold uppercase tracking-wider">Active (in stock)</span>
              </label>
            </div>
          </div>

          {/* QR code — only for saved records. Scanning it opens this exact
              entry in edit mode (for pulling the part during inventory). */}
          {isEditing && qrValue && (
            <div className="flex flex-col items-center justify-center gap-2 py-2 border border-dashed border-border rounded-xl bg-muted/20">
              <div ref={qrRef} className="bg-white p-3 rounded-lg">
                <QRCode value={qrValue} size={128} />
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Scan during inventory to open & edit this part
              </p>
            </div>
          )}

          {!active && (
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Exit Date</Label>
              <Input
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                placeholder={today()}
                className="rounded-lg h-10 bg-background border-border max-w-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Leave blank to use today&apos;s date when saving.
              </p>
            </div>
          )}

          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Part Notes</Label>
            <Textarea value={partNotes} onChange={(e) => setPartNotes(e.target.value)} placeholder="Special instructions, condition, etc." rows={3} className="rounded-lg bg-background border-border resize-none" />
          </div>

          <div className="flex gap-3">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 h-12 rounded-lg font-semibold uppercase tracking-wider border-border">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-lg font-semibold uppercase tracking-wider shadow-lg shadow-primary/30 disabled:opacity-50">
              <Save size={16} className="mr-2" />
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Extra Part'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
