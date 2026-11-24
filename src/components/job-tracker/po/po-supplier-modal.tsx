'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { PoKind, PoSupplier } from '@/types/po';
import { CITY_OPTIONS, KIND_LABEL, STATE_OPTIONS } from '@/lib/po-shared';
import { PO_FIELD, PO_LABEL } from './po-form-modal';

const EMPTY: Omit<PoSupplier, 'id'> = {
  name: '',
  contactName: '',
  contactTitle: '',
  address: '',
  city: 'HOUSTON',
  state: 'TX',
  postalCode: '',
  country: '',
  phone: '',
  fax: '',
  email: '',
  paymentTerms: '',
  notes: '',
  kind: 'none',
};

interface Props {
  /** undefined = closed, null = new supplier, else edit. */
  supplier: PoSupplier | null | undefined;
  onClose: () => void;
  onSaved: (s: PoSupplier) => void;
  onDeleted?: () => void;
  poCount?: number;
}

/** The Access "Suppliers" form (Add Record / edit), plus what its POs do to jobs. */
export function PoSupplierModal({ supplier, onClose, onSaved, onDeleted, poCount = 0 }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<Omit<PoSupplier, 'id'>>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (supplier === undefined) return;
    if (supplier) {
      const { id: _id, ...rest } = supplier;
      void _id;
      setForm(rest);
    } else setForm(EMPTY);
  }, [supplier]);

  if (supplier === undefined) return null;
  const isNew = supplier === null;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Supplier Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(isNew ? '/api/pos/lookups/suppliers' : `/api/pos/lookups/suppliers/${supplier!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, name: form.name.trim() }),
      });
      if (!res.ok) {
        toast({ title: 'Could not save the supplier', variant: 'destructive' });
        return;
      }
      const saved: PoSupplier = await res.json();
      toast({ title: `${saved.name} saved` });
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!supplier) return;
    if (poCount > 0) {
      toast({ title: `${supplier.name} has ${poCount} POs`, description: "A supplier with POs can't be deleted.", variant: 'destructive' });
      return;
    }
    if (!confirm(`Delete supplier ${supplier.name}?`)) return;
    const res = await fetch(`/api/pos/lookups/suppliers/${supplier.id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeleted?.();
      onClose();
    }
  };

  const field = (k: keyof typeof form, label: string, opts?: { list?: string; type?: string }) => (
    <div>
      <label className={PO_LABEL}>{label}</label>
      <Input list={opts?.list} type={opts?.type} value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border max-h-[92vh] overflow-y-auto">
        <div className="border-b border-border px-5 py-3 flex justify-between items-center sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Building2 size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{isNew ? 'New Supplier' : form.name || 'Supplier'}</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {isNew ? 'Suppliers · Add Record' : `Supplier ID: ${supplier!.id}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-muted p-2 rounded-lg text-muted-foreground" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">{field('name', 'Supplier Name *')}</div>
          {field('contactName', 'Contact Name')}
          {field('contactTitle', 'Contact Title')}
          <div className="sm:col-span-2">{field('address', 'Address')}</div>
          {field('city', 'City', { list: 'po-cities' })}
          {field('state', 'State/Province', { list: 'po-states' })}
          {field('postalCode', 'Postal Code')}
          {field('country', 'Country')}
          {field('phone', 'Phone Number')}
          {field('fax', 'Fax Number')}
          {field('email', 'Email Address', { type: 'email' })}
          {field('paymentTerms', 'Payment Terms')}
          <datalist id="po-cities">{CITY_OPTIONS.map((c) => <option key={c} value={c} />)}</datalist>
          <datalist id="po-states">{STATE_OPTIONS.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="sm:col-span-2">
            <label className={PO_LABEL}>Notes</label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <div className="sm:col-span-2 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3">
            <label className={PO_LABEL}>What this supplier&apos;s POs do to the job (when the Description doesn&apos;t say)</label>
            <select className={PO_FIELD} value={form.kind} onChange={(e) => set('kind', e.target.value as PoKind)}>
              {(['os', 'nde', 'none'] as PoKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center gap-2">
          {!isNew && (
            <Button variant="ghost" className="text-destructive gap-1.5" onClick={remove}>
              <Trash2 size={15} /> Delete
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close Form
            </Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {isNew ? 'Add Record' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
