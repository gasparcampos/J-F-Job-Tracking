'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { LayoutGrid, List, Plus, Loader2, Wrench, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { Job, Department, Employee, CreateJobInput, UpdateJobInput, ExtraPart, CreateExtraPartInput } from '@/types';
import {
  KanbanColumn,
  JobFormModal,
  JobEditModal,
  HistoryModal,
  AssignModal,
  JobsTable,
  MoveToAnyDeptModal,
  AssistantPanel,
  ExtraPartsTable,
  ExtraPartFormModal,
} from '@/components/job-tracker';

// Dynamic import to avoid SSR issues with pdfjs-dist
const PdfViewerModal = dynamic(
  () => import('@/components/job-tracker/pdf-viewer-modal').then((mod) => mod.PdfViewerModal),
  { ssr: false }
);

// Columns hidden from the board for now. Nothing is deleted — the department
// and any jobs inside it stay saved in Firestore; just remove the name from
// this set to show the column again.
const HIDDEN_DEPARTMENT_NAMES = new Set(['ARTURO', 'CUT SAW (SEGUETA)']);
const visibleDepartments = (list: Department[]) =>
  list.filter((d) => !HIDDEN_DEPARTMENT_NAMES.has(d.name.trim().toUpperCase()));

// Columns that are just hand-off stages: their cards show ONLY the Move button
// (no Progress / no Complete). The operator only routes the job onward from here.
const MOVE_ONLY_DEPARTMENT_NAMES = new Set(['NEW MATERIAL', 'WOOD PALLET', 'BLUE PALLET']);

// Production columns that follow a strict flow: cards show ONLY Progress +
// Complete (no Move). The job advances through Complete, not manual moves.
const NO_MOVE_DEPARTMENT_NAMES = new Set([
  'NIGHT SHIFT',
  'CNC LATHE 1',
  'MANUAL LATHE',
  'LATHE DEBURR',
  'LATHE INSPECTION',
  'MILL',
  'MILL DEBURR',
  'FINAL INSPECTION',
]);

// When Complete is pressed in a given column, force the job into this target
// column (by name) instead of just the next one in order. Keeps the default
// destination correct even if columns are hidden or reordered.
const COMPLETE_TARGET_OVERRIDES: Record<string, string> = {
  'NIGHT SHIFT': 'BLUE PALLET',
  'CNC LATHE 1': 'LATHE DEBURR',
  'MANUAL LATHE': 'LATHE DEBURR',
  'LATHE DEBURR': 'LATHE INSPECTION',
};

// When Complete is pressed in these columns, pop up a small picker so the
// operator chooses between the listed target columns instead of a single
// default (e.g. Lathe Inspection → Mill or Karina).
const COMPLETE_CHOICE_OVERRIDES: Record<string, string[]> = {
  'LATHE INSPECTION': ['MILL', 'KARINA', 'STAMP'],
  'FINAL INSPECTION': ['KARINA', 'STAMP'],
};

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  // Sub-tab inside the Table view: live jobs vs. already-shipped jobs.
  const [tableTab, setTableTab] = useState<'active' | 'shipped' | 'deviations' | 'extra-parts'>('active');

  // Extra Parts inventory (leftover stocked pieces).
  const [extraParts, setExtraParts] = useState<ExtraPart[]>([]);
  // null = closed, {} = new entry, ExtraPart = editing.
  const [editingExtraPart, setEditingExtraPart] = useState<ExtraPart | Record<string, never> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingJob, setIsAddingJob] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [historyJob, setHistoryJob] = useState<Job | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [pdfJob, setPdfJob] = useState<Job | null>(null);

  // Assign modal state
  const [movingJob, setMovingJob] = useState<Job | null>(null);
  const [targetDepartment, setTargetDepartment] = useState<Department | null>(null);

  // Complete-with-choice state: when a column offers 2+ targets on Complete
  // (e.g. Lathe Inspection → Mill / Karina) we ask the operator which one first.
  const [choiceJob, setChoiceJob] = useState<Job | null>(null);
  const [choiceTargets, setChoiceTargets] = useState<Department[]>([]);
  const [choiceNotes, setChoiceNotes] = useState('');

  // Move to any department modal state
  const [moveToAnyJob, setMoveToAnyJob] = useState<Job | null>(null);
  const [shipJob, setShipJob] = useState<Job | null>(null);

  // Sensors for drag and drop.
  // Desktop (mouse): a tiny 3px move starts a drag — snappy.
  // Mobile (touch): require a 250ms press-and-hold before a drag starts, so a
  // quick horizontal swipe scrolls the board instead of accidentally grabbing
  // a card. Pairs with the mobile move-confirmation in handleDragEnd.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    })
  );

  // Search: case-insensitive substring match across every job field,
  // including the details hidden on each card (customer, line, qty, due date),
  // the notes block, and every note in the job's history (PDF annotations
  // and notes added when moving between stages).
  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return jobs;
    const deptName = (id: string) =>
      departments.find((d) => d.id === id)?.name ?? '';
    return jobs.filter((j) => {
      // All history notes joined so any annotation is searchable too.
      const historyNotes = (j.history ?? [])
        .map((h) => h.notes ?? '')
        .join(' ');
      const fields = [
        j.jobNumber,
        j.name,
        j.poNumber,
        j.dwgNumber,
        j.partNumber,
        j.title,
        j.customer,
        j.line,
        j.quantity,
        j.dueDate,
        j.assignedTo,
        j.notes,
        j.outService,
        j.deviation,
        historyNotes,
        // Column/department name, so e.g. "blue pallet" finds its jobs.
        deptName(j.departmentId),
      ];
      return fields.some((f) => (f ?? '').toLowerCase().includes(q));
    });
  }, [jobs, searchQuery, departments]);

  // The "shipped" stage is the final READY TO SHIP department. Jobs sitting
  // there are considered shipped and are split out of the active table into
  // the Enviados sub-tab automatically.
  const shippedDeptId = useMemo(
    () =>
      departments.find((d) => d.name.trim().toUpperCase() === 'READY TO SHIP')?.id ?? null,
    [departments]
  );

  // A job with a pending deviation is pulled out of the active/shipped lists
  // into its own Deviations list until it's accepted or rejected.
  const isPendingDeviation = (j: Job) => j.deviationStatus === 'pending';

  // A shipped (sent) job leaves the Kanban board and lives in the Enviados
  // (Shipped) list. Karina ships it from the READY TO SHIP column.
  const isShipped = (j: Job) => j.shipped === true;

  const deviationTableJobs = useMemo(
    () => filteredJobs.filter((j) => isPendingDeviation(j) && !isShipped(j)),
    [filteredJobs]
  );

  const activeTableJobs = useMemo(
    () =>
      filteredJobs.filter(
        (j) => !isShipped(j) && !isPendingDeviation(j)
      ),
    [filteredJobs]
  );

  const shippedTableJobs = useMemo(
    () => filteredJobs.filter((j) => isShipped(j)),
    [filteredJobs]
  );

  // Extra parts filter: matches the global search across all the identifying
  // text fields so the same search box works for jobs *and* extras.
  const filteredExtraParts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return extraParts;
    return extraParts.filter((p) =>
      [
        p.jobNumber,
        p.dwgNumber,
        p.partNumber,
        p.poNumber,
        p.company,
        p.name,
        p.place,
        p.heatNumber,
        p.employeeName,
        p.partNotes,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [extraParts, searchQuery]);

  // For Kanban: when searching, pull every column that has a match to the
  // front (far left) so the result is easy to spot without scrolling. A column
  // matches if it holds a matching job (e.g. a JOB#) or its own name matches.
  const displayDepartments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return departments;
    const matchDeptIds = new Set(
      filteredJobs.filter((j) => j.shipped !== true).map((j) => j.departmentId)
    );
    const isMatch = (d: Department) =>
      matchDeptIds.has(d.id) || d.name.toLowerCase().includes(q);
    const matches = departments.filter(isMatch);
    if (matches.length === 0) return departments;
    const rest = departments.filter((d) => !isMatch(d));
    return [...matches, ...rest];
  }, [departments, searchQuery, filteredJobs]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      await fetch('/api/seed');

      const [jobsRes, deptsRes, employeesRes, extraPartsRes] = await Promise.all([
        fetch('/api/jobs'),
        fetch('/api/departments'),
        fetch('/api/employees'),
        fetch('/api/extra-parts'),
      ]);

      const jobsData = await jobsRes.json();
      const deptsData = await deptsRes.json();
      const employeesData = await employeesRes.json();
      const extraPartsData = await extraPartsRes.json();

      setJobs(jobsData);
      setDepartments(visibleDepartments(deptsData));
      setEmployees(employeesData);
      setExtraParts(Array.isArray(extraPartsData) ? extraPartsData : []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Could not load data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Background refresh — keeps every user's screen in sync.
  // Since multiple people use the board at once, we re-pull jobs, departments,
  // employees and extra parts every 15 seconds. That way a change one person
  // saves (moving a job, editing, shipping, etc.) shows up on everyone else's
  // screen within 15s without them having to reload the page.
  //
  // Unlike the initial fetchData, this one skips the /api/seed call, shows no
  // loading spinner, and stays silent on a transient error (the next tick
  // retries) so the sync is invisible and never flashes the UI.
  const refreshData = useCallback(async () => {
    try {
      const [jobsRes, deptsRes, employeesRes, extraPartsRes] = await Promise.all([
        fetch('/api/jobs'),
        fetch('/api/departments'),
        fetch('/api/employees'),
        fetch('/api/extra-parts'),
      ]);

      const [jobsData, deptsData, employeesData, extraPartsData] = await Promise.all([
        jobsRes.json(),
        deptsRes.json(),
        employeesRes.json(),
        extraPartsRes.json(),
      ]);

      setJobs(jobsData);
      setDepartments(visibleDepartments(deptsData));
      setEmployees(employeesData);
      setExtraParts(Array.isArray(extraPartsData) ? extraPartsData : []);
    } catch (error) {
      // Silent: a dropped poll shouldn't spam toasts — the next tick retries.
      console.error('Error refreshing data:', error);
    }
  }, []);

  // Mirror the currently-dragged job into a ref so the polling loop can read it
  // without re-creating the interval on every drag.
  const activeJobRef = useRef<Job | null>(null);
  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      // Don't yank the board out from under someone mid-drag — a refresh while
      // they're moving a card would replace the job list and cancel the drag.
      // We skip this tick and pick the changes up on the next one.
      if (activeJobRef.current) return;
      refreshData();
    }, 15000);
    return () => clearInterval(intervalId);
  }, [refreshData]);

  // Deep link from a scanned Extra Part QR code (?extraPart=<id>): jump to the
  // Table view's Extra Parts tab and pop that record open in edit mode so it
  // can be pulled from inventory. Runs once the extra parts have loaded; the
  // URL param is then cleared so a refresh doesn't reopen it.
  useEffect(() => {
    if (isLoading || !extraParts.length) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('extraPart');
    if (!id) return;
    const part = extraParts.find((p) => p.id === id);
    if (part) {
      setViewMode('table');
      setTableTab('extra-parts');
      setEditingExtraPart(part);
    }
    // Strip the param so it doesn't retrigger on re-render/refresh.
    params.delete('extraPart');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [isLoading, extraParts]);

  // The dragged job's original department, captured at drag start (before
  // handleDragOver optimistically mutates state) so a cancelled move can be
  // reverted cleanly on mobile.
  const dragOriginRef = useRef<string | null>(null);

  // True on phone-sized screens (matches the `sm` breakpoint used elsewhere).
  const isMobile = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const job = jobs.find((j) => j.id === active.id);
    if (job) {
      dragOriginRef.current = job.departmentId;
      setActiveJob(job);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find the active job
    const activeJob = jobs.find((j) => j.id === activeId);
    if (!activeJob) return;

    // Check if we're over another job
    const overJob = jobs.find((j) => j.id === overId);
    
    if (overJob) {
      // We're hovering over another job
      if (activeJob.departmentId !== overJob.departmentId) {
        // Moving to a different department - update optimistically
        setJobs((prev) => {
          const updated = prev.map((j) =>
            j.id === activeId ? { ...j, departmentId: overJob.departmentId } : j
          );
          return updated;
        });
      }
    } else {
      // Check if we're over a department (column)
      const overDept = departments.find((d) => d.id === overId);
      if (overDept && activeJob.departmentId !== overDept.id) {
        // Moving to an empty column
        setJobs((prev) => {
          const updated = prev.map((j) =>
            j.id === activeId ? { ...j, departmentId: overDept.id } : j
          );
          return updated;
        });
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveJob(null);

    // The column the card actually started in (captured at drag start, before
    // handleDragOver optimistically moved it). This is the reliable source of
    // truth for whether the card really changed columns.
    const origin = dragOriginRef.current;

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find the active job
    const activeJob = jobs.find((j) => j.id === activeId);
    if (!activeJob) return;

    // Resolve the destination department: the column dropped on, or the
    // department of the job we dropped on top of.
    const overJob = jobs.find((j) => j.id === overId);
    const targetDept = overJob
      ? departments.find((d) => d.id === overJob.departmentId)
      : departments.find((d) => d.id === overId);
    if (!targetDept) return;

    // Cross-column move: persist it so it sticks. Previously this only updated
    // local state (or popped a modal), so the drag never reached the backend
    // and the 15s background refresh snapped the card back to its old column.
    if (origin && targetDept.id !== origin) {
      if (!confirmMobileMove(activeJob, targetDept)) return;
      void moveJobTo(activeJob, targetDept, activeJob.assignedTo ?? '', '');
      return;
    }

    // Same column: reorder and persist so the new position is saved (was
    // local-only before, so it snapped back on the next background refresh).
    // Sort the column the same way the board shows it (priority, then order) so
    // the drop index matches what the operator sees.
    if (overJob) {
      const sorted = jobs
        .filter((j) => j.departmentId === activeJob.departmentId)
        .sort(
          (a, b) =>
            (a.priority ?? 3) - (b.priority ?? 3) ||
            (a.order ?? 0) - (b.order ?? 0)
        );
      const oldIndex = sorted.findIndex((j) => j.id === activeId);
      const newIndex = sorted.findIndex((j) => j.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(sorted, oldIndex, newIndex).map((j, idx) => ({
        ...j,
        order: idx,
      }));

      // Optimistic local update, then persist to the backend.
      setJobs((prev) => prev.map((j) => reordered.find((r) => r.id === j.id) ?? j));
      void persistReorder(activeId, activeJob.departmentId, newIndex);
    }
  };

  // On mobile, ask before committing a cross-column move (easy to trigger by
  // accident). Returns false (and reverts the optimistic move back to the
  // job's original column) if the user declines. Desktop always returns true
  // since the AssignModal already serves as the confirmation there.
  const confirmMobileMove = (job: Job, targetDept: Department): boolean => {
    if (!isMobile()) return true;
    if (window.confirm(`¿Mover "${job.title}" a ${targetDept.name}?`)) return true;
    const origin = dragOriginRef.current;
    if (origin) {
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, departmentId: origin } : j))
      );
    }
    return false;
  };

  // Job actions
  // Returns true when the job was created, false otherwise (e.g. duplicate
  // JOB#). The form modal uses this to stay open on failure.
  const handleCreateJob = async (data: CreateJobInput): Promise<boolean> => {
    // Quick local check against jobs already loaded — instant feedback.
    const jobNumber = (data.jobNumber ?? '').trim();
    if (jobNumber) {
      const dup = jobs.find(
        (j) => (j.jobNumber ?? '').trim().toLowerCase() === jobNumber.toLowerCase()
      );
      if (dup) {
        toast({
          title: 'Duplicate JOB#',
          description: `JOB# ${jobNumber} already exists. Use a different work number.`,
          variant: 'destructive',
        });
        return false;
      }
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: res.status === 409 ? 'Duplicate JOB#' : 'Error',
          description: err.message || 'Could not create job',
          variant: 'destructive',
        });
        return false;
      }

      const newJob = await res.json();
      setJobs((prev) => [newJob, ...prev]);
      toast({
        title: 'Success',
        description: 'Job created successfully',
      });
      return true;
    } catch (error) {
      console.error('Error creating job:', error);
      toast({
        title: 'Error',
        description: 'Could not create job',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Edit an existing job (quantities, due date, etc.). Returns true on
  // success; false (e.g. duplicate JOB#) keeps the edit modal open.
  const handleUpdateJob = async (jobId: string, data: UpdateJobInput): Promise<boolean> => {
    // Block changing JOB# to one that another job already uses.
    const jobNumber = (data.jobNumber ?? '').trim();
    if (jobNumber) {
      const dup = jobs.find(
        (j) =>
          j.id !== jobId &&
          (j.jobNumber ?? '').trim().toLowerCase() === jobNumber.toLowerCase()
      );
      if (dup) {
        toast({
          title: 'Duplicate JOB#',
          description: `JOB# ${jobNumber} already exists. Use a different work number.`,
          variant: 'destructive',
        });
        return false;
      }
    }

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: res.status === 409 ? 'Duplicate JOB#' : 'Error',
          description: err.message || 'Could not update job',
          variant: 'destructive',
        });
        return false;
      }

      const updatedJob = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
      toast({
        title: 'Success',
        description: 'Job updated successfully',
      });
      return true;
    } catch (error) {
      console.error('Error updating job:', error);
      toast({
        title: 'Error',
        description: 'Could not update job',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Merge the legacy single attachment + the attachments array into one list.
  const mergeAttachments = (job: Job): Array<{ url: string; name: string }> => {
    const list = [...(job.attachments ?? [])];
    if (job.attachmentUrl) {
      list.unshift({ url: job.attachmentUrl, name: job.attachmentName || 'Attachment' });
    }
    return list;
  };

  // Persist a new attachments list, clearing the legacy single fields so we
  // keep a single source of truth.
  const saveAttachments = async (
    job: Job,
    attachments: Array<{ url: string; name: string }>
  ) => {
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachments, attachmentUrl: '', attachmentName: '' }),
    });
    const updated = await res.json();
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  };

  // Upload + attach a file to an existing job (from the table). Supports
  // multiple attachments per job (e.g. revisions).
  const handleAttachToJob = async (job: Job, file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const up = await upRes.json();
      if (!up.success) throw new Error('upload failed');

      await saveAttachments(job, [
        ...mergeAttachments(job),
        { url: up.fileUrl, name: up.fileName },
      ]);
      toast({ title: 'Success', description: 'Attachment added' });
    } catch (error) {
      console.error('Error attaching file:', error);
      toast({ title: 'Error', description: 'Could not attach file', variant: 'destructive' });
    }
  };

  // Remove one attachment from a job (e.g. an outdated revision).
  const handleRemoveAttachment = async (job: Job, url: string) => {
    try {
      await saveAttachments(
        job,
        mergeAttachments(job).filter((a) => a.url !== url)
      );
      toast({ title: 'Removed', description: 'Attachment removed' });
    } catch (error) {
      console.error('Error removing attachment:', error);
      toast({ title: 'Error', description: 'Could not remove attachment', variant: 'destructive' });
    }
  };

  // Core move: sends the job to `target`, assigning `employeeName` and logging
  // `notes` in the job history. Shared by the assign modal and the Complete
  // choice picker so every move is registered the same way.
  const moveJobTo = async (
    job: Job,
    target: Department,
    employeeName: string,
    notes: string
  ) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDeptId: target.id,
          employeeId: employees.find((e) => e.name === employeeName)?.id,
          notes,
        }),
      });
      const updatedJob = await res.json();

      setJobs((prev) =>
        prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
      );

      toast({
        title: 'Success',
        description: 'Job moved successfully',
      });
    } catch (error) {
      console.error('Error moving job:', error);
      toast({
        title: 'Error',
        description: 'Could not move job',
        variant: 'destructive',
      });
    }
  };

  const handleMoveJob = async (employeeName: string, notes: string) => {
    if (!movingJob || !targetDepartment) return;
    await moveJobTo(movingJob, targetDepartment, employeeName, notes);
    setMovingJob(null);
    setTargetDepartment(null);
  };

  // Persist a within-column reorder so the new position survives the periodic
  // background refresh (previously the reorder was local-only and snapped back).
  // The endpoint renumbers the column and returns the authoritative job list.
  const persistReorder = async (
    jobId: string,
    targetDeptId: string,
    newOrder: number
  ) => {
    try {
      const res = await fetch('/api/jobs/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, targetDeptId, newOrder }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.jobs)) setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Error saving job order:', error);
    }
  };

  const handleMarkDone = (job: Job) => {
    const currentDept = departments.find((d) => d.id === job.departmentId);
    const currentName = currentDept?.name.trim().toUpperCase();

    // Choice target (e.g. Lathe Inspection → Mill / Karina): ask which one.
    const choiceNames = currentName
      ? COMPLETE_CHOICE_OVERRIDES[currentName]
      : undefined;
    if (choiceNames) {
      const targets = choiceNames
        .map((n) => departments.find((d) => d.name.trim().toUpperCase() === n))
        .filter((d): d is Department => !!d && d.id !== job.departmentId);
      if (targets.length >= 2) {
        setChoiceJob(job);
        setChoiceTargets(targets);
        return;
      }
      if (targets.length === 1) {
        setMovingJob(job);
        setTargetDepartment(targets[0]);
        return;
      }
      // No targets found (e.g. columns hidden) — fall through to the default.
    }

    // Column-specific default target (e.g. Night Shift → Blue Pallet).
    const overrideName = currentName
      ? COMPLETE_TARGET_OVERRIDES[currentName]
      : undefined;
    if (overrideName) {
      const target = departments.find(
        (d) => d.name.trim().toUpperCase() === overrideName
      );
      if (target && target.id !== job.departmentId) {
        setMovingJob(job);
        setTargetDepartment(target);
        return;
      }
    }

    const currentIndex = departments.findIndex((d) => d.id === job.departmentId);
    if (currentIndex < departments.length - 1) {
      const nextDept = departments[currentIndex + 1];
      setMovingJob(job);
      setTargetDepartment(nextDept);
    } else {
      toast({
        title: 'Info',
        description: 'El trabajo ya está en la última etapa',
      });
    }
  };

  // Operator picked one of the Complete targets (e.g. Mill or Karina). Move the
  // job there right away, logging the notes typed in the picker and defaulting
  // the assignee to the target column's default employee.
  const handleChooseCompleteTarget = async (target: Department) => {
    if (choiceJob) {
      await moveJobTo(choiceJob, target, target.defaultEmployee ?? '', choiceNotes);
    }
    setChoiceJob(null);
    setChoiceTargets([]);
    setChoiceNotes('');
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast({
        title: 'Success',
        description: 'Job deleted',
      });
    } catch (error) {
      console.error('Error deleting job:', error);
      toast({
        title: 'Error',
        description: 'Could not delete job',
        variant: 'destructive',
      });
    }
  };

  const handleSaveExtraPart = async (data: CreateExtraPartInput, existingId?: string): Promise<boolean> => {
    try {
      const res = await fetch(existingId ? `/api/extra-parts/${existingId}` : '/api/extra-parts', {
        method: existingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: err.error || 'Could not save extra part', variant: 'destructive' });
        return false;
      }
      const saved: ExtraPart = await res.json();
      setExtraParts((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      toast({ title: 'Success', description: existingId ? 'Extra part updated' : 'Extra part saved' });
      return true;
    } catch (error) {
      console.error('Error saving extra part:', error);
      toast({ title: 'Error', description: 'Could not save extra part', variant: 'destructive' });
      return false;
    }
  };

  const handleDeleteExtraPart = async (part: ExtraPart) => {
    try {
      await fetch(`/api/extra-parts/${part.id}`, { method: 'DELETE' });
      setExtraParts((prev) => prev.filter((p) => p.id !== part.id));
      toast({ title: 'Deleted', description: 'Extra part removed' });
    } catch (error) {
      console.error('Error deleting extra part:', error);
      toast({ title: 'Error', description: 'Could not delete extra part', variant: 'destructive' });
    }
  };

  const handleEditDept = async (deptId: string) => {
    const dept = departments.find((d) => d.id === deptId);
    if (!dept) return;

    const newName = prompt('Nuevo nombre para la etapa:', dept.name);
    if (newName && newName !== dept.name) {
      try {
        const res = await fetch('/api/departments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: deptId, name: newName }),
        });
        const updated = await res.json();
        setDepartments((prev) =>
          prev.map((d) => (d.id === deptId ? updated : d))
        );
      } catch (error) {
        console.error('Error updating department:', error);
      }
    }
  };

  const handleSaveAnnotation = async (jobId: string, annotation: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation }),
      });
      const updatedJob = await res.json();
      setJobs((prev) =>
        prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
      );
      toast({
        title: 'Success',
        description: 'Nota guardada correctamente',
      });
    } catch (error) {
      console.error('Error saving annotation:', error);
      toast({
        title: 'Error',
        description: 'Could not save note',
        variant: 'destructive',
      });
    }
  };

  const handleToggleInProgress = async (job: Job) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/in-progress`, {
        method: 'POST',
      });
      const updatedJob = await res.json();
      setJobs((prev) =>
        prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
      );
      toast({
        title: updatedJob.inProgress ? 'En Progreso' : 'Detenido',
        description: updatedJob.inProgress 
          ? '🔥 Job marked in progress' 
          : '⏸️ Job stopped',
        className: updatedJob.inProgress ? 'bg-orange-600 text-white' : undefined,
      });
    } catch (error) {
      console.error('Error toggling in-progress:', error);
      toast({
        title: 'Error',
        description: 'Could not change status',
        variant: 'destructive',
      });
    }
  };

  // Change a job's priority from the card dropdown. Lower number = higher
  // priority; the column re-sorts so the card moves up/down accordingly.
  const handleChangePriority = async (job: Job, priority: number) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      });
      const updated = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    } catch (error) {
      console.error('Error changing priority:', error);
      toast({ title: 'Error', description: 'Could not change priority', variant: 'destructive' });
    }
  };

  // Bring a shipped job back onto the active board: clears the shipped flag so
  // it reappears in its (READY TO SHIP) column. Logged in history.
  const handleReturnToActive = async (job: Job) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipAction: 'return' }),
      });
      const updatedJob = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
      toast({
        title: 'Returned to Active',
        description: 'Job moved back from Shipped',
      });
    } catch (error) {
      console.error('Error returning job to active:', error);
      toast({
        title: 'Error',
        description: 'Could not return the job',
        variant: 'destructive',
      });
    }
  };

  // Generate and open the part's PDF time report: departments worked, hours
  // per department, total build time and the full movement history.
  const handleTimeReport = async (job: Job) => {
    try {
      const { generateTimeReportPdf } = await import('@/lib/time-report');
      const blob = await generateTimeReportPdf(job, departments);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        // Popup blocked — download the file instead.
        const a = document.createElement('a');
        a.href = url;
        a.download = `TimeReport_${(job.jobNumber || job.id).replace(/[^\w.-]+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Give the tab time to load the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error('Error generating time report:', error);
      toast({
        title: 'Error',
        description: 'Could not generate the time report PDF',
        variant: 'destructive',
      });
    }
  };

  // Rework a rejected-deviation part: the same piece is salvageable, so it
  // goes back to its normal state (stays in its current stage) to be fixed.
  const handleReworkDeviation = async (job: Job) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviationResolution: 'rework' }),
      });
      const updated = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      toast({ title: 'Sent to Rework', description: 'Job is back to normal to be reworked' });
    } catch (error) {
      console.error('Error reworking deviation:', error);
      toast({ title: 'Error', description: 'Could not send to rework', variant: 'destructive' });
    }
  };

  // Remake a rejected-deviation part: the piece is scrapped and started over
  // from scratch as new — progress cleared and sent back to the first stage.
  const handleRemakeDeviation = async (job: Job) => {
    const firstDeptId =
      departments.find((d) => d.id !== shippedDeptId)?.id || job.departmentId;
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviationResolution: 'remake', targetDeptId: firstDeptId }),
      });
      const updated = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      toast({ title: 'Remake from Scratch', description: 'Job restarted as new from the first stage' });
    } catch (error) {
      console.error('Error remaking deviation:', error);
      toast({ title: 'Error', description: 'Could not restart the job', variant: 'destructive' });
    }
  };

  // Ship confirm: sends the job to the Enviados (Shipped) list and off the
  // Kanban board, recording the processor (defaults to Karina). The target
  // area argument is ignored — shipping has a single destination.
  const handleShipConfirm = async (_targetDeptId: string, employeeName: string, notes: string) => {
    if (!shipJob) return;
    try {
      const res = await fetch(`/api/jobs/${shipJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipAction: 'ship',
          employeeId: employees.find((e) => e.name === employeeName)?.id,
          employeeName,
          notes: notes || undefined,
        }),
      });
      const updatedJob = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
      setShipJob(null);
      toast({ title: 'Shipped', description: 'Job sent to the Shipped list' });
    } catch (error) {
      console.error('Error shipping job:', error);
      toast({ title: 'Error', description: 'Could not ship the job', variant: 'destructive' });
    }
  };

  const handleMoveToAnyDept = async (targetDeptId: string, employeeName: string, notes: string, discardTime = false) => {
    if (!moveToAnyJob) return;

    try {
      const res = await fetch(`/api/jobs/${moveToAnyJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDeptId,
          employeeId: employees.find((e) => e.name === employeeName)?.id,
          notes,
          discardTime,
        }),
      });
      const updatedJob = await res.json();

      setJobs((prev) =>
        prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
      );

      setMoveToAnyJob(null);
      toast({
        title: 'Success',
        description: discardTime
          ? 'Job moved back — time in the previous area was reset'
          : 'Job moved to the selected area',
      });
    } catch (error) {
      console.error('Error moving job:', error);
      toast({
        title: 'Error',
        description: 'Could not move job',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Wrench className="w-8 h-8 text-primary animate-pulse" />
            </div>
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium">Loading system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      {/* Header */}
      <nav className="bg-card border-b border-border px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3 z-40 shadow-lg flex-shrink-0">
        {/* Left cluster: logo + view toggle + New Job */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/30">
              <Wrench size={22} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-card-foreground">
                Job Tracker
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                J&F MACHINE SHOP
              </p>
            </div>
          </div>

          <div className="bg-muted p-1 rounded-xl flex border border-border">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className={`rounded-lg gap-2 ${
                viewMode === 'kanban'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'text-muted-foreground hover:text-card-foreground'
              }`}
            >
              <LayoutGrid size={14} />
              Kanban
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className={`rounded-lg gap-2 ${
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'text-muted-foreground hover:text-card-foreground'
              }`}
            >
              <List size={14} />
              Tabla
            </Button>
          </div>

          <Button
            onClick={() => setIsAddingJob(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/30"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">New Job</span>
          </Button>

          {/* Search bar — sits right next to New Job. */}
          <div className="relative w-full sm:w-[24rem]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search JOB#, PO#, DWG#, Part#, name..."
              className="w-full h-10 pl-9 pr-9 rounded-xl bg-muted border border-border text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-card-foreground transition-colors"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-h-0 p-4 overflow-hidden">
        {viewMode === 'kanban' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 overflow-x-auto pb-4 h-full">
              {displayDepartments.map((dept) => {
                const deptJobs = filteredJobs
                  // Shipped jobs leave the board — they live in the Enviados list.
                  .filter((j) => j.departmentId === dept.id && !isShipped(j))
                  // Sort by priority (P1 at top), then manual order as tiebreaker.
                  .sort(
                    (a, b) =>
                      (a.priority ?? 3) - (b.priority ?? 3) ||
                      (a.order ?? 0) - (b.order ?? 0)
                  );
                
                const deptName = dept.name.trim().toUpperCase();
                const isMoveOnly = MOVE_ONLY_DEPARTMENT_NAMES.has(deptName);
                const isNoMove = NO_MOVE_DEPARTMENT_NAMES.has(deptName);

                return (
                  <KanbanColumn
                    key={dept.id}
                    department={dept}
                    jobs={deptJobs}
                    onEditDept={handleEditDept}
                    onMarkDone={handleMarkDone}
                    onViewHistory={setHistoryJob}
                    onDeleteJob={handleDeleteJob}
                    onViewPdf={setPdfJob}
                    onToggleInProgress={handleToggleInProgress}
                    onMoveToAnyDept={setMoveToAnyJob}
                    onChangePriority={handleChangePriority}
                    canMoveToAnyDept={!isNoMove}
                    showProgress={!isMoveOnly}
                    showComplete={!isMoveOnly}
                    highlightJobs={!!searchQuery.trim()}
                    onReworkDeviation={handleReworkDeviation}
                    onRemakeDeviation={handleRemakeDeviation}
                    onShip={dept.id === shippedDeptId ? setShipJob : undefined}
                    isShippingStage={dept.id === shippedDeptId}
                  />
                );
              })}
            </div>

            <DragOverlay>
              {activeJob && (
                <div className="bg-card rounded-xl p-4 shadow-2xl border-2 border-primary opacity-95 cursor-grabbing scale-105">
                  <p className="font-semibold text-sm text-card-foreground">
                    {activeJob.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Moving...
                  </p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="h-full flex flex-col gap-3 min-h-0">
            {/* Sub-tabs: live (Activos) vs. shipped (Enviados) jobs. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setTableTab('active')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  tableTab === 'active'
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30'
                    : 'bg-muted text-muted-foreground border-border hover:text-card-foreground'
                }`}
              >
                Active
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    tableTab === 'active' ? 'bg-primary-foreground/20' : 'bg-background'
                  }`}
                >
                  {activeTableJobs.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTableTab('shipped')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  tableTab === 'shipped'
                    ? 'bg-green-600 text-white border-green-600 shadow-lg shadow-green-600/30'
                    : 'bg-muted text-muted-foreground border-border hover:text-card-foreground'
                }`}
              >
                Shipped
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    tableTab === 'shipped' ? 'bg-white/20' : 'bg-background'
                  }`}
                >
                  {shippedTableJobs.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTableTab('deviations')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  tableTab === 'deviations'
                    ? 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-600/30'
                    : 'bg-muted text-muted-foreground border-border hover:text-card-foreground'
                }`}
              >
                Deviations
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    tableTab === 'deviations'
                      ? 'bg-white/20'
                      : deviationTableJobs.length > 0
                      ? 'bg-red-600 text-white'
                      : 'bg-background'
                  }`}
                >
                  {deviationTableJobs.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTableTab('extra-parts')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  tableTab === 'extra-parts'
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30'
                    : 'bg-muted text-muted-foreground border-border hover:text-card-foreground'
                }`}
              >
                Extra Parts
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    tableTab === 'extra-parts' ? 'bg-primary-foreground/20' : 'bg-background'
                  }`}
                >
                  {filteredExtraParts.length}
                </span>
              </button>

              {tableTab === 'extra-parts' && (
                <Button
                  onClick={() => setEditingExtraPart({})}
                  className="ml-auto bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/30"
                  size="sm"
                >
                  <Plus size={14} />
                  Add Extra Part
                </Button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {tableTab === 'extra-parts' ? (
                <ExtraPartsTable
                  parts={filteredExtraParts}
                  onEdit={(p) => setEditingExtraPart(p)}
                  onDelete={handleDeleteExtraPart}
                />
              ) : (
                <JobsTable
                  jobs={
                    tableTab === 'active'
                      ? activeTableJobs
                      : tableTab === 'shipped'
                      ? shippedTableJobs
                      : deviationTableJobs
                  }
                  departments={departments}
                  onViewHistory={setHistoryJob}
                  onDeleteJob={handleDeleteJob}
                  onViewPdf={setPdfJob}
                  onEditJob={setEditingJob}
                  onAttachFile={handleAttachToJob}
                  onRemoveAttachment={handleRemoveAttachment}
                  onReturnToActive={tableTab === 'shipped' ? handleReturnToActive : undefined}
                  onTimeReport={tableTab === 'shipped' ? handleTimeReport : undefined}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer (fixed at bottom) */}
      <footer className="bg-card border-t border-border px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0 z-40 shadow-[0_-2px_8px_rgba(0,0,0,0.15)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wrench size={14} className="text-primary" />
            <p className="text-xs font-medium">
              Job Tracker - J&F MACHINE SHOP
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] text-muted-foreground">
            <span>
              {searchQuery.trim()
                ? `${filteredJobs.length} of ${jobs.length} jobs`
                : `${jobs.length} jobs`}
            </span>
            <span>{departments.length} stages</span>
            <span>{employees.length} employees</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <JobFormModal
        isOpen={isAddingJob}
        onClose={() => setIsAddingJob(false)}
        onSubmit={handleCreateJob}
        departments={departments}
        employees={employees}
      />

      <JobEditModal
        job={editingJob}
        employees={employees}
        onSave={handleUpdateJob}
        onClose={() => setEditingJob(null)}
      />

      <HistoryModal
        job={historyJob}
        departments={departments}
        onClose={() => setHistoryJob(null)}
      />

      <AssignModal
        job={movingJob}
        targetDepartment={targetDepartment}
        employees={employees}
        onAssign={handleMoveJob}
        onCancel={() => {
          setMovingJob(null);
          setTargetDepartment(null);
        }}
      />

      {/* Complete-with-choice picker (e.g. Lathe Inspection → Mill / Karina).
          Picking a target hands off to the AssignModal to confirm + assign. */}
      {choiceJob && choiceTargets.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200">
            <div className="bg-primary px-6 py-5 flex justify-between items-center text-primary-foreground">
              <h3 className="font-bold text-sm">Where to next?</h3>
              <button
                onClick={() => {
                  setChoiceJob(null);
                  setChoiceTargets([]);
                  setChoiceNotes('');
                }}
                className="hover:bg-white/10 p-1.5 rounded-lg transition-colors text-lg leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-muted/50 p-3 rounded-xl border border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  Job
                </p>
                <p className="font-semibold text-card-foreground text-sm">
                  {choiceJob.title}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                  Process notes
                </p>
                <textarea
                  value={choiceNotes}
                  onChange={(e) => setChoiceNotes(e.target.value)}
                  placeholder="Add updates or instructions..."
                  className="w-full rounded-lg h-20 bg-background border border-border resize-none p-3 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Choose destination
              </p>
              <div className="flex flex-col gap-2">
                {choiceTargets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleChooseCompleteTarget(t)}
                    className="w-full flex items-center gap-3 px-4 h-12 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span
                      className="font-bold uppercase tracking-tight"
                      style={{ color: t.color }}
                    >
                      {t.name}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setChoiceJob(null);
                  setChoiceTargets([]);
                  setChoiceNotes('');
                }}
                className="w-full h-11 rounded-lg font-semibold uppercase tracking-wider border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <PdfViewerModal
        job={pdfJob}
        onClose={() => setPdfJob(null)}
        onSaveAnnotation={handleSaveAnnotation}
      />

      <MoveToAnyDeptModal
        job={moveToAnyJob}
        departments={departments}
        employees={employees}
        onMove={handleMoveToAnyDept}
        onCancel={() => setMoveToAnyJob(null)}
      />

      <MoveToAnyDeptModal
        job={shipJob}
        departments={departments}
        employees={employees}
        onMove={handleShipConfirm}
        onCancel={() => setShipJob(null)}
        defaultDeptId={shippedDeptId ?? undefined}
        defaultEmployee="Karina"
        shipMode
      />

      <ExtraPartFormModal
        part={editingExtraPart}
        jobs={jobs}
        employees={employees}
        onSave={handleSaveExtraPart}
        onClose={() => setEditingExtraPart(null)}
      />

      <AssistantPanel
        onJobMoved={(updated) =>
          setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))
        }
      />
    </div>
  );
}
