'use client';

import { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Clock, FileText, Trash2, Check, ZoomIn, File, Loader2, Play, Flame, ArrowRightLeft, FileImage, Undo2, AlertTriangle, Ban, PauseCircle, Wrench, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Job } from '@/types';
import { FilePreview } from './file-preview';

interface JobCardProps {
  job: Job;
  onMarkDone: (job: Job) => void;
  onViewHistory: (job: Job) => void;
  onDelete: (jobId: string) => void;
  onViewPdf?: (job: Job) => void;
  onToggleInProgress?: (job: Job) => void;
  onMoveToAnyDept?: (job: Job) => void;
  onChangePriority?: (job: Job, priority: number) => void;
  canMoveToAnyDept?: boolean;
  highlight?: boolean;
  onReturnToActive?: (job: Job) => void;
  onReworkDeviation?: (job: Job) => void;
  onRemakeDeviation?: (job: Job) => void;
}

export function JobCard({ job, onMarkDone, onViewHistory, onDelete, onViewPdf, onToggleInProgress, onMoveToAnyDept, onChangePriority, canMoveToAnyDept, highlight, onReturnToActive, onReworkDeviation, onRemakeDeviation }: JobCardProps) {
  // Priority dropdown open state (click the P-badge to change priority).
  const [priorityOpen, setPriorityOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: job.id,
    data: {
      type: 'job',
      job,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Modern priority colors - solid
  const priorityColors: Record<number, string> = {
    1: 'bg-red-500 text-white',
    2: 'bg-orange-500 text-white',
    3: 'bg-amber-500 text-white',
    4: 'bg-blue-500 text-white',
    5: 'bg-emerald-500 text-white',
  };

  // Check file types from fileName (clean) — fileUrl may carry a
  // ?alt=media&token= query string (Firebase Storage) that breaks endsWith.
  const typeSource = (job.fileName || job.fileUrl?.split('?')[0] || '').toLowerCase();
  const isPdf = typeSource.endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource);

  // Deviation states. A PENDING deviation freezes the job: it's shown as a red
  // alert and treated as paused so nobody keeps working on it. ACCEPTED returns
  // the card to its normal look. REJECTED greys the card out ("REJECTED").
  const isPendingDeviation = job.deviationStatus === 'pending';
  const isRejectedDeviation = job.deviationStatus === 'rejected';

  // A paused (pending-deviation) card overrides the in-progress orange look.
  const isInProgress = job.inProgress && !isPendingDeviation;

  // Container theme — deviation states take priority over in-progress/normal.
  const containerTheme = isPendingDeviation
    ? 'bg-gradient-to-br from-red-950 via-red-900 to-rose-900 border-2 border-red-500 shadow-red-500/30 shadow-lg'
    : isRejectedDeviation
    ? 'bg-gradient-to-br from-zinc-800 via-zinc-800 to-zinc-900 border-2 border-zinc-600 shadow-zinc-900/40 opacity-90'
    : isInProgress
    ? 'bg-gradient-to-br from-orange-950 via-orange-900 to-amber-900 border-2 border-orange-500 shadow-orange-500/30 shadow-lg'
    : 'bg-card border border-border hover:border-primary/50';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-xl p-4 shadow-lg transition-all cursor-grab active:cursor-grabbing group relative overflow-hidden ${containerTheme} ${isDragging ? 'opacity-40 shadow-2xl scale-105 border-primary ring-2 ring-primary/50 z-50' : ''} ${
        highlight ? 'search-flash' : ''
      }`}
    >
      {/* Pending deviation — full-width red alert banner. The job is frozen
          (paused) until the deviation is approved or rejected. */}
      {isPendingDeviation && (
        <div className="-mx-4 -mt-4 mb-3 px-3 py-2 bg-red-600 text-white flex items-center gap-2 shadow-md">
          <AlertTriangle size={16} className="flex-shrink-0 animate-pulse" />
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Pending Deviation</span>
            <span className="text-[9px] font-semibold uppercase tracking-widest text-red-100/90 flex items-center gap-1">
              <PauseCircle size={10} /> Paused — do not work
            </span>
          </div>
        </div>
      )}

      {/* Rejected deviation — grey banner. */}
      {isRejectedDeviation && (
        <div className="-mx-4 -mt-4 mb-3 px-3 py-2 bg-zinc-600 text-white flex items-center gap-2 shadow-md">
          <Ban size={16} className="flex-shrink-0" />
          <span className="text-[11px] font-extrabold uppercase tracking-wider">Deviation Rejected</span>
        </div>
      )}

      {/* Deviation details text (pending or rejected). */}
      {(isPendingDeviation || isRejectedDeviation) && job.deviation && (
        <div className={`-mt-1 mb-3 p-2 rounded-lg text-[11px] leading-snug ${
          isPendingDeviation
            ? 'bg-red-950/60 border border-red-700/50 text-red-100'
            : 'bg-zinc-900/60 border border-zinc-700/60 text-zinc-200'
        }`}>
          {job.deviation}
        </div>
      )}

      {/* In Progress indicator */}
      {isInProgress && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 animate-pulse" />
      )}
      
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-2 flex-1">
          <span
            className={`mt-1 transition-colors ${
              isInProgress ? 'text-orange-300' : 'text-muted-foreground'
            }`}
            aria-hidden="true"
          >
            <GripVertical size={16} />
          </span>
          <h4 className={`font-semibold text-sm truncate pr-2 flex-1 leading-tight ${
            isPendingDeviation
              ? 'text-red-50'
              : isRejectedDeviation
              ? 'text-zinc-100'
              : isInProgress
              ? 'text-orange-100'
              : 'text-card-foreground'
          }`}>
            {job.title}
          </h4>
        </div>
        {/* Priority badge — click to change priority from a dropdown.
            Lower number = higher priority, moves the card up the column. */}
        {onChangePriority ? (
          <div className="relative flex-shrink-0" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPriorityOpen((o) => !o)}
              title="Change priority"
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full transition-transform hover:scale-105 ${priorityColors[job.priority] || priorityColors[3]}`}
            >
              P{job.priority}
            </button>
            {priorityOpen && (
              <>
                {/* Click-away backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setPriorityOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-1 flex flex-col gap-0.5">
                  {[1, 2, 3, 4, 5].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        if (p !== job.priority) onChangePriority(job, p);
                        setPriorityOpen(false);
                      }}
                      className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md text-left transition-all ${priorityColors[p]} ${
                        p === job.priority ? 'ring-2 ring-white/70' : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      P{p}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <Badge
            className={`text-[10px] font-bold uppercase tracking-wider ${priorityColors[job.priority] || priorityColors[3]}`}
          >
            P{job.priority}
          </Badge>
        )}
      </div>


      {job.description && (
        <p className={`text-xs mb-3 line-clamp-2 pl-6 ${
          isInProgress ? 'text-orange-200/70' : 'text-muted-foreground'
        }`}>
          {job.description}
        </p>
      )}

      {/* Document preview (renders inline, click to open full viewer) */}
      {job.fileUrl && (isPdf || isImage) && (
        <div className="mb-3" onPointerDown={(e) => e.stopPropagation()}>
          <FilePreview
            fileUrl={job.fileUrl}
            fileName={job.fileName}
            thumbnail
            maxHeightClass="max-h-[500px]"
            onClick={() => onViewPdf?.(job)}
          />
        </div>
      )}

      {job.notes && (
        <div className={`mb-3 p-2.5 rounded-lg border ${
          isInProgress 
            ? 'bg-orange-950/50 border-orange-700/50 text-orange-200' 
            : 'bg-muted/50 border-border text-muted-foreground'
        }`}>
          <div className="flex items-center gap-1.5 mb-1">
            <File size={10} />
            <span className="text-[9px] font-semibold uppercase tracking-widest">Notes</span>
          </div>
          <p className="text-[11px] line-clamp-2">
            {job.notes}
          </p>
        </div>
      )}

      <div className={`flex justify-between items-center text-[10px] mb-4 font-medium ml-6 ${
        isInProgress ? 'text-orange-200/60' : 'text-muted-foreground'
      }`}>
        <span className="truncate max-w-[120px]">
          {job.assignedTo || 'Unassigned'}
        </span>
        <button
          onClick={() => onViewHistory(job)}
          onPointerDown={(e) => e.stopPropagation()}
          className={`flex items-center gap-1 transition-colors ${
            isInProgress ? 'hover:text-orange-100' : 'hover:text-primary'
          }`}
        >
          <Clock size={12} />
          History
        </button>
      </div>

      {/* In Progress timestamp */}
      {isInProgress && job.inProgressAt && (
        <div className="flex items-center gap-2 mb-3 ml-6 text-[10px] text-orange-300">
          <Flame size={12} className="animate-pulse" />
          <span>In progress since: {new Date(job.inProgressAt).toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short'
          })}</span>
        </div>
      )}

      {/* Rejected-deviation decision row. Two ways out, both logged:
          REWORK = fix the same part (back to normal), REMAKE = scrap it and
          start over from scratch as new. */}
      {isRejectedDeviation && (onReworkDeviation || onRemakeDeviation) && (
        <div className="flex gap-1.5 items-stretch mb-2" onPointerDown={(e) => e.stopPropagation()}>
          {onReworkDeviation && (
            <Button
              onClick={() => onReworkDeviation(job)}
              className="flex-1 h-8 px-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wide shadow-lg shadow-amber-900/20"
              title="Rework this part — return to normal to be fixed"
            >
              <Wrench size={12} className="mr-1" />
              Rework
            </Button>
          )}
          {onRemakeDeviation && (
            <Button
              onClick={() => onRemakeDeviation(job)}
              className="flex-1 h-8 px-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wide shadow-lg shadow-blue-900/20"
              title="Scrap and remake from scratch — restart as new"
            >
              <RefreshCw size={12} className="mr-1" />
              Remake
            </Button>
          )}
        </div>
      )}

      {/* Action buttons - single compact row */}
      <div className="flex gap-1.5 items-stretch" onPointerDown={(e) => e.stopPropagation()}>
        {/* Pending deviation freezes the job: Progress/Complete are disabled so
            nobody keeps working. Only Move stays available (e.g. route to QC).
            Resolve the deviation from the job's edit screen. */}
        {isPendingDeviation ? (
          <div
            className="flex-1 h-8 px-2 rounded-lg font-bold uppercase tracking-wide text-[9px] flex items-center justify-center bg-red-900/60 text-red-100 border border-red-600/60 cursor-not-allowed select-none"
            title="Work is paused — deviation pending approval"
          >
            <PauseCircle size={12} className="mr-1" />
            Paused
          </div>
        ) : isInProgress ? (
          <div
            className="flex-1 h-8 px-2 rounded-lg font-bold uppercase tracking-wide text-[9px] flex items-center justify-center bg-orange-600 text-white shadow-lg shadow-orange-500/30 cursor-default select-none"
            title="In progress — completing the job will stop it"
          >
            <Flame size={12} className="mr-1 animate-pulse" />
            In Progress
          </div>
        ) : (
          <Button
            onClick={() => onToggleInProgress?.(job)}
            className="flex-1 h-8 px-2 rounded-lg font-bold uppercase tracking-wide text-[9px] transition-all bg-muted hover:bg-orange-600 text-muted-foreground hover:text-white border border-border"
          >
            <Play size={12} className="mr-1" />Progress
          </Button>
        )}

        {/* Complete or Return to Active */}
        {isPendingDeviation ? (
          <div
            className="flex-1 h-8 px-2 rounded-lg font-bold uppercase tracking-wide text-[9px] flex items-center justify-center bg-red-900/40 text-red-200/60 border border-red-700/40 cursor-not-allowed select-none"
            title="Resolve the deviation before completing"
          >
            <Ban size={12} className="mr-1" />
            Locked
          </div>
        ) : onReturnToActive ? (
          <Button
            onClick={() => onReturnToActive(job)}
            className="flex-1 h-8 px-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wide shadow-lg shadow-blue-900/20"
            title="Return to Active"
          >
            <Undo2 size={12} className="mr-1" />
            Return
          </Button>
        ) : (
          <Button
            onClick={() => onMarkDone(job)}
            className="flex-1 h-8 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wide shadow-lg shadow-emerald-900/20"
          >
            <Check size={12} className="mr-1" />
            Complete
          </Button>
        )}

        {/* Move to Any Department (right) */}
        {canMoveToAnyDept && (
          <Button
            onClick={() => onMoveToAnyDept?.(job)}
            className="flex-1 h-8 px-2 rounded-lg font-bold uppercase tracking-wide text-[9px] bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white shadow-lg shadow-orange-500/20"
          >
            <ArrowRightLeft size={12} className="mr-1" />
            Move
          </Button>
        )}
      </div>
    </div>
  );
}
