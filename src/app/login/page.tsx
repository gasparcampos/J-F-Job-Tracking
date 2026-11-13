'use client';

import { useEffect, useState, useCallback } from 'react';
import { Wrench, Delete, ArrowLeft, Loader2, ShieldCheck, Flame, LogIn, X } from 'lucide-react';

interface LoginUser {
  id: string;
  name: string;
  role: 'admin' | 'machinist';
}

interface BoardDept {
  id: string;
  name: string;
  color: string;
  people: { id: string; name: string }[];
}

interface BoardJob {
  id: string;
  departmentId: string;
  jobNumber: string;
  name: string;
  priority: number;
  quantity: string;
  dueDate: string;
  assignedTo: string;
  inProgress: boolean;
}

const PIN_LEN = 6;
const BOARD_REFRESH_MS = 30_000;

const priorityColors: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-amber-500',
  4: 'bg-blue-500',
  5: 'bg-emerald-500',
};

function daysLeft(due: string): number | null {
  if (!due) return null;
  const d = new Date(due + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function DueTag({ due }: { due: string }) {
  const n = daysLeft(due);
  if (n === null) return null;
  const cls = n < 0 ? 'text-red-400' : n <= 20 ? 'text-amber-400' : 'text-muted-foreground';
  const text = n < 0 ? `${-n}d late` : n === 0 ? 'Due today' : `${n}d`;
  return <span className={`text-[11px] font-bold ${cls}`}>{text}</span>;
}

export default function LoginPage() {
  // 'floor' = shop board with every department (default);
  // 'admin' = office names, reached from the small "Admin login" link.
  const [mode, setMode] = useState<'floor' | 'admin'>('floor');
  const [users, setUsers] = useState<LoginUser[] | null>(null);
  const [board, setBoard] = useState<{ departments: BoardDept[]; jobs: BoardJob[] } | null>(null);
  const [choosing, setChoosing] = useState<BoardDept | null>(null); // department tapped, several people → pick one
  const [picked, setPicked] = useState<{ user: { id: string; name: string }; deptId?: string } | null>(null);
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('as') === 'admin') setMode('admin');
  }, []);

  useEffect(() => {
    fetch('/api/auth/users', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]));
  }, []);

  // The board refreshes itself so a screen left open on the floor stays current.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/board', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => alive && Array.isArray(d?.departments) && setBoard(d))
        .catch(() => alive && setBoard((b) => b ?? { departments: [], jobs: [] }));
    load();
    const t = setInterval(load, BOARD_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const switchMode = (m: 'floor' | 'admin') => {
    setMode(m);
    setPicked(null);
    setChoosing(null);
    setPin('');
    setError('');
    const q = new URLSearchParams(window.location.search);
    if (m === 'admin') q.set('as', 'admin');
    else q.delete('as');
    const qs = q.toString();
    window.history.replaceState(null, '', '/login' + (qs ? '?' + qs : ''));
  };

  const openDept = (d: BoardDept) => {
    setError('');
    setPin('');
    if (d.people.length === 1) setPicked({ user: d.people[0], deptId: d.id });
    else setChoosing(d);
  };

  const backToList = () => {
    setPicked(null);
    setPin('');
    setError('');
  };

  const submit = useCallback(
    async (fullPin: string) => {
      if (!picked) return;
      setBusy(true);
      setError('');
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: picked.user.id, pin: fullPin, remember }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Wrong PIN');
          setPin('');
          return;
        }
        let dest: string;
        if (data.role === 'machinist') {
          dest = picked.deptId ? `/floor?dept=${encodeURIComponent(picked.deptId)}` : '/floor';
        } else {
          const next = new URLSearchParams(window.location.search).get('next');
          dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        }
        window.location.replace(dest);
      } catch {
        setError('No connection. Try again.');
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
      else if (e.key === 'Escape') backToList();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, press]);

  const admins = (users ?? []).filter((u) => u.role === 'admin');
  const pickedDept = picked?.deptId ? board?.departments.find((d) => d.id === picked.deptId) : undefined;

  const logo = (
    <div className="flex items-center gap-3">
      <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/30">
        <Wrench size={22} className="text-primary-foreground" />
      </div>
      <div>
        <h1 className="font-bold text-xl tracking-tight text-card-foreground">Job Tracker</h1>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">J&F Machine Shop</p>
      </div>
    </div>
  );

  // ---------- PIN pad (both modes) ----------
  if (picked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
        <div className="mb-8">{logo}</div>
        <div className="w-full max-w-xs flex flex-col items-center">
          <button
            type="button"
            onClick={backToList}
            className="self-start flex items-center gap-1 text-sm text-muted-foreground hover:text-card-foreground mb-4"
          >
            <ArrowLeft size={16} /> Back
          </button>
          {pickedDept && (
            <span
              className="text-[11px] font-bold uppercase tracking-wider text-white px-2.5 py-1 rounded-md mb-2"
              style={{ backgroundColor: pickedDept.color }}
            >
              {pickedDept.name}
            </span>
          )}
          <p className="text-xl font-bold text-card-foreground">{picked.user.name}</p>
          <p className="text-xs text-muted-foreground mb-5">Enter your {PIN_LEN}-digit PIN</p>

          <div className="flex gap-3 mb-3" aria-label="PIN">
            {Array.from({ length: PIN_LEN }).map((_, i) => (
              <span
                key={i}
                className={`w-4 h-4 rounded-full border-2 ${i < pin.length ? 'bg-primary border-primary' : 'border-muted-foreground/50'}`}
              />
            ))}
          </div>
          <p className="min-h-5 text-sm text-red-500 font-semibold mb-3 text-center">
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
              aria-label="Delete"
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
            Remember me on this device (30 days)
          </label>
          <p className="text-[11px] text-muted-foreground/70 mt-1 text-center">
            Leave it unchecked on shop computers — the session ends by itself after 12 hours.
          </p>
        </div>
      </div>
    );
  }

  // ---------- Admin names ----------
  if (mode === 'admin') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
        <div className="mb-8">{logo}</div>
        <div className="w-full max-w-2xl">
          {users === null ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <section>
              <h2 className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                <ShieldCheck size={14} /> Admin
              </h2>
              {admins.length === 0 ? (
                <p className="text-center text-muted-foreground">No users with a PIN yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {admins.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setPicked({ user: u });
                        setPin('');
                        setError('');
                      }}
                      className="h-16 rounded-xl bg-card border border-border hover:border-primary hover:bg-primary/10 text-card-foreground font-bold text-lg transition-colors"
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() => switchMode('floor')}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-card-foreground"
            >
              <ArrowLeft size={13} /> Shop board
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Shop board (default) ----------
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border">
        {logo}
        <button
          type="button"
          onClick={() => switchMode('admin')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-card-foreground"
        >
          <ShieldCheck size={13} /> Admin login
        </button>
      </header>

      <p className="px-4 sm:px-6 pt-4 text-sm text-muted-foreground">
        Tap your department and enter your PIN to start working.
      </p>

      {board === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="animate-spin" />
        </div>
      ) : board.departments.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No departments with machinists yet.</p>
      ) : (
        <main className="flex-1 p-4 sm:p-6 grid gap-4 content-start sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {board.departments.map((d) => {
            const jobs = board.jobs.filter((j) => j.departmentId === d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => openDept(d)}
                className="group text-left rounded-2xl border border-border bg-card overflow-hidden flex flex-col hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition"
              >
                <div className="h-1.5" style={{ backgroundColor: d.color }} />
                <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="font-black uppercase tracking-wide text-card-foreground truncate">{d.name}</span>
                  <span className="ml-auto text-xs bg-muted rounded-full px-2 py-0.5 text-card-foreground">{jobs.length}</span>
                </div>
                <p className="px-4 text-[11px] text-muted-foreground truncate">{d.people.map((p) => p.name).join(' · ')}</p>

                <div className="flex-1 px-3 py-3 space-y-1.5 max-h-72 overflow-y-auto">
                  {jobs.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70 text-center py-4">No jobs</p>
                  ) : (
                    jobs.map((j) => (
                      <div
                        key={j.id}
                        className={`rounded-lg px-2.5 py-1.5 bg-muted/40 border ${j.inProgress ? 'running-light border-orange-500/40' : 'border-transparent'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-4 rounded-full ${priorityColors[j.priority] || priorityColors[3]}`} />
                          <span className="font-bold text-sm text-card-foreground">{j.jobNumber ? `#${j.jobNumber}` : j.name}</span>
                          {j.inProgress && <Flame size={13} className="text-orange-500" />}
                          <span className="ml-auto">
                            <DueTag due={j.dueDate} />
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-3.5">
                          <span className="truncate">{j.name}</span>
                          {j.assignedTo && <span className="ml-auto flex-shrink-0">👷 {j.assignedTo}</span>}
                        </div>
                        {j.inProgress && (
                          <div className="marquee mt-1 rounded bg-black/40 py-0.5" aria-label="In progress">
                            {/* Two identical halves so the left-to-right loop is seamless */}
                            <div className="marquee-track" aria-hidden="true">
                              {[0, 1].map((half) => (
                                <span key={half} className="flex">
                                  {Array.from({ length: 6 }).map((_, i) => (
                                    <span key={i} className="marquee-text px-3">
                                      » IN PROGRESS
                                    </span>
                                  ))}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-border flex items-center justify-center gap-2 text-sm font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <LogIn size={16} /> Enter
                </div>
              </button>
            );
          })}
        </main>
      )}

      {choosing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setChoosing(null)}>
          <div className="bg-card w-full max-w-sm rounded-2xl border border-border p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-[11px] font-bold uppercase tracking-wider text-white px-2.5 py-1 rounded-md"
                style={{ backgroundColor: choosing.color }}
              >
                {choosing.name}
              </span>
              <button type="button" onClick={() => setChoosing(null)} className="text-muted-foreground hover:text-card-foreground" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="text-lg font-bold text-card-foreground mt-3 mb-3">Who are you?</p>
            <div className="grid grid-cols-2 gap-3">
              {choosing.people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPicked({ user: p, deptId: choosing.id });
                    setChoosing(null);
                  }}
                  className="h-14 rounded-xl bg-muted/40 border border-border hover:border-primary hover:bg-primary/10 text-card-foreground font-bold text-lg transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
