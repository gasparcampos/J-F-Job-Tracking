'use client';

import { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Clock, FileText, Trash2, Check, ZoomIn, File, Loader2, Play, Pause, Flame, ArrowRightLeft, FileImage } from 'lucide-react';
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
  canMoveToAnyDept?: boolean;
}

export function JobCard({ job, onMarkDone, onViewHistory, onDelete, onViewPdf, onToggleInProgress, onMoveToAnyDept, canMoveToAnyDept }: JobCardProps) {
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

  const isInProgress = job.inProgress;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-xl p-4 shadow-lg transition-all cursor-grab active:cursor-grabbing group relative overflow-hidden touch-none ${
        isInProgress
          ? 'bg-gradient-to-br from-orange-950 via-orange-900 to-amber-900 border-2 border-orange-500 shadow-orange-500/30 shadow-lg'
          : 'bg-card border border-border hover:border-primary/50'
      } ${isDragging ? 'opacity-40 shadow-2xl scale-105 border-primary ring-2 ring-primary/50 z-50' : ''}`}
    >
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
            isInProgress ? 'text-orange-100' : 'text-card-foreground'
          }`}>
            {job.title}
          </h4>
        </div>
        <Badge 
          className={`text-[10px] font-bold uppercase tracking-wider ${priorityColors[job.priority] || priorityColors[3]}`}
        >
          P{job.priority}
        </Badge>
      </div>

      {/* Job Details Grid - Extracted Fields */}
      {(job.jobNumber || job.customer || job.poNumber || job.partNumber || job.dueDate) && (
        <div className={`mb-3 ml-6 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] ${
          isInProgress ? 'text-orange-200/80' : 'text-muted-foreground'
        }`}>
          {job.jobNumber && (
            <div className="flex gap-1">
              <span className="font-semibold">JOB#:</span>
              <span>{job.jobNumber}</span>
            </div>
          )}
          {job.customer && (
            <div className="flex gap-1">
              <span className="font-semibold">Customer:</span>
              <span>{job.customer}</span>
            </div>
          )}
          {job.poNumber && (
            <div className="flex gap-1">
              <span className="font-semibold">PO#:</span>
              <span>{job.poNumber}</span>
            </div>
          )}
          {job.partNumber && (
            <div className="flex gap-1">
              <span className="font-semibold">Part#:</span>
              <span>{job.partNumber}</span>
            </div>
          )}
          {job.line && (
            <div className="flex gap-1">
              <span className="font-semibold">Line:</span>
              <span>{job.line}</span>
            </div>
          )}
          {job.dwgNumber && (
            <div className="flex gap-1">
              <span className="font-semibold">DWG#:</span>
              <span>{job.dwgNumber}</span>
            </div>
          )}
          {job.dueDate && (
            <div className="flex gap-1 col-span-2">
              <span className="font-semibold">Due Date:</span>
              <span className="text-orange-500 font-medium">{new Date(job.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          )}
        </div>
      )}

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
            maxHeightClass="max-h-[600px]"
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
            <span className="text-[9px] font-semibold uppercase tracking-widest">Notas</span>
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
          {job.assignedTo || 'Sin asignar'}
        </span>
        <button
          onClick={() => onViewHistory(job)}
          onPointerDown={(e) => e.stopPropagation()}
          className={`flex items-center gap-1 transition-colors ${
            isInProgress ? 'hover:text-orange-100' : 'hover:text-primary'
          }`}
        >
          <Clock size={12} />
          Historial
        </button>
      </div>

      {/* In Progress timestamp */}
      {isInProgress && job.inProgressAt && (
        <div className="flex items-center gap-2 mb-3 ml-6 text-[10px] text-orange-300">
          <Flame size={12} className="animate-pulse" />
          <span>En proceso desde: {new Date(job.inProgressAt).toLocaleString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short'
          })}</span>
        </div>
      )}

      {/* Action buttons - single compact row */}
      <div className="flex gap-1.5 items-stretch" onPointerDown={(e) => e.stopPropagation()}>
        {/* In Progress */}
        <Button
          onClick={() => onToggleInProgress?.(job)}
          className={`flex-1 h-8 px-2 rounded-lg font-bold uppercase tracking-wide text-[9px] transition-all ${
            isInProgress
              ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/30'
              : 'bg-muted hover:bg-orange-600 text-muted-foreground hover:text-white border border-border'
          }`}
        >
          {isInProgress ? (
            <><Pause size={12} className="mr-1" />Detener</>
          ) : (
            <><Play size={12} className="mr-1" />Progress</>
          )}
        </Button>

        {/* Completar */}
        <Button
          onClick={() => onMarkDone(job)}
          className="flex-1 h-8 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-wide shadow-lg shadow-emerald-900/20"
        >
          <Check size={12} className="mr-1" />
          Completar
        </Button>

        {/* Move to Any Department (right) */}
        {canMoveToAnyDept && (
          <Button
            onClick={() => onMoveToAnyDept?.(job)}
            className="flex-1 h-8 px-2 rounded-lg font-bold uppercase tracking-wide text-[9px] bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white shadow-lg shadow-orange-500/20"
          >
            <ArrowRightLeft size={12} className="mr-1" />
            Mover
          </Button>
        )}
      </div>
    </div>
  );
}
