'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  HOT_RUSH_OPTIONS,
  KIND_LABEL,
  MATERIAL_CONDITION_OPTIONS,
  STATUS_OPTIONS,
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

  // Access: picking who received it stamps today and unchecks ACTIVE.
  const pickReceiver = (name: string) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, employeeReceived: name };
      if (name && name !== d.employeeReceived) {
        next.receivedDate = todayIso();
        next.active = false;
      }
      return next;
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
      <div className="flex items-center gap-3">
        <div className="bg-primary p-2 rounded-lg">
          <FileText size={18} className="text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-bold text-lg text-card-foreground">
            {isNew ? 'New Purchase Order' : `Purchase Order Number: ${draft?.poNumber ?? poId}`}
          </h2>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">J&F MACHINE SHOP · Purchase Orders</p>
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
            {/* What saving does to the board */}
            <BoardPreview
              kind={kind}
              wos={wos}
              draft={draft}
              jobFor={jobFor}
              deptName={deptName}
              messages={boardMessages}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: PO / supplier */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={PO_LABEL}>PO Number</label>
                    <Input value={isNew ? '(next)' : String(draft.poNumber ?? '')} readOnly className="font-bold" />
                  </div>
                  <div>
                    <label className={PO_LABEL}>Time Order</label>
                    <Input value={isNew ? '(now)' : time12(draft.timeOrder)} readOnly />
                  </div>
                </div>
                <div>
                  <label className={PO_LABEL}>Supplier *</label>
                  <div className="flex gap-1">
                    <select
                      className={PO_FIELD}
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
                      className="h-9 w-9 shrink-0"
                      title={supplier ? 'Open supplier' : 'Add supplier'}
                      onClick={() =>
                        onEditSupplier(supplier, (s) =>
                          setDraft((d) => (d ? ({ ...d, supplierId: s.id, supplierName: s.name, contactName: undefined } as Draft) : d))
                        )
                      }
                    >
                      <UserPlus size={15} />
                    </Button>
                  </div>
                  {supplier && (
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      {[supplier.address, [supplier.city, supplier.state, supplier.postalCode].filter(Boolean).join(' '), supplier.phone]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <div>
                  <label className={PO_LABEL}>Contact Name</label>
                  <Input
                    value={contactName}
                    disabled={!supplier}
                    onChange={(e) => setDraft((d) => (d ? ({ ...d, contactName: e.target.value } as Draft) : d))}
                    onBlur={() => !draft.description && setHint(HINTS.contact)}
                  />
                </div>
                <div>
                  <label className={PO_LABEL}>Description *</label>
                  <Input list="po-descriptions" value={draft.description} onChange={(e) => set('description', e.target.value.toUpperCase())} />
                  <datalist id="po-descriptions">
                    {DESCRIPTION_OPTIONS.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={PO_LABEL}>Authorized By *</label>
                  <select className={PO_FIELD} value={draft.employeeId} onChange={(e) => set('employeeId', e.target.value)}>
                    <option value="">— choose —</option>
                    {[...lookups.employees]
                      .sort((a, b) => employeeLabel(a).localeCompare(employeeLabel(b)))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {employeeLabel(e)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Middle: dates / material */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={PO_LABEL}>Order Date *</label>
                    <Input type="date" value={draft.orderDate} onChange={(e) => set('orderDate', e.target.value)} />
                  </div>
                  <div>
                    <label className={PO_LABEL}>ETA *</label>
                    <Input type="date" value={draft.eta} onChange={(e) => set('eta', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={PO_LABEL}>Shipping Method *</label>
                  <select className={PO_FIELD} value={draft.shippingMethodId} onChange={(e) => set('shippingMethodId', e.target.value)}>
                    <option value="">— choose —</option>
                    {lookups.shippingMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={PO_LABEL}>Material In Condition?</label>
                  <Input list="po-matcond" value={draft.materialCondition} onChange={(e) => set('materialCondition', e.target.value)} />
                  <datalist id="po-matcond">
                    {MATERIAL_CONDITION_OPTIONS.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={PO_LABEL}>HT#</label>
                  <Input value={draft.heatNumber} onChange={(e) => set('heatNumber', e.target.value)} />
                </div>
                <div>
                  <label className={PO_LABEL}>DWG# & Part</label>
                  <Input
                    value={draft.partDwg}
                    onChange={(e) => set('partDwg', e.target.value)}
                    onFocus={() => setHint(HINTS.partDwg)}
                    onBlur={() => setHint(HINTS.partDwgExit)}
                  />
                </div>
                <div>
                  <label className={PO_LABEL}>MAT-TYPE</label>
                  <Input value={draft.matType} onChange={(e) => set('matType', e.target.value)} onFocus={() => setHint(HINTS.matType)} />
                </div>
                <div>
                  <label className={PO_LABEL}>HOT-RUSH</label>
                  <Input list="po-hotrush" value={draft.hotRush} onChange={(e) => set('hotRush', e.target.value)} />
                  <datalist id="po-hotrush">
                    {HOT_RUSH_OPTIONS.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Right: active / receive / notes */}
              <div className="space-y-3">
                <label
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none ${
                    draft.active ? 'border-green-600 bg-green-600/10' : 'border-border'
                  }`}
                  onMouseEnter={() => setHint(HINTS.active)}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-green-600"
                    checked={draft.active}
                    onChange={(e) => set('active', e.target.checked)}
                  />
                  <span className="text-sm font-bold">{draft.active ? 'ACTIVE' : 'INACTIVE'}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">checked = out (OUTSIDE list)</span>
                </label>

                <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/5 p-3 space-y-2">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
                    Make sure you fill up this box when the PO arrived
                  </p>
                  <div>
                    <label className={PO_LABEL}>Employee Received</label>
                    <Input list="po-receivers" value={draft.employeeReceived} onChange={(e) => pickReceiver(e.target.value.toUpperCase())} />
                    <datalist id="po-receivers">
                      {EMPLOYEE_RECEIVED_OPTIONS.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={PO_LABEL}>Order Received</label>
                      <Input type="date" value={draft.receivedDate} onChange={(e) => set('receivedDate', e.target.value)} />
                    </div>
                    <div>
                      <label className={PO_LABEL}>Open // Close</label>
                      <select className={PO_FIELD} value={draft.status} onChange={(e) => set('status', e.target.value as Draft['status'])}>
                        <option value=""></option>
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={PO_LABEL}>Notes</label>
                  <Textarea rows={5} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
                </div>
              </div>
            </div>

            {hint && (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-1.5">
                ⚠ {hint}
              </p>
            )}

            {/* Lines (Purchase Orders Subform) */}
            <LinesTable
              lines={draft.lines}
              orderDate={draft.orderDate}
              setLine={setLine}
              onAdd={() => setDraft((d) => (d ? { ...d, lines: [...d.lines, emptyLine(d.orderDate)] } : d))}
              onRemove={(i) => setDraft((d) => (d ? { ...d, lines: d.lines.filter((_, j) => j !== i) } : d))}
              jobFor={jobFor}
              deptName={deptName}
            />

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
  messages,
}: {
  kind: ReturnType<typeof poKind>;
  wos: string[];
  draft: Draft;
  jobFor: (wo: string) => Job | undefined;
  deptName: (id: string) => string;
  messages: string[];
}) {
  const note = poSentNote({ supplierName: draft.supplierName, orderDate: draft.orderDate, poNumber: draft.poNumber ?? 0, eta: draft.eta });
  return (
    <div className={`rounded-xl px-3 py-2 text-xs border ${kind === 'none' ? 'border-border bg-muted/30' : 'border-sky-500/50 bg-sky-500/10'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Truck size={14} className="shrink-0" />
        <span className="font-semibold">{KIND_LABEL[kind]}</span>
        {kind !== 'none' && wos.length > 0 && (
          <span className="text-muted-foreground">
            · {wos.map((wo) => {
              const j = jobFor(wo);
              const where = j ? deptName(j.departmentId) : 'not on board';
              return `JOB# ${wo} (${where}${draft.sentWos?.includes(wo) ? ', already sent' : ''})`;
            }).join(', ')}
            {!draft.receivedDate && draft.active && <> · note “{note.replace('PO# 0', 'PO# (new)')}”</>}
          </span>
        )}
      </div>
      {messages.length > 0 && (
        <ul className="mt-1 font-semibold text-sky-700 dark:text-sky-300">
          {messages.map((m, i) => (
            <li key={i} className="flex items-center gap-1">
              <ArrowRight size={11} /> {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinesTable({
  lines,
  orderDate,
  setLine,
  onAdd,
  onRemove,
  jobFor,
  deptName,
}: {
  lines: PoLine[];
  orderDate: string;
  setLine: (i: number, patch: Partial<PoLine>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  jobFor: (wo: string) => Job | undefined;
  deptName: (id: string) => string;
}) {
  const cell = 'h-8 w-full rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50';
  const th = 'px-1.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap';
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="bg-muted/50">
            <tr>
              <th className={th} style={{ width: 120 }}>Date</th>
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
                  <td className="p-1"><input type="date" className={cell} value={l.date ?? orderDate} onChange={(e) => setLine(i, { date: e.target.value })} /></td>
                  <td className="p-1"><input inputMode="decimal" className={cell} value={l.units ?? ''} onChange={(e) => setLine(i, { units: e.target.value === '' ? null : Number(e.target.value) || 0 })} /></td>
                  <td className="p-1"><input className={cell} value={l.prodDescrip ?? ''} onChange={(e) => setLine(i, { prodDescrip: e.target.value })} /></td>
                  <td className="p-1">
                    <input
                      className={`${cell} ${!l.spec && (l.prodDescrip || l.wo) ? 'border-amber-500' : ''}`}
                      placeholder={l.prodDescrip || l.wo ? 'PLEASE ADD SPEC' : ''}
                      value={l.spec ?? ''}
                      onChange={(e) => setLine(i, { spec: e.target.value })}
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
