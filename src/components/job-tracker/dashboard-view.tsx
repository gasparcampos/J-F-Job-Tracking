'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable, useDndMonitor } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flame, FileText, AlertTriangle, Users, Play, Pause, Check, ArrowRightLeft, Truck, X } from 'lucide-react';
import type { Job, Department } from '@/types';
import { toProxyUrl } from '@/lib/file-url';

/** Which card actions a department allows (same rules as the Kanban). */
export interface DeptOptions {
  canMove: boolean;
  showProgress: boolean;
  showComplete: boolean;
  isShipping: boolean;
}

interface DashboardViewProps {
  departments: Department[];
  /** Active (not shipped) jobs, already filtered by the search box. */
  jobs: Job[];
  /** Click a job → open the full PDF viewer. */
  onOpenJob: (job: Job) => void;
  getDeptOptions: (dept: Department) => DeptOptions;
  onToggleInProgress: (job: Job) => void;
  onMarkDone: (job: Job) => void;
  onMoveToAnyDept: (job: Job) => void;
  onShip: (job: Job) => void;
  highlightJobs?: boolean;
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

function fileKind(job: Job) {
  const typeSource = (job.fileName || job.fileUrl?.split('?')[0] || '').toLowerCase();
  return {
    isPdf: typeSource.endsWith('.pdf'),
    isImage: /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource),
  };
}

const sortJobs = (list: Job[]) =>
  list.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3) || (a.order ?? 0) - (b.order ?? 0));

/**
 * Compact overview: every department on one screen, with job counts per
 * department and per employee. Jobs can be dragged between departments or
 * up/down inside one (same as the Kanban). Hovering a job pops its PDF up in
 * a floating window; clicking opens the full viewer.
 *
 * Must be rendered inside the page's <DndContext>.
 */
export function DashboardView({
  departments,
  jobs,
  onOpenJob,
  getDeptOptions,
  onToggleInProgress,
  onMarkDone,
  onMoveToAnyDept,
  onShip,
  highlightJobs,
}: DashboardViewProps) {
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

  // Tapping a name chip shows only that person's jobs (tap again, or the X,
  // to show everyone). Departments with none of their jobs are hidden so the
  // phone goes straight to their work.
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  // Keep the selected name fully visible in the (scrollable) chip strip.
  useEffect(() => {
    if (!employeeFilter) return;
    chipsRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [employeeFilter]);
  const pickEmployee = (name: string) => {
    setEmployeeFilter((cur) => (cur === name ? null : name));
    tilesRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const visibleJobs = useMemo(
    () =>
      employeeFilter
        ? jobs.filter((j) => (j.assignedTo?.trim() || UNASSIGNED) === employeeFilter)
        : jobs,
    [jobs, employeeFilter]
  );

  const jobsByDept = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of visibleJobs) {
      const list = map.get(j.departmentId) ?? [];
      list.push(j);
      map.set(j.departmentId, list);
    }
    for (const list of map.values()) sortJobs(list);
    return map;
  }, [visibleJobs]);

  const shownDepartments = employeeFilter
    ? departments.filter((d) => (jobsByDept.get(d.id)?.length ?? 0) > 0)
    : departments;

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
  const draggingRef = useRef(false);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  // No popup while a job is being dragged.
  useDndMonitor({
    onDragStart: () => {
      draggingRef.current = true;
      clearTimers();
      setPreview(null);
    },
    onDragEnd: () => {
      draggingRef.current = false;
    },
    onDragCancel: () => {
      draggingRef.current = false;
    },
  });

  const handleRowEnter = (job: Job, el: HTMLElement) => {
    // Touch screens have no hover — they tap to open the full viewer instead.
    if (window.matchMedia('(hover: none)').matches) return;
    if (draggingRef.current || !job.fileUrl) return;
    clearTimers();
    openTimer.current = setTimeout(() => {
      if (draggingRef.current) return;
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

  const hidePreview = () => {
    clearTimers();
    setPreview(null);
  };

  const gridStyle: React.CSSProperties = isWide
    ? {
        gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(shownDepartments.length / 2))}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${shownDepartments.length > 1 ? 2 : 1}, minmax(0, 1fr))`,
      }
    : {
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gridAutoRows: '320px',
      };

  const rowHandlers: RowHandlers = {
    onEnter: handleRowEnter,
    onLeave: scheduleClose,
    onOpen: (job) => {
      hidePreview();
      onOpenJob(job);
    },
    onAction: (fn, job) => {
      hidePreview();
      fn(job);
    },
    onToggleInProgress,
    onMarkDone,
    onMoveToAnyDept,
    onShip,
  };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Summary strip: totals + jobs per employee across the whole shop. */}
      <div ref={chipsRef} className="flex items-center gap-2 flex-shrink-0 overflow-x-auto pb-1">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex-shrink-0 shadow-lg shadow-primary/30">
          {totalJobs} jobs
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600/20 text-orange-300 border border-orange-600/40 text-xs font-bold flex-shrink-0">
          <Flame size={12} />
          {inProgressCount} in progress
        </div>
        <div className="w-px h-6 bg-border mx-1 flex-shrink-0" />
        <Users size={14} className="text-muted-foreground flex-shrink-0" />
        {employeeFilter && (
          <button
            type="button"
            onClick={() => setEmployeeFilter(null)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-primary/60 text-primary text-[11px] font-semibold flex-shrink-0 hover:bg-primary/10"
            title="Show everyone"
          >
            <X size={12} />
            All
          </button>
        )}
        {(employeeFilter
          ? [...employeeTotals].sort((a, b) => Number(b[0] === employeeFilter) - Number(a[0] === employeeFilter))
          : employeeTotals
        ).map(([name, n]) => {
          const selected = employeeFilter === name;
          return (
            <button
              type="button"
              key={name}
              onClick={() => pickEmployee(name)}
              aria-pressed={selected}
              title={selected ? 'Show everyone' : `Show only ${name}'s jobs`}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex-shrink-0 transition-colors ${
                selected
                  ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/30'
                  : name === UNASSIGNED
                  ? 'bg-muted/40 border-border text-muted-foreground italic hover:border-primary/60'
                  : 'bg-card border-border text-card-foreground hover:border-primary/60'
              }`}
            >
              {name}
              <span
                className={`px-1.5 rounded text-[10px] font-bold ${
                  selected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-primary'
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Department tiles */}
      <div ref={tilesRef} className="flex-1 min-h-0 overflow-auto">
        <div className={`grid gap-2 ${isWide ? 'h-full' : ''}`} style={gridStyle}>
          {shownDepartments.map((dept) => (
            <DeptTile
              key={dept.id}
              dept={dept}
              jobs={jobsByDept.get(dept.id) ?? []}
              options={getDeptOptions(dept)}
              previewJobId={preview?.job.id}
              highlight={highlightJobs}
              handlers={rowHandlers}
            />
          ))}
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

interface RowHandlers {
  onEnter: (job: Job, el: HTMLElement) => void;
  onLeave: () => void;
  onOpen: (job: Job) => void;
  onAction: (fn: (job: Job) => void, job: Job) => void;
  onToggleInProgress: (job: Job) => void;
  onMarkDone: (job: Job) => void;
  onMoveToAnyDept: (job: Job) => void;
  onShip: (job: Job) => void;
}

function DeptTile({
  dept,
  jobs,
  options,
  previewJobId,
  highlight,
  handlers,
}: {
  dept: Department;
  jobs: Job[];
  options: DeptOptions;
  previewJobId?: string;
  highlight?: boolean;
  handlers: RowHandlers;
}) {
  // Same droppable id as the Kanban column, so the page's drag handlers work
  // unchanged (drop on a tile = move to that department).
  const { setNodeRef, isOver } = useDroppable({ id: dept.id });

  const employeeList = useMemo(() => {
    const perEmployee = new Map<string, number>();
    for (const j of jobs) {
      const name = j.assignedTo?.trim() || UNASSIGNED;
      perEmployee.set(name, (perEmployee.get(name) ?? 0) + 1);
    }
    return [...perEmployee.entries()].sort((a, b) => b[1] - a[1]);
  }, [jobs]);
  const active = jobs.filter((j) => j.inProgress).length;

  return (
    <section
      ref={setNodeRef}
      className={`bg-muted/30 rounded-xl border-x border-b border-border/40 border-t-[3px] flex flex-col min-h-0 overflow-hidden transition-shadow ${
        isOver ? 'ring-2 ring-primary/60 bg-primary/10' : ''
      }`}
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
              jobs.length > 0
                ? 'bg-card text-card-foreground border-border'
                : 'bg-transparent text-muted-foreground/60 border-border/50'
            }`}
          >
            {jobs.length}
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
      <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-1.5 space-y-1">
          {jobs.length === 0 ? (
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center pt-4">
              {isOver ? 'Drop here' : 'No jobs'}
            </p>
          ) : (
            jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                options={options}
                active={previewJobId === job.id}
                highlight={highlight}
                handlers={handlers}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function JobRow({
  job,
  options,
  active,
  highlight,
  handlers,
}: {
  job: Job;
  options: DeptOptions;
  active: boolean;
  highlight?: boolean;
  handlers: RowHandlers;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    data: { type: 'job', job },
  });

  const pending = job.deviationStatus === 'pending';
  const rejected = job.deviationStatus === 'rejected';
  const inProgress = job.inProgress && !pending;
  // Paused: the clock isn't running but time was already worked in this
  // department (In Progress was started and then paused).
  const paused = !inProgress && !pending && (job.deptTimes?.[job.departmentId] ?? 0) > 0;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const act = (fn: (job: Job) => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    handlers.onAction(fn, job);
  };
  const iconBtn =
    'h-5 w-5 rounded flex items-center justify-center flex-shrink-0 transition-colors text-white';

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onMouseEnter={(e) => handlers.onEnter(job, e.currentTarget)}
      onMouseLeave={handlers.onLeave}
      onClick={() => handlers.onOpen(job)}
      className={`group/row relative w-full text-left rounded-md px-1.5 py-1 border flex items-center gap-1.5 transition-colors cursor-grab active:cursor-grabbing select-none ${
        active ? 'ring-1 ring-primary ' : ''
      }${isDragging ? 'opacity-40 ring-2 ring-primary ' : ''}${highlight ? 'search-flash ' : ''}${
        pending
          ? 'bg-red-950/60 border-red-700/60 hover:bg-red-900/60'
          : inProgress
          ? 'progress-flash'
          : rejected
          ? 'bg-zinc-800 border-zinc-600 opacity-80'
          : 'bg-card border-border/60 hover:border-primary/60 hover:bg-card/80'
      }`}
    >
      <span
        className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${priorityColors[job.priority] || priorityColors[3]}`}
        title={`P${job.priority}`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-card-foreground truncate">{jobLabel(job)}</span>
          <span className="text-[8px] font-bold text-muted-foreground flex-shrink-0">P{job.priority}</span>
          {pending && <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />}
          {inProgress && <Flame size={10} className="text-yellow-300 animate-pulse flex-shrink-0" />}
          {paused && (
            <span title="Paused" className="flex-shrink-0">
              <Pause size={10} className="text-sky-400" />
            </span>
          )}
        </span>
        <span className="block text-[9px] text-muted-foreground truncate">
          {[job.name || (job.jobNumber ? job.title : ''), job.assignedTo].filter(Boolean).join(' · ') || '—'}
        </span>
      </span>

      {!job.fileUrl && (
        <FileText size={10} className="text-muted-foreground/40 flex-shrink-0" aria-label="No PDF" />
      )}

      {/* Card actions — shown on hover (always visible on touch screens).
          Same rules as the Kanban card for each department. */}
      <span
        className="hidden group-hover/row:flex absolute right-1 top-1/2 -translate-y-1/2 items-center gap-0.5 p-0.5 rounded-md bg-card/95 shadow-lg border border-border/60 [@media(hover:none)]:flex [@media(hover:none)]:static [@media(hover:none)]:translate-y-0 [@media(hover:none)]:p-0 [@media(hover:none)]:border-0 [@media(hover:none)]:shadow-none [@media(hover:none)]:bg-transparent flex-shrink-0"
        onPointerDown={stop}
        onMouseEnter={handlers.onLeave}
        onMouseLeave={(e) => handlers.onEnter(job, e.currentTarget.parentElement as HTMLElement)}
      >
        {/* Progress | Pause | Complete. Progress starts (or resumes) the
            clock; Pause stops it and banks the time worked so far. */}
        {options.showProgress && !pending && (
          <>
            <button
              type="button"
              onClick={inProgress ? stop : act(handlers.onToggleInProgress)}
              disabled={inProgress}
              className={`${iconBtn} ${
                inProgress
                  ? 'bg-orange-600 cursor-default'
                  : 'bg-muted text-muted-foreground hover:bg-orange-600 hover:text-white'
              }`}
              title={inProgress ? 'In progress' : paused ? 'Resume' : 'Progress'}
            >
              <Play size={10} />
            </button>
            <button
              type="button"
              onClick={inProgress ? act(handlers.onToggleInProgress) : stop}
              disabled={!inProgress}
              className={`${iconBtn} ${
                inProgress
                  ? 'bg-sky-600 hover:bg-sky-500'
                  : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
              }`}
              title={inProgress ? 'Pause' : 'Pause (start Progress first)'}
            >
              <Pause size={10} />
            </button>
          </>
        )}
        {/* Complete only once the job is In Progress: a job that hasn't been
            started (or is paused) has to be started/resumed first. Areas
            without the Progress button can complete any time. */}
        {options.showComplete && !pending && (() => {
          const canComplete = !options.showProgress || inProgress;
          return (
            <button
              type="button"
              onClick={canComplete ? act(handlers.onMarkDone) : stop}
              disabled={!canComplete}
              className={`${iconBtn} ${
                canComplete
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
              }`}
              title={canComplete ? 'Complete' : 'Complete (start Progress first)'}
            >
              <Check size={11} />
            </button>
          );
        })()}
        {options.canMove && (
          <button
            type="button"
            onClick={act(handlers.onMoveToAnyDept)}
            className={`${iconBtn} bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400`}
            title="Move"
          >
            <ArrowRightLeft size={10} />
          </button>
        )}
        {options.isShipping && !pending && !rejected && (
          <button
            type="button"
            onClick={act(handlers.onShip)}
            className={`${iconBtn} bg-green-600 hover:bg-green-500`}
            title="Ship"
          >
            <Truck size={10} />
          </button>
        )}
      </span>
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
  const { isPdf, isImage } = fileKind(job);
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
        Click the job to open the full viewer · drag it to move or reorder
      </p>
    </div>
  );
}
