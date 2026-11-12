'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Pencil, Save, AlertTriangle, Check, Ban, Paperclip, Loader2, Trash2, FileText, Plus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Job, Employee, UpdateJobInput, DeviationRecord, Department } from '@/types';
import { assignmentForDept } from '@/lib/dept-assignments';
import { MAX_DEVIATIONS } from '@/types';
import { DictationButton } from './dictation-button';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString([], { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// When the job's current deviation was sent and accepted/rejected. Uses the
// stamped fields; for deviations made before those existed, falls back to the
// latest matching entries in the job's history log.
function currentDeviationDates(job: Job | null): { sentAt?: string; resolvedAt?: string; acceptedAt?: string } {
  if (!job) return {};
  const hist = [...(job.history ?? [])].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const sentAt = job.deviationSentAt || hist.find((h) => h.notes?.startsWith('🚩 Sent to Deviations'))?.timestamp;
  const resolvedAt =
    job.deviationResolvedAt ||
    (job.deviationStatus === 'accepted' || job.deviationStatus === 'rejected'
      ? hist.find((h) => /^(✅|🚫) Deviation/.test(h.notes ?? ''))?.timestamp
      : undefined);
  return {
    sentAt: sentAt || undefined,
    resolvedAt: resolvedAt || undefined,
    acceptedAt: job.deviationStatus === 'accepted' ? resolvedAt || new Date().toISOString() : undefined,
  };
}

interface JobEditModalProps {
  job: Job | null;
  employees: Employee[];
  /** To know the job's area (pallets only take machinists). */
  departments?: Department[];
  // Returns true if saved. When false (e.g. duplicate JOB#), the modal
  // stays open so the user can fix the value.
  onSave: (jobId: string, data: UpdateJobInput) => Promise<boolean> | void;
  onClose: () => void;
}

export function JobEditModal({ job, employees, departments, onSave, onClose }: JobEditModalProps) {
  const [title, setTitle] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [line, setLine] = useState('');
  const [quantity, setQuantity] = useState('');
  const [dwgNumber, setDwgNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState(3);
  const [assignedTo, setAssignedTo] = useState('__none__');
  const [notes, setNotes] = useState('');
  const [productionNotes, setProductionNotes] = useState('');
  const [materialPo, setMaterialPo] = useState('');
  const [heatNumber, setHeatNumber] = useState('');
  const [hrc, setHrc] = useState('');
  const [outService, setOutService] = useState('');
  const [deviation, setDeviation] = useState('');
  const [deviationStatus, setDeviationStatus] = useState<'pending' | 'accepted' | 'rejected' | ''>('');
  // Earlier, already-approved deviations (read-only blocks above the current one).
  const [deviationHistory, setDeviationHistory] = useState<DeviationRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Every attachment of the job (legacy single attachment merged in).
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string }>>([]);
  const [isAttaching, setIsAttaching] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  // Required-field warnings show only after a Save attempt.
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Load the job's current values whenever a new job is opened for editing.
  useEffect(() => {
    if (!job) return;
    setTitle(job.title ?? '');
    setJobNumber(job.jobNumber ?? '');
    setName(job.name ?? '');
    setCustomer(job.customer ?? '');
    setPoNumber(job.poNumber ?? '');
    setLine(job.line ?? '');
    setQuantity(job.quantity ?? '');
    setDwgNumber(job.dwgNumber ?? '');
    setPartNumber(job.partNumber ?? '');
    // <input type="date"> needs YYYY-MM-DD; trim any time portion.
    setDueDate(job.dueDate ? String(job.dueDate).slice(0, 10) : '');
    setPriority(job.priority ?? 3);
    setAssignedTo(job.assignedTo || '__none__');
    setNotes(job.notes ?? '');
    setProductionNotes(job.productionNotes ?? '');
    setMaterialPo(job.materialPo ?? '');
    setHeatNumber(job.heatNumber ?? '');
    setHrc(job.hrc ?? '');
    setOutService(job.outService ?? '');
    setDeviation(job.deviation ?? '');
    setDeviationStatus(job.deviationStatus ?? '');
    setDeviationHistory(job.deviationHistory ?? []);
    const list = [...(job.attachments ?? [])];
    if (job.attachmentUrl) list.unshift({ url: job.attachmentUrl, name: job.attachmentName || 'Attachment' });
    setAttachments(list);
    setTriedSubmit(false);
  }, [job]);

  if (!job) return null;

  // Required on every job (same rule as New Job): JOB#, Due Date, at least
  // one Attachment, and Out Service.
  const missing = {
    jobNumber: !jobNumber.trim(),
    dueDate: !dueDate,
    attachment: attachments.length === 0,
    outService: !outService.trim(),
  };
  const missingNames = [
    missing.jobNumber && 'JOB#',
    missing.dueDate && 'Due Date',
    missing.attachment && 'Attachment',
    missing.outService && 'Out Service',
  ].filter(Boolean) as string[];
  const warn = (field: keyof typeof missing) => triedSubmit && missing[field];

  const handleAddAttachment = async () => {
    const file = attachInputRef.current?.files?.[0];
    if (!file) return;
    setIsAttaching(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setAttachments((prev) => [...prev, { url: data.fileUrl, name: data.fileName }]);
    } catch (error) {
      console.error('Attachment upload error:', error);
    } finally {
      setIsAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missingNames.length) {
      setTriedSubmit(true);
      return;
    }
    setIsSaving(true);
    try {
      const result = await onSave(job.id, {
        title,
        jobNumber: jobNumber.trim() || undefined,
        name: name.trim() || undefined,
        customer: customer.trim() || undefined,
        poNumber: poNumber.trim() || undefined,
        line: line.trim() || undefined,
        quantity: quantity.trim() || undefined,
        dwgNumber: dwgNumber.trim() || undefined,
        partNumber: partNumber.trim() || undefined,
        dueDate: dueDate || undefined,
        priority,
        assignedTo: assignedTo === '__none__' ? undefined : assignedTo,
        notes: notes.trim() || undefined,
        // Always sent (incl. '') so clearing the box clears it.
        productionNotes: productionNotes.trim(),
        materialPo: materialPo.trim() || undefined,
        heatNumber: heatNumber.trim() || undefined,
        hrc: hrc.trim() || undefined,
        outService: outService.trim() || undefined,
        // Always sent (incl. '') so starting a New Deviation clears the old text.
        deviation: deviation.trim(),
        // Always send the status (incl. '') so resolving a deviation clears it.
        deviationStatus,
        deviationHistory,
        attachments,
        attachmentUrl: '',
        attachmentName: '',
      });
      // Keep the modal open if the save failed (e.g. duplicate JOB#).
      if (result === false) return;
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const lbl = 'text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block';
  const inp = 'rounded-lg h-9 bg-background border-border text-xs';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-sm">
      {/* Flex column sized to the viewport: header + body + a footer that is
          always visible, so Save never needs a scroll. */}
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-2xl border border-border animate-in zoom-in-95 duration-200 max-h-[96vh] flex flex-col overflow-hidden">
        <div className="border-b border-border px-5 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-1.5 rounded-lg">
              <Pencil size={16} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight text-card-foreground">Edit Job</h2>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest">J&F MACHINE SHOP</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="hover:bg-muted p-1.5 rounded-lg transition-all text-muted-foreground hover:text-card-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
            {/* Job details row 1: customer / PO# / line / job# / qty. */}
            <div className="grid gap-2 grid-cols-2 md:grid-cols-[1.25fr_1.3fr_0.55fr_1fr_0.75fr]">
              <div>
                <Label className={lbl}>Customer</Label>
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer" className={inp} />
              </div>
              <div>
                <Label className={lbl}>PO#</Label>
                <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO Number" className={inp} />
              </div>
              <div>
                <Label className={lbl}>Line Item</Label>
                <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Line" className={inp} />
              </div>
              <div>
                <Label className={lbl}>JOB# *</Label>
                <Input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="Job Number" className={`rounded-lg h-9 bg-background text-xs ${warn('jobNumber') ? 'border-red-500 ring-1 ring-red-500' : 'border-border'}`} />
              </div>
              <div>
                <Label className={lbl}>Quantity</Label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" className={inp} />
              </div>
            </div>

            {/* Row 2: drawing / part / name / due date. */}
            <div className="grid gap-2 grid-cols-2 md:grid-cols-[1.5fr_1.5fr_1.4fr_1.1fr]">
              <div>
                <Label className={lbl}>DWG#</Label>
                <Input value={dwgNumber} onChange={(e) => setDwgNumber(e.target.value)} placeholder="Drawing #" className={inp} />
              </div>
              <div>
                <Label className={lbl}>Part#</Label>
                <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Part Number" className={inp} />
              </div>
              <div>
                <Label className={lbl}>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inp} />
              </div>
              <div>
                <Label className={lbl}>Due Date *</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`rounded-lg h-9 bg-background text-xs ${warn('dueDate') ? 'border-red-500 ring-1 ring-red-500' : 'border-border'}`} />
              </div>
            </div>

            <div>
              <Label className={lbl}>Title / Description *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title..." required className={inp} />
            </div>

            {/* Assign / Priority + material traceability (M_PO, HEAT#, HRC). */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <div>
                <Label className={lbl}>Assign To</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger className={inp}>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="__none__" className="hover:bg-muted">Unassigned</SelectItem>
                    {/* In a pallet only machinists can be assigned (admins don't machine);
                        the current assignee stays listed so the field isn't blank. */}
                    {(assignmentForDept(departments?.find((d) => d.id === job.departmentId)?.name)?.kind === 'machinists'
                      ? employees.filter((e) => e.role === 'machinist' || e.name === job.assignedTo)
                      : employees
                    ).map((emp) => (
                      <SelectItem key={emp.id} value={emp.name} className="hover:bg-muted">{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={lbl}>Priority</Label>
                <Select value={priority.toString()} onValueChange={(v) => setPriority(Number(v))}>
                  <SelectTrigger className={inp}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {[1, 2, 3, 4, 5].map((p) => (
                      <SelectItem key={p} value={p.toString()} className="hover:bg-muted">Level {p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={lbl}>M_PO</Label>
                <Input value={materialPo} onChange={(e) => setMaterialPo(e.target.value)} placeholder="IN HOUSE" className={inp} />
              </div>
              <div>
                <Label className={lbl}>HEAT#</Label>
                <Input value={heatNumber} onChange={(e) => setHeatNumber(e.target.value)} placeholder="e.g. T3015" className={inp} />
              </div>
              <div>
                <Label className={lbl}>HRC</Label>
                <Input value={hrc} onChange={(e) => setHrc(e.target.value)} placeholder="e.g. 33" className={inp} />
              </div>
            </div>

            {/* Out Service + Attachments side by side. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className={lbl}>Out Service *</Label>
                <Textarea
                  value={outService}
                  onChange={(e) => setOutService(e.target.value)}
                  placeholder="Required, in English. NDE or NO NDE, plus every outside service (phosphate, heat treat, plating...). e.g. NO NDE > PHOSPHATE"
                  rows={2}
                  className={`rounded-lg bg-background resize-none text-xs min-h-[60px] ${warn('outService') ? 'border-red-500 ring-1 ring-red-500' : 'border-border'}`}
                />
                {warn('outService') && (
                  <p className="text-[10px] text-red-500 font-semibold mt-1">Out Service is required (in English): NDE or NO NDE, and all outside services.</p>
                )}
              </div>

              {/* Attachments: a job must always keep at least one. */}
              <div>
                <Label className={lbl}>Attachments *</Label>
                <div className={`rounded-lg border p-1.5 space-y-1 max-h-[96px] overflow-y-auto ${warn('attachment') ? 'border-red-500 ring-1 ring-red-500' : 'border-border'}`}>
                  {attachments.map((a, i) => (
                    <div key={`${a.url}-${i}`} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1">
                      <FileText size={13} className="text-primary flex-shrink-0" />
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-xs truncate flex-1 hover:underline" title={a.name}>
                        {a.name}
                      </a>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                        className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                        title="Remove attachment"
                        aria-label={`Remove ${a.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <input type="file" ref={attachInputRef} className="hidden" onChange={handleAddAttachment} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => attachInputRef.current?.click()}
                    disabled={isAttaching}
                    className="w-full h-8 rounded-lg border-dashed text-xs gap-2"
                  >
                    {isAttaching ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                    {isAttaching ? 'Uploading…' : attachments.length ? 'Add another attachment' : 'Attach file (required)'}
                  </Button>
                </div>
                {warn('attachment') && (
                  <p className="text-[10px] text-red-500 font-semibold mt-1">Every job needs at least one attachment.</p>
                )}
              </div>
            </div>

            {/* Deviation: details + workflow button side by side. A pending
                deviation moves the job into the Deviations list until
                accepted/rejected. */}
            <div className={`rounded-xl p-3 border ${deviationStatus === 'pending' ? 'border-red-500/60 bg-red-500/5' : 'border-border bg-muted/30'}`}>
              {/* Earlier approved deviations, read-only. */}
              {deviationHistory.length > 0 && (
                <div className="space-y-1.5 mb-2.5">
                  {deviationHistory.map((d, i) => (
                    <details key={i} className="group rounded-lg border border-green-600/40 bg-green-600/10 px-2.5 py-1.5">
                      <summary className="cursor-pointer list-none flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-green-500">
                        <CheckCircle2 size={12} className="flex-shrink-0" />
                        Deviation #{i + 1} · Approved
                        <span className="font-normal normal-case tracking-normal text-muted-foreground ml-1">
                          {[d.sentAt && `Sent ${fmtDate(d.sentAt)}`, d.acceptedAt && `Approved ${fmtDate(d.acceptedAt)}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <span className="ml-auto font-normal normal-case tracking-normal text-muted-foreground truncate max-w-[55%] group-open:hidden">
                          {d.text}
                        </span>
                      </summary>
                      <p className="text-xs text-card-foreground whitespace-pre-wrap mt-1.5">{d.text || '—'}</p>
                    </details>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <AlertTriangle size={12} className={deviationStatus === 'pending' ? 'text-red-500' : 'text-muted-foreground'} />
                  Deviation{deviationHistory.length > 0 ? ` #${deviationHistory.length + 1}` : ''}
                  {/* Dates of the current deviation (as saved — not for a fresh, unsent one). */}
                  {deviationStatus && deviationStatus === job.deviationStatus && (() => {
                    const { sentAt, resolvedAt } = currentDeviationDates(job);
                    const verb = deviationStatus === 'accepted' ? 'Approved' : deviationStatus === 'rejected' ? 'Rejected' : '';
                    const txt = [sentAt && `Sent ${fmtDate(sentAt)}`, verb && resolvedAt && `${verb} ${fmtDate(resolvedAt)}`]
                      .filter(Boolean)
                      .join(' · ');
                    return txt ? <span className="normal-case tracking-normal font-normal ml-1 text-card-foreground/70">{txt}</span> : null;
                  })()}
                  <span className="normal-case tracking-normal font-normal ml-1">(applies on Save Changes)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <DictationButton value={deviation} onChange={setDeviation} />
                  {deviationStatus === 'pending' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-red-600 rounded-md px-2 py-0.5 animate-pulse">Pending</span>
                  )}
                  {deviationStatus === 'accepted' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-green-600 rounded-md px-2 py-0.5">Accepted</span>
                  )}
                  {deviationStatus === 'rejected' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-zinc-600 rounded-md px-2 py-0.5">Rejected</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
                <Textarea
                  value={deviation}
                  onChange={(e) => setDeviation(e.target.value)}
                  placeholder="Deviation details (reason, dimensions, disposition)..."
                  rows={2}
                  className="flex-1 rounded-lg bg-background border-border resize-none text-xs min-h-[60px]"
                />
                {deviationStatus === 'pending' ? (
                  <div className="flex sm:flex-col gap-2 sm:w-44">
                    <Button
                      type="button"
                      onClick={() => setDeviationStatus('accepted')}
                      className="flex-1 h-9 rounded-lg text-xs font-semibold uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check size={14} className="mr-1.5" />
                      Accepted
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setDeviationStatus('rejected')}
                      className="flex-1 h-9 rounded-lg text-xs font-semibold uppercase tracking-wider bg-zinc-600 hover:bg-zinc-700 text-white"
                    >
                      <Ban size={14} className="mr-1.5" />
                      Rejected
                    </Button>
                  </div>
                ) : deviationStatus === 'accepted' ? (
                  // Approved: archive it and open a fresh block for the next one.
                  (() => {
                    const atMax = deviationHistory.length + 1 >= MAX_DEVIATIONS;
                    return (
                      <Button
                        type="button"
                        disabled={atMax}
                        onClick={() => {
                          const { sentAt, acceptedAt } = currentDeviationDates(job);
                          setDeviationHistory((h) => [
                            ...h,
                            { text: deviation.trim(), sentAt, acceptedAt },
                          ]);
                          setDeviation('');
                          setDeviationStatus('');
                        }}
                        className="sm:w-44 h-auto min-h-9 rounded-lg text-xs font-semibold uppercase tracking-wider bg-orange-600 hover:bg-orange-700 text-white whitespace-normal disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                        title={atMax ? `A part can have at most ${MAX_DEVIATIONS} deviations` : 'Start a new deviation'}
                      >
                        {atMax ? (
                          <>Max {MAX_DEVIATIONS} deviations</>
                        ) : (
                          <>
                            <Plus size={14} className="mr-1.5 flex-shrink-0" />
                            New Deviation
                          </>
                        )}
                      </Button>
                    );
                  })()
                ) : (
                  <Button
                    type="button"
                    onClick={() => setDeviationStatus('pending')}
                    className="sm:w-44 h-auto min-h-9 rounded-lg text-xs font-semibold uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white whitespace-normal"
                  >
                    <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
                    {deviationStatus ? 'Send Deviation Again' : 'Send Deviation'}
                  </Button>
                )}
              </div>
            </div>

            {/* Additional Notes + Production Notes side by side. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest block">Additional Notes</Label>
                  <DictationButton value={notes} onChange={setNotes} />
                </div>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions..." rows={2} className="rounded-lg bg-background border-border resize-none text-xs min-h-[60px]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest block">Production Notes</Label>
                  <DictationButton value={productionNotes} onChange={setProductionNotes} />
                </div>
                <Textarea value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} placeholder="Production notes (setup, tooling, process)..." rows={2} className="rounded-lg bg-background border-border resize-none text-xs min-h-[60px]" />
              </div>
            </div>
          </div>

          {/* Footer: always visible. */}
          <div className="flex-shrink-0 border-t border-border px-5 py-3 space-y-2">
            {triedSubmit && missingNames.length > 0 && (
              <p className="text-xs text-red-500 font-semibold text-center">
                Before saving, fill in: {missingNames.join(', ')}.
              </p>
            )}
            <div className="flex gap-3">
              <Button type="button" onClick={onClose} variant="outline" className="flex-1 h-10 rounded-lg font-semibold uppercase tracking-wider border-border">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || isAttaching} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-10 rounded-lg font-semibold uppercase tracking-wider shadow-lg shadow-primary/30 disabled:opacity-50">
                <Save size={16} className="mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
