'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, FileText, AlertTriangle, Users } from 'lucide-react';
import type { Job, Department } from '@/types';
import { toProxyUrl } from '@/lib/file-url';

interface DashboardViewProps {
  departments: Department[];
  /** Active (not shipped) jobs, already filtered by the search box. */
  jobs: Job[];
  /** Click a job → open the full PDF viewer. */
  onOpenJob: (job: Job) => void;
}

const priorityColors: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-amber-500',
  4: 'bg-blue-500',
  5: 'bg-emerald-500',
};

const UNASSIGNED = 'Unassigned';

// Popup size (clamped to the viewport at show time).
const POPUP_W = 560;
const POPUP_H = 760;
const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 180;

function jobLabel(job: Job) {
  return job.jobNumber ? `#${job.jobNumber}` : job.title;
}

function isViewable(job: Job) {
  const typeSource = (job.fileName || job.fileUrl?.split('?')[0] || '').toLowerCase();
  return {
    isPdf: typeSource.endsWith('.pdf'),
    isImage: /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource),
  };
}

/**
 * Compact overview: every department on one screen, with job counts per
 * department and per employee. Hovering a job pops its PDF up in a floating
 * window; clicking opens the full viewer.
 */
export function DashboardView({ departments, jobs, onOpenJob }: DashboardViewProps) {
  // Wide screens: lay all departments out in exactly 2 rows that fill the
  // screen. Smaller screens fall back to a wrapping grid that scrolls.
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const jobsByDept = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of jobs) {
      const list = map.get(j.departmentId) ?? [];
      list.push(j);
      map.set(j.departmentId, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => (a.priority ?? 3) - (b.priority ?? 3) || (a.order ?? 0) - (b.order ?? 0)
      );
    }
    return map;
  }, [jobs]);

  // Shop-wide job count per employee (only jobs sitting in a visible column).
  const employeeTotals = useMemo(() => {
    const visibleIds = new Set(departments.map((d) => d.id));
    const counts = new Map<string, number>();
    for (const j of jobs) {
      if (!visibleIds.has(j.departmentId)) continue;
      const name = j.assignedTo?.trim() || UNASSIGNED;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [jobs, departments]);

  const totalJobs = employeeTotals.reduce((s, [, n]) => s + n, 0);
  const inProgressCount = jobs.filter((j) => j.inProgress).length;

  // ---- Hover PDF popup ----
  const [preview, setPreview] = useState<{ job: Job; top: number; left: number; w: number; h: number } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  const handleRowEnter = (job: Job, el: HTMLElement) => {
    // Touch screens have no hover — they tap to open the full viewer instead.
    if (window.matchMedia('(hover: none)').matches) return;
    if (!job.fileUrl) return;
    clearTimers();
    openTimer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const w = Math.min(POPUP_W, vw - margin * 2);
      const h = Math.min(POPUP_H, vh - margin * 2);
      // Prefer the right side of the row; flip left if there's no room.
      let left = r.right + 10;
      if (left + w > vw - margin) left = r.left - w - 10;
      if (left < margin) left = Math.max(margin, Math.min(vw - w - margin, r.left));
      let top = r.top + r.height / 2 - h / 2;
      top = Math.max(margin, Math.min(vh - h - margin, top));
      setPreview({ job, top, left, w, h });
    }, preview ? 60 : HOVER_OPEN_MS);
  };

  const scheduleClose = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPreview(null), HOVER_CLOSE_MS);
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const gridStyle: React.CSSProperties = isWide
    ? {
        gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(departments.length / 2))}, minmax(0, 1fr))`,
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
      }
    : {
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gridAutoRows: '320px',
      };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Summary strip: totals + jobs per employee across the whole shop. */}
      <div className="flex items-center gap-2 flex-shrink-0 overflow-x-auto pb-1">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex-shrink-0 shadow-lg shadow-primary/30">
          {totalJobs} jobs
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600/20 text-orange-300 border border-orange-600/40 text-xs font-bold flex-shrink-0">
          <Flame size={12} />
          {inProgressCount} in progress
        </div>
        <div className="w-px h-6 bg-border mx-1 flex-shrink-0" />
        <Users size={14} className="text-muted-foreground flex-shrink-0" />
        {employeeTotals.map(([name, n]) => (
          <div
            key={name}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex-shrink-0 ${
              name === UNASSIGNED
                ? 'bg-muted/40 border-border text-muted-foreground italic'
                : 'bg-card border-border text-card-foreground'
            }`}
          >
            {name}
            <span className="bg-muted px-1.5 rounded text-[10px] font-bold text-primary">{n}</span>
          </div>
        ))}
      </div>

      {/* Department tiles */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className={`grid gap-2 ${isWide ? 'h-full' : ''}`} style={gridStyle}>
          {departments.map((dept) => {
            const deptJobs = jobsByDept.get(dept.id) ?? [];
            const perEmployee = new Map<string, number>();
            for (const j of deptJobs) {
              const name = j.assignedTo?.trim() || UNASSIGNED;
              perEmployee.set(name, (perEmployee.get(name) ?? 0) + 1);
            }
            const employeeList = [...perEmployee.entries()].sort((a, b) => b[1] - a[1]);
            const active = deptJobs.filter((j) => j.inProgress).length;

            return (
              <section
                key={dept.id}
                className="bg-muted/30 rounded-xl border-x border-b border-border/40 border-t-[3px] flex flex-col min-h-0 overflow-hidden"
                style={{ borderTopColor: dept.color }}
              >
                {/* Tile header */}
                <div className="flex items-center justify-between gap-1 px-2 pt-2 pb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                    <h3 className="font-bold text-card-foreground text-[10px] uppercase tracking-wider truncate" title={dept.name}>
                      {dept.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {active > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-orange-300" title="In progress">
                        <Flame size={10} />
                        {active}
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                        deptJobs.length > 0
                          ? 'bg-card text-card-foreground border-border'
                          : 'bg-transparent text-muted-foreground/60 border-border/50'
                      }`}
                    >
                      {deptJobs.length}
                    </span>
                  </div>
                </div>

                {/* Who has what in this area */}
                {employeeList.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                    {employeeList.map(([name, n]) => (
                      <span
                        key={name}
                        className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          name === UNASSIGNED
                            ? 'border-border/60 text-muted-foreground italic'
                            : 'border-border bg-card/70 text-card-foreground'
                        }`}
                      >
                        {name} <b className="text-primary">{n}</b>
                      </span>
                    ))}
                  </div>
                )}

                {/* Job list */}
                <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-1.5 space-y-1">
                  {deptJobs.length === 0 ? (
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center pt-4">
                      No jobs
                    </p>
                  ) : (
                    deptJobs.map((job) => {
                      const pending = job.deviationStatus === 'pending';
                      return (
                        <button
                          key={job.id}
                          type="button"
                          onMouseEnter={(e) => handleRowEnter(job, e.currentTarget)}
                          onMouseLeave={scheduleClose}
                          onClick={() => {
                            clearTimers();
                            setPreview(null);
                            onOpenJob(job);
                          }}
                          className={`w-full text-left rounded-md px-1.5 py-1 border flex items-center gap-1.5 transition-colors ${
                            preview?.job.id === job.id ? 'ring-1 ring-primary ' : ''
                          }${
                            pending
                              ? 'bg-red-950/60 border-red-700/60 hover:bg-red-900/60'
                              : job.inProgress
                              ? 'bg-orange-950/60 border-orange-700/60 hover:bg-orange-900/60'
                              : 'bg-card border-border/60 hover:border-primary/60 hover:bg-card/80'
                          }`}
                        >
                          <span
                            className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${priorityColors[job.priority] || priorityColors[3]}`}
                            title={`P${job.priority}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1">
                              <span className="text-[11px] font-bold text-card-foreground truncate">
                                {jobLabel(job)}
                              </span>
                              {pending && <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />}
                              {job.inProgress && !pending && (
                                <Flame size={10} className="text-orange-400 animate-pulse flex-shrink-0" />
                              )}
                            </span>
                            <span className="block text-[9px] text-muted-foreground truncate">
                              {[job.name || (job.jobNumber ? job.title : ''), job.assignedTo]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </span>
                          </span>
                          {!job.fileUrl && (
                            <FileText size={10} className="text-muted-foreground/40 flex-shrink-0" aria-label="No PDF" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Floating PDF window */}
      {preview && (
        <HoverPreview
          job={preview.job}
          department={departments.find((d) => d.id === preview.job.departmentId)}
          style={{ top: preview.top, left: preview.left, width: preview.w, height: preview.h }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
    </div>
  );
}

function HoverPreview({
  job,
  department,
  style,
  onMouseEnter,
  onMouseLeave,
}: {
  job: Job;
  department?: Department;
  style: React.CSSProperties;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { isPdf, isImage } = isViewable(job);
  const src = toProxyUrl(job.fileUrl);

  return (
    <div
      className="fixed z-[70] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="px-3 py-2 flex items-center justify-between gap-2 border-b border-border flex-shrink-0"
        style={{ borderTop: `3px solid ${department?.color ?? 'transparent'}` }}
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-card-foreground truncate">
            {jobLabel(job)} {job.name ? <span className="font-medium text-muted-foreground">· {job.name}</span> : null}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {[department?.name, job.assignedTo, job.customer, job.quantity && `QTY ${job.quantity}`, job.dueDate && `Due ${job.dueDate}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full flex-shrink-0 ${priorityColors[job.priority] || priorityColors[3]}`}>
          P{job.priority}
        </span>
      </div>
      <div className="flex-1 min-h-0 bg-white">
        {isPdf ? (
          <iframe
            key={src}
            src={`${src}#toolbar=0&navpanes=0&statusbar=0&messages=0&view=FitH`}
            title={job.fileName || 'PDF'}
            className="w-full h-full"
            style={{ border: 'none' }}
          />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={job.fileName || 'preview'} className="w-full h-full object-contain" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs gap-2">
            <FileText size={28} />
            No preview available
          </div>
        )}
      </div>
      <p className="text-[9px] text-center text-muted-foreground py-1 border-t border-border flex-shrink-0">
        Click the job to open the full viewer
      </p>
    </div>
  );
}
