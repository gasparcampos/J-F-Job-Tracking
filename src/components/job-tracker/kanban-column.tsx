'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Pencil, FileText, GripVertical } from 'lucide-react';
import type { Job, Department } from '@/types';
import { JobCard } from './job-card';

interface KanbanColumnProps {
  department: Department;
  jobs: Job[];
  onEditDept: (deptId: string) => void;
  onMarkDone: (job: Job) => void;
  onViewHistory: (job: Job) => void;
  onDeleteJob: (jobId: string) => void;
  onViewPdf?: (job: Job) => void;
  onToggleInProgress?: (job: Job) => void;
  onMoveToAnyDept?: (job: Job) => void;
  canMoveToAnyDept?: boolean;
}

export function KanbanColumn({
  department,
  jobs,
  onEditDept,
  onMarkDone,
  onViewHistory,
  onDeleteJob,
  onViewPdf,
  onToggleInProgress,
  onMoveToAnyDept,
  canMoveToAnyDept,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: department.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`bg-muted/30 rounded-xl p-3 flex flex-col min-w-[420px] max-w-[420px] h-full border-x border-b border-border/40 border-t-[4px] transition-all duration-300 backdrop-blur-sm ${
        isOver ? 'bg-primary/10 shadow-lg shadow-primary/20 ring-2 ring-primary/50' : ''
      }`}
      style={{ borderTopColor: department.color }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={() => onEditDept(department.id)}
          className="flex items-center gap-1.5 bg-card/80 hover:bg-card px-2 py-1.5 rounded-lg transition-all group border border-border/50"
        >
          <div 
            className="w-2 h-2 rounded-full flex-shrink-0" 
            style={{ backgroundColor: department.color }}
          />
          <h3 className="font-bold text-card-foreground text-[10px] uppercase tracking-wider truncate max-w-[140px]">
            {department.name}
          </h3>
          <Pencil size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </button>
        <span className="bg-card px-2 py-1 rounded-lg text-[9px] font-bold text-muted-foreground border border-border shadow-sm flex-shrink-0">
          {jobs.length}
        </span>
      </div>

      {/* Jobs List with SortableContext */}
      <SortableContext
        items={jobs.map((j) => j.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onMarkDone={onMarkDone}
              onViewHistory={onViewHistory}
              onDelete={onDeleteJob}
              onViewPdf={onViewPdf}
              onToggleInProgress={onToggleInProgress}
              onMoveToAnyDept={onMoveToAnyDept}
              canMoveToAnyDept={canMoveToAnyDept}
            />
          ))}

          {jobs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 opacity-40 border-2 border-dashed border-border rounded-xl">
              <FileText size={28} className="text-muted-foreground mb-2" />
              <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                No jobs
              </p>
              <p className="text-[9px] text-muted-foreground mt-1">
                Drag here to add
              </p>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Drop indicator */}
      {isOver && jobs.length > 0 && (
        <div className="mt-2 border-2 border-dashed border-primary/50 rounded-xl p-3 bg-primary/5">
          <p className="text-[10px] text-primary text-center font-medium">
            Drop here
          </p>
        </div>
      )}
    </div>
  );
}
