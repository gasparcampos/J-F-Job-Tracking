'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Wrench, LogOut, Loader2, FileText, Play, Pause, Check, NotebookPen, X, Flame, ArrowRight, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import type { Job, Department } from '@/types';
import { visibleDepartments, completeTargets } from '@/lib/dept-flow';
import { assignmentForDept } from '@/lib/dept-assignments';
import { DictationButton } from '@/components/job-tracker/dictation-button';
import {
  HoverPreview,
  previewPlacement,
  PREVIEW_OPEN_MS,
  PREVIEW_CLOSE_MS,
} from '@/components/job-tracker/dashboard-view';

const PdfViewerModal = dynamic(
  () => import('@/components/job-tracker/pdf-viewer-modal').then((m) => m.PdfViewerModal),
  { ssr: false },
);

interface Me {
  authEnabled: boolean;
  user: { id: string; name: string; role: 'admin' | 'machinist'; depts: string[] } | null;
}

const priorityColors: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-amber-500',
  4: 'bg-blue-500',
  5: 'bg-emerald-500',
};

const REFRESH_MS = 20_000;

// Complete flow, step by step: pick the area (if several) → pick who (if the
// area asks) → confirm with optional notes.
interface CompleteState {
  job: Job;
  targets: Department[];
  target: Department | null;
  person: string;
  notes: string;
}

export default function FloorPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tab, setTab] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfJob, setPdfJob] = useState<Job | null>(null);
  const [notesJob, setNotesJob] = useState<Job | null>(null);
  const [notesText, setNotesText] = useState('');
  const [complete, setComplete] = useState<CompleteState | null>(null);

  // Hovering the Router button floats the PDF (same window as the dashboard);
  // clicking it still opens the full viewer.
  const [hover, setHover] = useState<{ job: Job; top: number; left: number; w: number; h: number } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoverTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = closeTimer.current = null;
  };
  const hoverRouter = (job: Job, el: HTMLElement) => {
    if (window.matchMedia('(hover: none)').matches || !job.fileUrl) return; // touch: tap opens it
    clearHoverTimers();
    openTimer.current = setTimeout(() => setHover({ job, ...previewPlacement(el) }), hover ? 60 : PREVIEW_OPEN_MS);
  };
  const leaveRouter = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHover(null), PREVIEW_CLOSE_MS);
  };
  const keepHover = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => clearHoverTimers, []);

  const loadData = useCallback(async () => {
    const [jr, dr] = await Promise.all([
      fetch('/api/jobs', { cache: 'no-store' }),
      fetch('/api/departments', { cache: 'no-store' }),
    ]);
    if (jr.status === 401 || dr.status === 401) {
      window.location.replace('/login');
      return;
    }
    const [j, d] = await Promise.all([jr.json(), dr.json()]);
    if (Array.isArray(j)) setJobs(j);
    if (Array.isArray(d)) setDepartments(visibleDepartments(d));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const m: Me = await fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json());
        if (!m.user) {
          window.location.replace('/login?next=/floor');
          return;
        }
        setMe(m);
        await loadData();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  // Keep the list fresh while the screen is visible.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void loadData().catch(() => {});
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadData]);

  // Machinists see their own areas; admins can look at any of them.
  const myDepts = useMemo(() => {
    if (!me?.user) return [];
    if (me.user.role === 'admin') return departments;
    return departments.filter((d) => me.user!.depts.includes(d.id));
  }, [me, departments]);

  useEffect(() => {
    if (myDepts.length && !myDepts.some((d) => d.id === tab)) setTab(myDepts[0].id);
  }, [myDepts, tab]);

  const tabJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.departmentId === tab && !j.shipped && j.deviationStatus !== 'pending')
        .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3) || (a.order ?? 0) - (b.order ?? 0)),
    [jobs, tab],
  );

  // A machinist with nothing assigned to them (in any of their areas) gets a big
  // flashing notice so they go see their manager instead of grabbing someone else's job.
  const hasNoAssignedJob = useMemo(() => {
    if (!me?.user || me.user.role !== 'machinist') return false;
    const norm = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
    const myName = norm(me.user.name);
    const depts = new Set(me.user.depts);
    return !jobs.some(
      (j) =>
        depts.has(j.departmentId) &&
        !j.shipped &&
        j.deviationStatus !== 'pending' &&
        !!j.assignedTo &&
        norm(j.assignedTo) === myName,
    );
  }, [me, jobs]);

  const countFor = (deptId: string) =>
    jobs.filter((j) => j.departmentId === deptId && !j.shipped && j.deviationStatus !== 'pending').length;

  const replaceJob = (updated: Job) => setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));

  const apiError = async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    toast({ title: 'Error', description: data.error || 'No se pudo completar', variant: 'destructive' });
  };

  const toggleProgress = async (job: Job) => {
    setBusyId(job.id);
    try {
      const res = await fetch(`/api/jobs/${job.id}/in-progress`, { method: 'POST' });
      if (!res.ok) return apiError(res);
      const updated: Job = await res.json();
      replaceJob(updated);
      toast({ title: updated.inProgress ? '🔥 En progreso' : '⏸️ Pausado' });
    } finally {
      setBusyId(null);
    }
  };

  const startComplete = (job: Job) => {
    const targets = completeTargets(job.departmentId, departments);
    if (!targets.length) {
      toast({ title: 'Este trabajo ya está en la última etapa' });
      return;
    }
    setComplete({ job, targets, target: targets.length === 1 ? targets[0] : null, person: '', notes: '' });
  };

  const personChoices = (target: Department | null) => {
    const rule = assignmentForDept(target?.name);
    return rule?.kind === 'choice' ? rule.names : null;
  };

  const confirmComplete = async () => {
    if (!complete?.target) return;
    const { job, target, person, notes } = complete;
    setBusyId(job.id);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDeptId: target.id,
          employeeName: person || target.defaultEmployee || '',
          notes: notes.trim(),
        }),
      });
      if (!res.ok) return apiError(res);
      replaceJob(await res.json());
      toast({ title: '✔ Completado', description: `Enviado a ${target.name}` });
      setComplete(null);
    } finally {
      setBusyId(null);
    }
  };

  const saveNotes = async () => {
    if (!notesJob) return;
    setBusyId(notesJob.id);
    try {
      const res = await fetch(`/api/jobs/${notesJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionNotes: notesText.trim() }),
      });
      if (!res.ok) return apiError(res);
      replaceJob(await res.json());
      toast({ title: 'Notas guardadas' });
      setNotesJob(null);
    } finally {
      setBusyId(null);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const choices = personChoices(complete?.target ?? null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-lg">
        <div className="bg-primary p-2 rounded-xl">
          <Wrench size={20} className="text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-lg leading-tight text-card-foreground truncate">{me?.user?.name}</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">J&F Machine Shop · Piso</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {me?.user?.role === 'admin' && (
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')} className="gap-1.5">
              <LayoutDashboard size={14} /> Dashboard
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
            <LogOut size={14} /> Logout
          </Button>
        </div>
      </nav>

      {myDepts.length === 0 ? (
        <p className="text-center text-muted-foreground p-10">
          No tienes departamentos asignados. Pídele a un administrador que te los asigne en Users.
        </p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-border">
            {myDepts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setTab(d.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold uppercase tracking-wide transition-colors ${
                  tab === d.id ? 'bg-card text-card-foreground' : 'border-border text-muted-foreground hover:text-card-foreground'
                }`}
                style={tab === d.id ? { borderColor: d.color, boxShadow: `inset 0 -3px 0 ${d.color}` } : undefined}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}
                <span className="text-xs bg-muted rounded-full px-2 py-0.5">{countFor(d.id)}</span>
              </button>
            ))}
          </div>

          {hasNoAssignedJob && (
            <div className="mx-4 mt-4 rounded-2xl border-4 border-red-500 bg-red-600/90 px-6 py-8 text-center text-white shadow-2xl shadow-red-600/40 animate-pulse">
              <p className="text-3xl sm:text-5xl font-black uppercase tracking-wide">⚠ Aún no tienes trabajo asignado</p>
              <p className="mt-3 text-lg sm:text-2xl font-bold">Habla con tu manager.</p>
            </div>
          )}

          <main className="flex-1 p-4 grid gap-3 content-start sm:grid-cols-2 xl:grid-cols-3">
            {tabJobs.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-12">No hay trabajos en este departamento.</p>
            )}
            {tabJobs.map((job) => {
              const busy = busyId === job.id;
              return (
                <div
                  key={job.id}
                  className={`rounded-2xl border bg-card p-4 flex flex-col gap-3 ${
                    job.inProgress ? 'border-orange-500 shadow-lg shadow-orange-500/20' : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-2 self-stretch rounded-full ${priorityColors[job.priority] || priorityColors[3]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-2xl font-black text-card-foreground">
                          {job.jobNumber ? `#${job.jobNumber}` : job.title}
                        </span>
                        <span className={`text-[11px] font-bold text-white px-2 py-0.5 rounded-full ${priorityColors[job.priority] || priorityColors[3]}`}>
                          P{job.priority}
                        </span>
                        {job.inProgress && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-orange-500 uppercase">
                            <Flame size={13} /> En progreso
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-card-foreground truncate">{job.name || job.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[job.customer, job.quantity && `QTY ${job.quantity}`, job.dueDate && `Due ${String(job.dueDate).slice(0, 10)}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {job.assignedTo && <p className="text-xs text-muted-foreground">👷 {job.assignedTo}</p>}
                    </div>
                  </div>

                  {job.productionNotes && (
                    <p className="text-xs bg-muted/50 rounded-lg px-3 py-2 text-card-foreground whitespace-pre-wrap line-clamp-4">
                      {job.productionNotes}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!job.fileUrl}
                      onMouseEnter={(e) => hoverRouter(job, e.currentTarget)}
                      onMouseLeave={leaveRouter}
                      onClick={() => {
                        clearHoverTimers();
                        setHover(null);
                        setPdfJob(job);
                      }}
                      className="h-12 gap-2 font-semibold"
                    >
                      <FileText size={18} /> Router
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setNotesJob(job);
                        setNotesText(job.productionNotes ?? '');
                      }}
                      className="h-12 gap-2 font-semibold"
                    >
                      <NotebookPen size={18} /> Notas
                    </Button>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleProgress(job)}
                      className={`h-12 gap-2 font-bold text-white ${job.inProgress ? 'bg-sky-600 hover:bg-sky-500' : 'bg-orange-600 hover:bg-orange-500'}`}
                    >
                      {busy ? <Loader2 size={18} className="animate-spin" /> : job.inProgress ? <Pause size={18} /> : <Play size={18} />}
                      {job.inProgress ? 'Pausar' : 'Start'}
                    </Button>
                    <Button
                      type="button"
                      disabled={busy || !job.inProgress}
                      onClick={() => startComplete(job)}
                      title={job.inProgress ? 'Completar' : 'Primero dale Start'}
                      className="h-12 gap-2 font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground"
                    >
                      <Check size={18} /> Complete
                    </Button>
                  </div>
                </div>
              );
            })}
          </main>
        </>
      )}

      {hover && (
        <HoverPreview
          job={hover.job}
          department={departments.find((d) => d.id === hover.job.departmentId)}
          style={{ top: hover.top, left: hover.left, width: hover.w, height: hover.h }}
          onMouseEnter={keepHover}
          onMouseLeave={leaveRouter}
          hint="Click Router to open the full viewer"
        />
      )}

      {pdfJob && <PdfViewerModal job={pdfJob} onClose={() => setPdfJob(null)} departments={departments} />}

      {notesJob && (
        <Sheet title={`Notas de producción · ${notesJob.jobNumber ? `#${notesJob.jobNumber}` : notesJob.title}`} onClose={() => setNotesJob(null)}>
          <div className="flex justify-end mb-2">
            <DictationButton value={notesText} onChange={setNotesText} />
          </div>
          <Textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            rows={6}
            placeholder="Setup, tooling, proceso..."
            className="text-sm"
          />
          <Button type="button" onClick={saveNotes} disabled={busyId === notesJob.id} className="w-full h-12 mt-3 font-bold">
            Guardar notas
          </Button>
        </Sheet>
      )}

      {complete && (
        <Sheet title={`Completar ${complete.job.jobNumber ? `#${complete.job.jobNumber}` : complete.job.title}`} onClose={() => setComplete(null)}>
          {complete.targets.length > 1 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">¿A dónde va?</p>
              <div className="grid gap-2 mb-4">
                {complete.targets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setComplete({ ...complete, target: t, person: '' })}
                    className={`h-12 rounded-xl border font-bold uppercase ${
                      complete.target?.id === t.id ? 'text-white border-transparent' : 'border-border text-card-foreground'
                    }`}
                    style={complete.target?.id === t.id ? { backgroundColor: t.color } : undefined}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {complete.target && complete.targets.length === 1 && (
            <p className="flex items-center gap-2 text-sm text-card-foreground mb-4">
              Se envía a <ArrowRight size={14} />
              <span className="font-bold uppercase px-2 py-1 rounded-lg text-white" style={{ backgroundColor: complete.target.color }}>
                {complete.target.name}
              </span>
            </p>
          )}

          {choices && (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">¿Para quién?</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {choices.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setComplete({ ...complete, person: n })}
                    className={`h-11 rounded-xl border font-semibold ${
                      complete.person === n ? 'bg-primary text-primary-foreground border-transparent' : 'border-border text-card-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {complete.target && (
            <>
              <Textarea
                value={complete.notes}
                onChange={(e) => setComplete({ ...complete, notes: e.target.value })}
                rows={2}
                placeholder="Notas (opcional)"
                className="text-sm"
              />
              <Button
                type="button"
                onClick={confirmComplete}
                disabled={busyId === complete.job.id || (!!choices && !complete.person)}
                className="w-full h-12 mt-3 font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <Check size={18} className="mr-2" /> Confirmar
              </Button>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-card-foreground">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-card-foreground" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
