'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
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
import { LayoutGrid, List, Plus, Trash2, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { Job, Department, Employee, CreateJobInput } from '@/types';
import {
  KanbanColumn,
  JobFormModal,
  HistoryModal,
  AssignModal,
  JobsTable,
  MoveToAnyDeptModal,
} from '@/components/job-tracker';

// Dynamic import to avoid SSR issues with pdfjs-dist
const PdfViewerModal = dynamic(
  () => import('@/components/job-tracker/pdf-viewer-modal').then((mod) => mod.PdfViewerModal),
  { ssr: false }
);

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingJob, setIsAddingJob] = useState(false);
  const [historyJob, setHistoryJob] = useState<Job | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [pdfJob, setPdfJob] = useState<Job | null>(null);

  // Assign modal state
  const [movingJob, setMovingJob] = useState<Job | null>(null);
  const [targetDepartment, setTargetDepartment] = useState<Department | null>(null);

  // Move to any department modal state
  const [moveToAnyJob, setMoveToAnyJob] = useState<Job | null>(null);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      await fetch('/api/seed');

      const [jobsRes, deptsRes, employeesRes] = await Promise.all([
        fetch('/api/jobs'),
        fetch('/api/departments'),
        fetch('/api/employees'),
      ]);

      const jobsData = await jobsRes.json();
      const deptsData = await deptsRes.json();
      const employeesData = await employeesRes.json();

      setJobs(jobsData);
      setDepartments(deptsData);
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const job = jobs.find((j) => j.id === active.id);
    if (job) {
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

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find the active job
    const activeJob = jobs.find((j) => j.id === activeId);
    if (!activeJob) return;

    // Check if dropped over another job
    const overJob = jobs.find((j) => j.id === overId);
    
    if (overJob) {
      // Reordering within same column or different column
      if (activeJob.departmentId === overJob.departmentId) {
        // Same column - just reorder locally
        setJobs((prev) => {
          const deptJobs = prev.filter((j) => j.departmentId === activeJob.departmentId);
          const otherJobs = prev.filter((j) => j.departmentId !== activeJob.departmentId);
          
          const oldIndex = deptJobs.findIndex((j) => j.id === activeId);
          const newIndex = deptJobs.findIndex((j) => j.id === overId);
          
          const reorderedJobs = arrayMove(deptJobs, oldIndex, newIndex).map((j, idx) => ({
            ...j,
            order: idx,
          }));
          
          return [...otherJobs, ...reorderedJobs];
        });
      } else {
        // Different column - show assign modal
        const targetDept = departments.find((d) => d.id === overJob.departmentId);
        if (targetDept) {
          setMovingJob(activeJob);
          setTargetDepartment(targetDept);
        }
      }
    } else {
      // Check if dropped over a department column
      const targetDept = departments.find((d) => d.id === overId);
      
      if (targetDept && activeJob.departmentId !== targetDept.id) {
        // Moving to different department - show modal
        setMovingJob(activeJob);
        setTargetDepartment(targetDept);
      }
    }
  };

  // Job actions
  const handleCreateJob = async (data: CreateJobInput) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const newJob = await res.json();
      setJobs((prev) => [newJob, ...prev]);
      toast({
        title: 'Éxito',
        description: 'Trabajo creado correctamente',
      });
    } catch (error) {
      console.error('Error creating job:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el trabajo',
        variant: 'destructive',
      });
    }
  };

  const handleMoveJob = async (employeeName: string, notes: string) => {
    if (!movingJob || !targetDepartment) return;

    try {
      const res = await fetch(`/api/jobs/${movingJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDeptId: targetDepartment.id,
          employeeId: employees.find((e) => e.name === employeeName)?.id,
          notes,
        }),
      });
      const updatedJob = await res.json();

      setJobs((prev) =>
        prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
      );

      setMovingJob(null);
      setTargetDepartment(null);
      toast({
        title: 'Éxito',
        description: 'Trabajo movido correctamente',
      });
    } catch (error) {
      console.error('Error moving job:', error);
      toast({
        title: 'Error',
        description: 'No se pudo mover el trabajo',
        variant: 'destructive',
      });
    }
  };

  const handleMarkDone = (job: Job) => {
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

  const handleDeleteJob = async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast({
        title: 'Éxito',
        description: 'Trabajo eliminado',
      });
    } catch (error) {
      console.error('Error deleting job:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el trabajo',
        variant: 'destructive',
      });
    }
  };

  const handleClearAll = async () => {
    if (!confirm('¿Eliminar todos los trabajos?')) return;

    try {
      await fetch('/api/jobs', { method: 'DELETE' });
      setJobs([]);
      toast({
        title: 'Éxito',
        description: 'Todos los trabajos eliminados',
      });
    } catch (error) {
      console.error('Error clearing jobs:', error);
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
        title: 'Éxito',
        description: 'Nota guardada correctamente',
      });
    } catch (error) {
      console.error('Error saving annotation:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la nota',
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
          ? '🔥 Trabajo marcado como en progreso' 
          : '⏸️ Trabajo detenido',
        className: updatedJob.inProgress ? 'bg-orange-600 text-white' : undefined,
      });
    } catch (error) {
      console.error('Error toggling in-progress:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleMoveToAnyDept = async (targetDeptId: string, employeeName: string, notes: string) => {
    if (!moveToAnyJob) return;

    try {
      const res = await fetch(`/api/jobs/${moveToAnyJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDeptId,
          employeeId: employees.find((e) => e.name === employeeName)?.id,
          notes,
        }),
      });
      const updatedJob = await res.json();

      setJobs((prev) =>
        prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
      );

      setMoveToAnyJob(null);
      toast({
        title: 'Éxito',
        description: 'Trabajo movido al área seleccionada',
      });
    } catch (error) {
      console.error('Error moving job:', error);
      toast({
        title: 'Error',
        description: 'No se pudo mover el trabajo',
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
          <p className="text-muted-foreground font-medium">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <nav className="bg-card border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/30">
                <Wrench size={22} className="text-primary-foreground" />
              </div>
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

          <div className="flex items-center gap-3 ml-8">
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
              New Job
            </Button>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleClearAll}
          className="border-destructive/50 text-destructive hover:bg-destructive hover:text-white hover:border-destructive"
        >
          <Trash2 size={18} />
        </Button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-hidden">
        {viewMode === 'kanban' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 overflow-x-auto pb-4 h-full">
              {departments.map((dept) => {
                const deptJobs = jobs
                  .filter((j) => j.departmentId === dept.id)
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                
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
                    canMoveToAnyDept={true}
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
                    Moviendo...
                  </p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          <JobsTable
            jobs={jobs}
            departments={departments}
            onViewHistory={setHistoryJob}
            onDeleteJob={handleDeleteJob}
            onViewPdf={setPdfJob}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wrench size={14} className="text-primary" />
            <p className="text-xs font-medium">
              Job Tracker - J&F MACHINE SHOP
            </p>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>{jobs.length} trabajos</span>
            <span>{departments.length} etapas</span>
            <span>{employees.length} empleados</span>
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
    </div>
  );
}
