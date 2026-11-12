'use client';

import { useEffect, useState } from 'react';
import { X, Users, KeyRound, Loader2, UserPlus, Check, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import type { Department } from '@/types';

interface UserRow {
  id: string;
  name: string;
  isActive: boolean;
  role: 'admin' | 'machinist' | '';
  departmentIds: string[];
  hasPin: boolean;
}

interface UsersModalProps {
  open: boolean;
  departments: Department[];
  onClose: () => void;
}

const ROLE_LABEL: Record<UserRow['role'], string> = {
  admin: 'Admin',
  machinist: 'Maquinista',
  '': 'Sin acceso',
};

export function UsersModal({ open, departments, onClose }: UsersModalProps) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsers(null);
    fetch('/api/users', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error);
        return r.json();
      })
      .then(setUsers)
      .catch((e) => {
        toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
        setUsers([]);
      });
  }, [open]);

  if (!open) return null;

  const save = async (id: string, patch: Partial<UserRow> & { pin?: string }) => {
    setSavingId(id);
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      setUsers((prev) => prev?.map((u) => (u.id === id ? data : u)) ?? prev);
      if (patch.pin) {
        setPins((p) => ({ ...p, [id]: '' }));
        toast({ title: 'PIN guardado', description: data.name });
      }
    } catch (e) {
      toast({ title: 'Error', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const addPerson = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: 'Error', description: data.error, variant: 'destructive' });
      return;
    }
    setUsers((prev) => [...(prev ?? []).filter((u) => u.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName('');
  };

  const list = (users ?? []).filter((u) => showHidden || u.isActive);

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-card w-full max-w-4xl max-h-[92vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Users size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-card-foreground">Usuarios</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Acceso con PIN</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-card-foreground" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPerson()}
            placeholder="Nombre de la persona nueva"
            className="h-9 max-w-xs text-sm"
          />
          <Button type="button" size="sm" onClick={addPerson} className="gap-1.5">
            <UserPlus size={14} /> Agregar
          </Button>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Mostrar ocultos
          </label>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {users === null ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            list.map((u) => (
              <div key={u.id} className={`px-5 py-3 flex flex-col gap-2 ${u.isActive ? '' : 'opacity-50'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-card-foreground min-w-[7rem]">{u.name}</span>
                  <div className="bg-muted p-0.5 rounded-lg flex border border-border">
                    {(['admin', 'machinist', ''] as const).map((r) => (
                      <button
                        key={r || 'none'}
                        type="button"
                        disabled={savingId === u.id}
                        onClick={() => u.role !== r && save(u.id, { role: r })}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                          u.role === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-card-foreground'
                        }`}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                      u.hasPin ? 'bg-green-600/20 text-green-500' : 'bg-zinc-600/30 text-muted-foreground'
                    }`}
                  >
                    {u.hasPin ? 'PIN listo' : 'Sin PIN'}
                  </span>

                  <div className="flex items-center gap-1.5 ml-auto">
                    <KeyRound size={14} className="text-muted-foreground" />
                    <Input
                      value={pins[u.id] ?? ''}
                      onChange={(e) => setPins((p) => ({ ...p, [u.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={u.hasPin ? 'Nuevo PIN' : 'PIN (6 dígitos)'}
                      className="h-8 w-32 text-sm tracking-widest"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={(pins[u.id] ?? '').length !== 6 || savingId === u.id}
                      onClick={() => save(u.id, { pin: pins[u.id] })}
                      className="h-8"
                    >
                      {savingId === u.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingId === u.id}
                      onClick={() => save(u.id, { isActive: !u.isActive })}
                      className="h-8 gap-1 text-[11px]"
                      title={u.isActive ? 'Ocultar: sin acceso y fuera de las listas' : 'Volver a mostrar'}
                    >
                      <EyeOff size={13} /> {u.isActive ? 'Ocultar' : 'Mostrar'}
                    </Button>
                  </div>
                </div>

                {u.role === 'machinist' && (
                  <div className="flex flex-wrap gap-1.5 pl-0 sm:pl-[7.5rem]">
                    {departments.map((d) => {
                      const on = u.departmentIds.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() =>
                            save(u.id, {
                              departmentIds: on ? u.departmentIds.filter((x) => x !== d.id) : [...u.departmentIds, d.id],
                            })
                          }
                          className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                            on ? 'text-white border-transparent' : 'text-muted-foreground border-border hover:text-card-foreground'
                          }`}
                          style={on ? { backgroundColor: d.color } : undefined}
                        >
                          {d.name}
                        </button>
                      );
                    })}
                    {u.departmentIds.length === 0 && (
                      <span className="text-[11px] text-amber-500">Escoge al menos un departamento</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
