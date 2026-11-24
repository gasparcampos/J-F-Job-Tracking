'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileText, Loader2, Paperclip, Plus, Printer, Save, Trash2, Truck, X, ArrowRight, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { Department, Job } from '@/types';
import type { PoLine, PoLookups, PoSupplier, PurchaseOrder } from '@/types/po';
import {
  DESCRIPTION_OPTIONS,
  EMPLOYEE_RECEIVED_OPTIONS,
  kindLabelFor,
  MATERIAL_CONDITION_OPTIONS,
  STATUS_OPTIONS,
  activeForStatus,
  employeeLabel,
  lineSubtotal,
  money,
  poKind,
  poSentNote,
  poTotal,
  time12,
  todayIso,
  workOrdersOf,
} from '@/lib/po-shared';
import { printPurchaseOrder } from './po-print';

export const PO_LABEL = 'text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block';
export const PO_FIELD =
  'w-full h-9 rounded-md border border-input bg-background px-2 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';

// Compact sizes for the PO form header (keeps the form short so the lines fit).
const SM = 'h-8 px-2 md:text-sm';
const SEL = PO_FIELD.replace('h-9', 'h-8');

function Field({ label, extra, className = '', children }: { label: string; extra?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className={`text-[10px] font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap ${extra ? 'shrink-0' : 'truncate'}` } title={label}>{label}</span>
        {extra && <span className="text-[10px] text-muted-foreground truncate" title={extra}>{extra}</span>}
      </div>
      {children}
    </div>
  );
}

// One Access-style row: label on the left, field on the right.
function Row({ label, labelClass = '', children }: { label: string; labelClass?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-2">
      <span className={`text-[11px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight ${labelClass}`}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type Draft = Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdAt' | 'updatedAt' | 'source' | 'workOrders' | 'total'> & {
  id?: string;
  poNumber?: number;
};

const emptyLine = (date: string): PoLine => ({ date, units: 1, prodDescrip: '', spec: '', rev: '', partNumber: '', unitPrice: null, wo: '' });

function blankDraft(): Draft {
  const today = todayIso();
  return {
    supplierId: '',
    supplierName: '',
    description: '',
    employeeId: '',
    employeeName: '',
    orderDate: today,
    eta: '',
    timeOrder: '',
    shippingMethodId: '',
    shippingMethod: '',
    materialCondition: 'N/A',
    heatNumber: '',
    partDwg: '',
    matType: '',
    hotRush: '',
    active: true,
    notes: '',
    employeeReceived: '',
    receivedDate: '',
    status: '',
    lines: [emptyLine(today)],
    mtr: [],
  };
}

// Access field reminders (they were message boxes there).
const HINTS: Record<string, string> = {
  partDwg: 'PLEASE put ALL the DWG# or Part# in this field. Thanks!',
  partDwgExit: 'Please attach the (MTR)!',
  matType: 'PLEASE PUT MATERIAL TYPE. THANK YOU!',
  active: 'PLEASE, make sure to put your NOTES in this PO!',
  contact: 'Please choose 1 Description!',
};

interface Props {
  /** null = closed, 'new' = new PO, a PO number = open that PO. */
  poId: string | null;
  lookups: PoLookups;
  jobs: Job[];
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
  onEditSupplier: (supplier: PoSupplier | null, onDone?: (s: PoSupplier) => void) => void;
}

/**
 * The Access "Purchase Orders" form: header, lines (subform), receive box,
 * NOTES, M-T-R files, Print. Saving moves the WO jobs on the board.
 */
export function PoFormModal({ poId, lookups, jobs, departments, onClose, onSaved, onEditSupplier }: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [boardMessages, setBoardMessages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = poId === 'new';

  useEffect(() => {
    setBoardMessages([]);
    setPendingFiles([]);
    setHint('');
    if (!poId) return setDraft(null);
    if (poId === 'new') return setDraft(blankDraft());
    let alive = true;
    setLoading(true);
    fetch(`/api/pos/${poId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((po: PurchaseOrder | null) => {
        if (!alive) return;
        if (!po) {
          toast({ title: `PO ${poId} not found`, variant: 'destructive' });
          onClose();
          return;
        }
        setDraft({ ...po, lines: po.lines.length ? po.lines : [emptyLine(po.orderDate)] });
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  const supplier = useMemo(() => lookups.suppliers.find((s) => s.id === draft?.supplierId) ?? null, [lookups.suppliers, draft?.supplierId]);
  const kind = draft ? poKind(draft, supplier) : 'none';
  const wos = useMemo(() => (draft ? workOrdersOf(draft.lines) : []), [draft]);
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '';
  const jobFor = (wo: string) => jobs.find((j) => !j.shipped && (j.jobNumber ?? '').replace(/\D/g, '') === wo);

  if (!poId) return null;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setLine = (i: number, patch: Partial<PoLine>) =>
    setDraft((d) => (d ? { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : d));

  // Picking who received it stamps today (ACTIVE is left to OPEN // CLOSE).
  const pickReceiver = (name: string) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, employeeReceived: name };
      if (name && name !== d.employeeReceived) next.receivedDate = todayIso();
      return next;
    });

  // ACTIVE can't be clicked: CLOSED / PENDING / VOID turn it off (OUTSIDE -> OLD FILES), OPEN turns it on.
  const pickStatus = (status: Draft['status']) =>
    setDraft((d) => {
      if (!d) return d;
      const active = activeForStatus(status);
      return { ...d, status, ...(active === null ? {} : { active }) };
    });

  const uploadFiles = async (id: string, files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      let latest: PurchaseOrder | null = null;
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch(`/api/pos/${id}/mtr`, { method: 'POST', body: fd });
        if (res.ok) latest = await res.json();
        else toast({ title: `Could not attach ${f.name}`, variant: 'destructive' });
      }
      if (latest) setDraft((d) => (d ? { ...d, mtr: latest!.mtr } : d));
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (path: string) => {
    if (!draft?.id || !confirm('Remove this file from the PO?')) return;
    const res = await fetch(`/api/pos/${draft.id}/mtr?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (res.ok) {
      const po: PurchaseOrder = await res.json();
      setDraft((d) => (d ? { ...d, mtr: po.mtr } : d));
    }
  };

  const save = async (andClose: boolean) => {
    if (!draft) return;
    setSaving(true);
    try {
      // Contact Name lives on the supplier (Access edits the supplier record).
      if (supplier && (draft as Draft & { contactName?: string }).contactName !== undefined) {
        const contactName = (draft as Draft & { contactName?: string }).contactName ?? '';
        if (contactName !== supplier.contactName) {
          await fetch(`/api/pos/lookups/suppliers/${supplier.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactName }),
          });
        }
      }
      const res = await fetch(isNew ? '/api/pos' : `/api/pos/${draft.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: 'Could not save the PO',
          description: data.missing ? `Required: ${data.missing.join(', ')}` : data.error,
          variant: 'destructive',
        });
        return;
      }
      const po: PurchaseOrder = data.po;
      if (pendingFiles.length) await uploadFiles(po.id, pendingFiles);
      setPendingFiles([]);
      const messages: string[] = data.board?.messages ?? [];
      setBoardMessages(messages);
      toast({
        title: `PO# ${po.poNumber} saved`,
        description: messages.length ? messages.join('\n') : undefined,
      });
      onSaved();
      if (andClose && !messages.length) onClose();
      else setDraft({ ...po, lines: po.lines.length ? po.lines : [emptyLine(po.orderDate)] });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !confirm(`Delete PO# ${draft.poNumber}? This can't be undone.`)) return;
    const res = await fetch(`/api/pos/${draft.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: `PO# ${draft.poNumber} deleted` });
      onSaved();
      onClose();
    }
  };

  const contactName = draft
    ? ((draft as Draft & { contactName?: string }).contactName ?? supplier?.contactName ?? '')
    : '';

  const header = (
    <div className="bg-card border-b border-border px-5 py-3 flex flex-wrap justify-between items-center gap-2 sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <div className="bg-primary p-2 rounded-lg shrink-0">
          <FileText size={18} className="text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-lg text-card-foreground leading-tight">
            {isNew ? 'New Purchase Order' : `Purchase Order Number: ${draft?.poNumber ?? poId}`}
          </h2>
          {draft && !loading ? (
            <BoardPreview kind={kind} wos={wos} draft={draft} jobFor={jobFor} deptName={deptName} />
          ) : (
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">J&F MACHINE SHOP · Purchase Orders</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!isNew && draft && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => printPurchaseOrder(draft as PurchaseOrder, lookups, supplier)}
            title="PDF Preview / Print Order"
          >
            <Printer size={15} /> Print Order
          </Button>
        )}
        <button onClick={onClose} className="hover:bg-muted p-2 rounded-lg text-muted-foreground hover:text-card-foreground" aria-label="Close form">
          <X size={20} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-6xl rounded-2xl shadow-2xl border border-border max-h-[94vh] overflow-y-auto">
        {header}
        {loading || !draft ? (
          <div className="p-10 flex justify-center text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Header in the Access order: PO / supplier on the left, dates / material on the right. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
              <div className="space-y-1.5">
                <Row label="PO Number">
                  <Input value={isNew ? '(next)' : String(draft.poNumber ?? '')} readOnly className={`${SM} font-bold max-w-[10rem]`} />
                </Row>
                <Row label="Supplier *">
                  <div
                    className="flex gap-1"
                    title={
                      supplier
                        ? [supplier.address, [supplier.city, supplier.state, supplier.postalCode].filter(Boolean).join(' '), supplier.phone]
                            .filter(Boolean)
                            .join(' · ')
                        : undefined
                    }
                  >
                    <select
                      className={SEL}
                      value={draft.supplierId}
                      onChange={(e) => {
                        const s = lookups.suppliers.find((x) => x.id === e.target.value);
                        setDraft((d) => (d ? { ...d, supplierId: e.target.value, supplierName: s?.name ?? '', contactName: undefined } as Draft : d));
                      }}
                    >
                      <option value="">— choose —</option>
                      {lookups.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title={supplier ? 'Open supplier' : 'Add supplier'}
                      onClick={() =>
                        onEditSupplier(supplier, (s) =>
                          setDraft((d) => (d ? ({ ...d, supplierId: s.id, supplierName: s.name, contactName: undefined } as Draft) : d))
                        )
                      }
                    >
                      <UserPlus size={14} />
                    </Button>
                  </div>
                </Row>
                <Row label="Contact Name">
                  <Input
                    className={SM}
                    value={contactName}
                    disabled={!supplier}
                    onChange={(e) => setDraft((d) => (d ? ({ ...d, contactName: e.target.value } as Draft) : d))}
                    onBlur={() => !draft.description && setHint(HINTS.contact)}
                  />
                </Row>
                <Row label="Description *">
                  <Input list="po-descriptions" className={SM} value={draft.description} onChange={(e) => set('description', e.target.value.toUpperCase())} />
                  <datalist id="po-descriptions">
                    {DESCRIPTION_OPTIONS.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </Row>
                <Row label="Authorized By *">
                  <select className={SEL} value={draft.employeeId} onChange={(e) => set('employeeId', e.target.value)}>
                    <option value="">— choose —</option>
                    {[...lookups.employees]
                      .sort((a, b) => employeeLabel(a).localeCompare(employeeLabel(b)))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {employeeLabel(e)}
                        </option>
                      ))}
                  </select>
                </Row>
                <Row label="Time Order">
                  <Input value={isNew ? '(now)' : time12(draft.timeOrder)} readOnly className={`${SM} max-w-[10rem]`} />
                </Row>
              </div>

              <div className="space-y-1.5">
                <Row label="Order Date *">
                  <Input type="date" className={`${SM} max-w-[11rem] font-semibold`} value={draft.orderDate} onChange={(e) => set('orderDate', e.target.value)} />
                </Row>
                <Row label="ETA *" labelClass="text-red-500">
                  <Input type="date" className={`${SM} max-w-[11rem] font-semibold text-red-500`} value={draft.eta} onChange={(e) => set('eta', e.target.value)} />
                </Row>
                <Row label="Shipping Method *">
                  <select className={SEL} value={draft.shippingMethodId} onChange={(e) => set('shippingMethodId', e.target.value)}>
                    <option value="">— choose —</option>
                    {lookups.shippingMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Material In Condition?">
                  <Input list="po-matcond" className={SM} value={draft.materialCondition} onChange={(e) => set('materialCondition', e.target.value)} />
                  <datalist id="po-matcond">
                    {MATERIAL_CONDITION_OPTIONS.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </Row>
                <Row label="HT#">
                  <Input className={SM} value={draft.heatNumber} onChange={(e) => set('heatNumber', e.target.value)} />
                </Row>
                <Row label="DWG# & Part">
                  <Input
                    className={SM}
                    value={draft.partDwg}
                    onChange={(e) => set('partDwg', e.target.value)}
                    onFocus={() => setHint(HINTS.partDwg)}
                    onBlur={() => setHint(HINTS.partDwgExit)}
                  />
                </Row>
                <Row label="MAT-TYPE">
                  <Input className={SM} value={draft.matType} onChange={(e) => set('matType', e.target.value)} onFocus={() => setHint(HINTS.matType)} />
                </Row>
              </div>
            </div>

            {boardMessages.length > 0 && (
              <ul className="rounded-xl border border-sky-500/50 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
                {boardMessages.map((m, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <ArrowRight size={11} /> {m}
                  </li>
                ))}
              </ul>
            )}

            {hint && (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-1.5">
                ⚠ {hint}
              </p>
            )}

            {/* Lines (Purchase Orders Subform) */}
            <LinesTable
              lines={draft.lines}
              setLine={setLine}
              onAdd={() => setDraft((d) => (d ? { ...d, lines: [...d.lines, emptyLine(d.orderDate)] } : d))}
              onRemove={(i) => setDraft((d) => (d ? { ...d, lines: d.lines.filter((_, j) => j !== i) } : d))}
              jobFor={jobFor}
              deptName={deptName}
            />

            {/* Board moves this PO made */}
            {!!draft.jobMoves?.length && (
              <div className="rounded-xl border border-border p-3">
                <span className={PO_LABEL}>Board moves by this PO</span>
                <ul className="text-xs space-y-0.5">
                  {draft.jobMoves.map((m, i) => (
                    <li key={i}>
                      {new Date(m.at).toLocaleString()} · JOB# {m.wo} ·{' '}
                      {m.action === 'note' ? `note updated (${m.toDept})` : `${m.fromDept ? `${m.fromDept} → ` : '→ '}${m.toDept}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Receive box (OPEN // CLOSE drives ACTIVE) + notes, at the foot of the form. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/5 px-2.5 py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide leading-tight">
                    Make sure you fill up this box when the PO arrived
                  </p>
                  <span
                    className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                      draft.active ? 'border-green-600 bg-green-600/10 text-green-600' : 'border-border text-muted-foreground'
                    }`}
                    title="Changes by itself with OPEN // CLOSE: CLOSED, PENDING or VOID = INACTIVE (moves to OLD FILES); OPEN = ACTIVE (OUTSIDE)."
                    onMouseEnter={() => setHint(HINTS.active)}
                  >
                    <input type="checkbox" className="h-3 w-3 accent-green-600 pointer-events-none" checked={draft.active} readOnly tabIndex={-1} />
                    {draft.active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] gap-1.5">
                  <Field label="Received By">
                    <Input list="po-receivers" className={SM} value={draft.employeeReceived} onChange={(e) => pickReceiver(e.target.value.toUpperCase())} />
                    <datalist id="po-receivers">
                      {EMPLOYEE_RECEIVED_OPTIONS.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Order Received">
                    <Input type="date" className={`${SM} px-1 text-xs`} value={draft.receivedDate} onChange={(e) => set('receivedDate', e.target.value)} />
                  </Field>
                  <Field label="Open // Close">
                    <select className={SEL} value={draft.status} onChange={(e) => pickStatus(e.target.value as Draft['status'])}>
                      <option value=""></option>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <Field label="Notes" className="flex flex-col">
                <Textarea rows={3} className="min-h-0 flex-1 text-sm py-1.5" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>

            {/* M-T-R */}
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={PO_LABEL + ' mb-0'}>M-T-R (mill test reports)</span>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />} Attach
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = '';
                    if (isNew || !draft.id) setPendingFiles((p) => [...p, ...files]);
                    else uploadFiles(draft.id, files);
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {draft.mtr.map((f) => (
                  <span key={f.path} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
                    <a href={`/api/file?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer" className="text-primary underline">
                      {f.name}
                    </a>
                    <button type="button" onClick={() => removeFile(f.path)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${f.name}`}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {pendingFiles.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs">
                    {f.name} <em className="text-muted-foreground">(uploads on save)</em>
                  </span>
                ))}
                {!draft.mtr.length && !pendingFiles.length && <span className="text-xs text-muted-foreground">No files.</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!isNew && (
                <Button type="button" variant="ghost" className="text-destructive gap-1.5" onClick={remove}>
                  <Trash2 size={15} /> Delete PO
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Close Form
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => save(false)} className="gap-1.5">
                  <Save size={15} /> Save
                </Button>
                <Button type="button" disabled={saving} onClick={() => save(true)} className="gap-1.5">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save & Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BoardPreview({
  kind,
  wos,
  draft,
  jobFor,
  deptName,
}: {
  kind: ReturnType<typeof poKind>;
  wos: string[];
  draft: Draft;
  jobFor: (wo: string) => Job | undefined;
  deptName: (id: string) => string;
}) {
  const note = poSentNote({ supplierName: draft.supplierName, orderDate: draft.orderDate, poNumber: draft.poNumber ?? 0, eta: draft.eta });
  const detail =
    kind !== 'none' && wos.length > 0
      ? wos
          .map((wo) => {
            const j = jobFor(wo);
            const where = j ? deptName(j.departmentId) : 'not on board';
            return `JOB# ${wo} (${where}${draft.sentWos?.includes(wo) ? ', already sent' : ''})`;
          })
          .join(', ') + (!draft.receivedDate && draft.active ? ` · note “${note.replace('PO# 0', 'PO# (new)')}”` : '')
      : '';
  return (
    <p
      className={`flex items-center gap-1.5 text-[11px] mt-0.5 min-w-0 ${kind === 'none' ? 'text-muted-foreground' : 'text-sky-600 dark:text-sky-400'}`}
      title={detail || kindLabelFor(kind, draft.description, draft.supplierName)}
    >
      <Truck size={12} className="shrink-0" />
      <span className="font-semibold whitespace-nowrap">{kindLabelFor(kind, draft.description, draft.supplierName)}</span>
      {detail && <span className="truncate text-muted-foreground">· {detail}</span>}
    </p>
  );
}

/** A one-line text box that wraps and grows taller to show all of its text. */
function GrowText({ value, onChange, className, placeholder }: { value: string; onChange: (v: string) => void; className: string; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  });
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
    />
  );
}

function LinesTable({
  lines,
  setLine,
  onAdd,
  onRemove,
  jobFor,
  deptName,
}: {
  lines: PoLine[];
  setLine: (i: number, patch: Partial<PoLine>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  jobFor: (wo: string) => Job | undefined;
  deptName: (id: string) => string;
}) {
  const cell = 'h-8 w-full rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50';
  // PROD_DESCRIP / SPEC wrap and grow taller when the text is long.
  const grow = 'block w-full min-h-8 resize-none overflow-hidden rounded border border-input bg-background px-1.5 py-[7px] text-xs leading-[16px] focus:outline-none focus:ring-1 focus:ring-primary/50';
  const th = 'px-1.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap';
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="bg-muted/50">
            <tr>
              <th className={th} style={{ width: 92 }}>Line</th>
              <th className={th} style={{ width: 64 }}>Units</th>
              <th className={th}>PROD_DESCRIP</th>
              <th className={th}>SPEC</th>
              <th className={th} style={{ width: 70 }}>REV</th>
              <th className={th} style={{ width: 150 }}>PART#</th>
              <th className={th} style={{ width: 110 }}>WO</th>
              <th className={th} style={{ width: 96 }}>Unit Price</th>
              <th className={`${th} text-right`} style={{ width: 90 }}>Subtotal</th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const wo = String(l.wo ?? '').replace(/\D/g, '');
              const job = wo ? jobFor(wo) : undefined;
              return (
                <tr key={i} className="border-t border-border align-top">
                  <td className="p-1 pt-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">Line Item {i + 1}</td>
                  <td className="p-1"><input inputMode="decimal" className={cell} value={l.units ?? ''} onChange={(e) => setLine(i, { units: e.target.value === '' ? null : Number(e.target.value) || 0 })} /></td>
                  <td className="p-1"><GrowText className={grow} value={l.prodDescrip ?? ''} onChange={(v) => setLine(i, { prodDescrip: v })} /></td>
                  <td className="p-1">
                    <GrowText
                      className={`${grow} ${!l.spec && (l.prodDescrip || l.wo) ? 'border-amber-500' : ''}`}
                      placeholder={l.prodDescrip || l.wo ? 'PLEASE ADD SPEC' : ''}
                      value={l.spec ?? ''}
                      onChange={(v) => setLine(i, { spec: v })}
                    />
                  </td>
                  <td className="p-1"><input className={cell} value={l.rev ?? ''} onChange={(e) => setLine(i, { rev: e.target.value })} /></td>
                  <td className="p-1"><input className={cell} value={l.partNumber ?? ''} onChange={(e) => setLine(i, { partNumber: e.target.value })} /></td>
                  <td className="p-1">
                    <input className={`${cell} font-semibold`} value={l.wo ?? ''} onChange={(e) => setLine(i, { wo: e.target.value })} />
                    {wo && (
                      <span className={`block text-[9px] mt-0.5 ${job ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {job ? `● ${deptName(job.departmentId)}` : 'not on board'}
                      </span>
                    )}
                  </td>
                  <td className="p-1"><input inputMode="decimal" className={cell} value={l.unitPrice ?? ''} onChange={(e) => setLine(i, { unitPrice: e.target.value === '' ? null : Number(e.target.value.replace(/[$,]/g, '')) })} /></td>
                  <td className="p-1 text-right text-xs tabular-nums pt-2.5">{money(lineSubtotal(l))}</td>
                  <td className="p-1 text-center">
                    <button type="button" onClick={() => onRemove(i)} className="p-1 text-muted-foreground hover:text-destructive" aria-label="Remove line">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30">
              <td colSpan={8} className="p-1.5">
                <Button type="button" variant="ghost" size="sm" className="gap-1 h-7" onClick={onAdd}>
                  <Plus size={14} /> Add line
                </Button>
              </td>
              <td className="p-1.5 text-right text-sm font-bold tabular-nums">{money(poTotal(lines))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
