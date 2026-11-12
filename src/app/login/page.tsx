'use client';

import { useEffect, useState, useCallback } from 'react';
import { Wrench, Delete, ArrowLeft, Loader2, ShieldCheck, HardHat } from 'lucide-react';

interface LoginUser {
  id: string;
  name: string;
  role: 'admin' | 'machinist';
}

const PIN_LEN = 6;

export default function LoginPage() {
  const [users, setUsers] = useState<LoginUser[] | null>(null);
  const [picked, setPicked] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/users', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]));
  }, []);

  const submit = useCallback(
    async (fullPin: string) => {
      if (!picked) return;
      setBusy(true);
      setError('');
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: picked.id, pin: fullPin, remember }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'PIN incorrecto');
          setPin('');
          return;
        }
        const next = new URLSearchParams(window.location.search).get('next');
        const dest = data.role === 'machinist' ? '/floor' : next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        window.location.replace(dest);
      } catch {
        setError('Sin conexión. Intenta de nuevo.');
        setPin('');
      } finally {
        setBusy(false);
      }
    },
    [picked, remember],
  );

  const press = useCallback(
    (d: string) => {
      if (busy || pin.length >= PIN_LEN) return;
      setError('');
      const n = pin + d;
      setPin(n);
      if (n.length === PIN_LEN) void submit(n);
    },
    [busy, pin, submit],
  );

  // Physical keyboard works too.
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Escape') {
        setPicked(null);
        setPin('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, press]);

  const admins = (users ?? []).filter((u) => u.role === 'admin');
  const machinists = (users ?? []).filter((u) => u.role === 'machinist');

  const nameButton = (u: LoginUser) => (
    <button
      key={u.id}
      type="button"
      onClick={() => {
        setPicked(u);
        setPin('');
        setError('');
      }}
      className="h-16 rounded-xl bg-card border border-border hover:border-primary hover:bg-primary/10 text-card-foreground font-bold text-lg transition-colors"
    >
      {u.name}
    </button>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-primary p-3 rounded-xl shadow-lg shadow-primary/30">
          <Wrench size={26} className="text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-bold text-2xl tracking-tight text-card-foreground">Job Tracker</h1>
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest">J&F Machine Shop</p>
        </div>
      </div>

      {!picked ? (
        <div className="w-full max-w-2xl">
          {users === null ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Todavía no hay usuarios con PIN. Un administrador debe darlos de alta en <b>Users</b>.
            </p>
          ) : (
            <div className="space-y-6">
              {admins.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    <ShieldCheck size={14} /> Administración
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{admins.map(nameButton)}</div>
                </section>
              )}
              {machinists.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    <HardHat size={14} /> Piso
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{machinists.map(nameButton)}</div>
                </section>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-xs flex flex-col items-center">
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              setPin('');
              setError('');
            }}
            className="self-start flex items-center gap-1 text-sm text-muted-foreground hover:text-card-foreground mb-4"
          >
            <ArrowLeft size={16} /> Cambiar usuario
          </button>
          <p className="text-xl font-bold text-card-foreground">{picked.name}</p>
          <p className="text-xs text-muted-foreground mb-5">Escribe tu PIN de {PIN_LEN} dígitos</p>

          <div className="flex gap-3 mb-3" aria-label="PIN">
            {Array.from({ length: PIN_LEN }).map((_, i) => (
              <span
                key={i}
                className={`w-4 h-4 rounded-full border-2 ${i < pin.length ? 'bg-primary border-primary' : 'border-muted-foreground/50'}`}
              />
            ))}
          </div>
          <p className="h-5 text-sm text-red-500 font-semibold mb-3 text-center">
            {busy ? <Loader2 size={16} className="animate-spin inline text-muted-foreground" /> : error}
          </p>

          <div className="grid grid-cols-3 gap-3 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => press(d)}
                className="h-16 rounded-xl bg-card border border-border text-2xl font-bold text-card-foreground hover:bg-muted active:scale-95 transition"
              >
                {d}
              </button>
            ))}
            <span />
            <button
              type="button"
              onClick={() => press('0')}
              className="h-16 rounded-xl bg-card border border-border text-2xl font-bold text-card-foreground hover:bg-muted active:scale-95 transition"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              className="h-16 rounded-xl text-muted-foreground hover:text-card-foreground flex items-center justify-center"
              aria-label="Borrar"
            >
              <Delete size={24} />
            </button>
          </div>

          <label className="flex items-center gap-2 mt-6 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 accent-[hsl(var(--primary))]"
            />
            Recordarme en este dispositivo (30 días)
          </label>
          <p className="text-[11px] text-muted-foreground/70 mt-1 text-center">
            Déjalo sin marcar en las computadoras del taller — la sesión se cierra sola en 12 horas.
          </p>
        </div>
      )}
    </div>
  );
}
