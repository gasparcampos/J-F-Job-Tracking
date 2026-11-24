'use client';

import { Fragment, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { PoCompany, PoEmployee, PoLookups, PoShippingMethod } from '@/types/po';
import { PO_LABEL } from './po-form-modal';

const TH = 'px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-widest';

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok;
}

/**
 * Setup: the Access "Add or Delete Employees", "Add or Delete Shipping
 * Methods" and "Change Our Company Information" forms.
 */
export function PoSetup({ lookups, onChanged }: { lookups: PoLookups; onChanged: () => void }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <EmployeesEditor employees={lookups.employees} onChanged={onChanged} />
      <div className="space-y-4">
        <ShippingEditor methods={lookups.shippingMethods} onChanged={onChanged} />
        <CompanyEditor company={lookups.company} onChanged={onChanged} />
      </div>
    </div>
  );
}

const EMP_FIELDS: Array<[keyof PoEmployee, string]> = [
  ['firstName', 'First Name'],
  ['lastName', 'Last Name'],
  ['title', 'Title'],
  ['workPhone', 'Work Phone'],
  ['extension', 'Extension'],
  ['email', 'Email'],
];

function EmployeesEditor({ employees, onChanged }: { employees: PoEmployee[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null); // id or 'new'
  const [row, setRow] = useState<Partial<PoEmployee>>({});

  const save = async () => {
    if (!row.firstName?.trim() && !row.lastName?.trim()) return toast({ title: 'Name is required', variant: 'destructive' });
    const ok =
      editing === 'new'
        ? await send('/api/pos/lookups/employees', 'POST', row)
        : await send(`/api/pos/lookups/employees/${editing}`, 'PUT', row);
    if (!ok) return toast({ title: 'Could not save', variant: 'destructive' });
    setEditing(null);
    onChanged();
  };
  const remove = async (e: PoEmployee) => {
    if (!confirm(`Delete ${e.firstName} ${e.lastName}? Old POs keep the name.`)) return;
    if (await send(`/api/pos/lookups/employees/${e.id}`, 'DELETE')) onChanged();
  };

  const editRow = (
    <tr className="border-t border-border bg-primary/5">
      <td className="p-1 text-xs text-muted-foreground">{editing === 'new' ? 'new' : editing}</td>
      {EMP_FIELDS.map(([k]) => (
        <td key={k} className="p-1">
          <Input className="h-8 text-xs" value={String(row[k] ?? '')} onChange={(e) => setRow((r) => ({ ...r, [k]: e.target.value }))} />
        </td>
      ))}
      <td className="p-1 whitespace-nowrap">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} aria-label="Save"><Check size={14} /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(null)} aria-label="Cancel"><X size={14} /></Button>
      </td>
    </tr>
  );

  return (
    <section className="bg-card rounded-2xl border border-border p-4 overflow-x-auto">
      <div className="flex items-center mb-2">
        <h3 className="font-bold">Employees <span className="text-xs text-muted-foreground font-normal">(Authorized By)</span></h3>
        <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => { setEditing('new'); setRow({}); }}>
          <Plus size={14} /> Add
        </Button>
      </div>
      <table className="w-full min-w-[640px]">
        <thead>
          <tr>
            <th className={TH}>ID</th>
            {EMP_FIELDS.map(([, l]) => <th key={l} className={TH}>{l}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {employees.map((e) =>
            editing === e.id ? (
              <Fragment key={e.id}>{editRow}</Fragment>
            ) : (
              <tr key={e.id} className="border-t border-border text-xs">
                <td className="p-2">{e.id}</td>
                {EMP_FIELDS.map(([k]) => <td key={k} className="p-2">{e[k]}</td>)}
                <td className="p-1 whitespace-nowrap">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(e.id); setRow(e); }} aria-label="Edit"><Pencil size={13} /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(e)} aria-label="Delete"><Trash2 size={13} /></Button>
                </td>
              </tr>
            )
          )}
          {editing === 'new' && editRow}
        </tbody>
      </table>
    </section>
  );
}

function ShippingEditor({ methods, onChanged }: { methods: PoShippingMethod[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const save = async () => {
    if (!name.trim()) return;
    const ok =
      editing === 'new'
        ? await send('/api/pos/lookups/shipping', 'POST', { name: name.trim() })
        : await send(`/api/pos/lookups/shipping/${editing}`, 'PUT', { name: name.trim() });
    if (ok) {
      setEditing(null);
      onChanged();
    }
  };
  const remove = async (m: PoShippingMethod) => {
    if (confirm(`Delete shipping method ${m.name}?`) && (await send(`/api/pos/lookups/shipping/${m.id}`, 'DELETE'))) onChanged();
  };
  return (
    <section className="bg-card rounded-2xl border border-border p-4">
      <div className="flex items-center mb-2">
        <h3 className="font-bold">Shipping Methods</h3>
        <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => { setEditing('new'); setName(''); }}>
          <Plus size={14} /> Add
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {[...methods, ...(editing === 'new' ? [{ id: 'new', name: '' }] : [])].map((m) => (
          <li key={m.id} className="flex items-center gap-2 py-1 text-sm">
            <span className="w-8 text-xs text-muted-foreground">{m.id === 'new' ? '' : m.id}</span>
            {editing === m.id ? (
              <>
                <Input className="h-8" autoFocus value={name} onChange={(e) => setName(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && save()} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} aria-label="Save"><Check size={14} /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(null)} aria-label="Cancel"><X size={14} /></Button>
              </>
            ) : (
              <>
                <span className="flex-1">{m.name}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(m.id); setName(m.name); }} aria-label="Edit"><Pencil size={13} /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(m)} aria-label="Delete"><Trash2 size={13} /></Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const COMPANY_FIELDS: Array<[keyof PoCompany, string]> = [
  ['name', 'Company Name'],
  ['address', 'Address'],
  ['city', 'City'],
  ['state', 'State/Province'],
  ['postalCode', 'Postal Code'],
  ['country', 'Country'],
  ['phone', 'Phone Number'],
  ['fax', 'Fax Number'],
  ['email', 'Email'],
];

function CompanyEditor({ company, onChanged }: { company: PoCompany; onChanged: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState(company);
  useEffect(() => setForm(company), [company]);
  const save = async () => {
    if (await send('/api/pos/lookups/company', 'POST', form)) {
      toast({ title: 'Company information saved' });
      onChanged();
    }
  };
  return (
    <section className="bg-card rounded-2xl border border-border p-4">
      <h3 className="font-bold mb-2">Our Company Information <span className="text-xs text-muted-foreground font-normal">(printed on the PO)</span></h3>
      <div className="grid grid-cols-2 gap-2">
        {COMPANY_FIELDS.map(([k, l]) => (
          <div key={k} className={k === 'name' || k === 'address' ? 'col-span-2' : ''}>
            <label className={PO_LABEL}>{l}</label>
            <Input className="h-8" value={form[k] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-3" onClick={save}>Save</Button>
    </section>
  );
}
