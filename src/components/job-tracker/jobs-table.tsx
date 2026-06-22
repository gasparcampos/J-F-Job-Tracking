'use client';

import { useState } from 'react';
import { FileText, Clock, Trash2, Eye, Pencil, Paperclip, Loader2, X, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Job, Department } from '@/types';

interface JobsTableProps {
  jobs: Job[];
  departments: Department[];
  onViewHistory: (job: Job) => void;
  onDeleteJob: (jobId: string) => void;
  onViewPdf?: (job: Job) => void;
  onEditJob?: (job: Job) => void;
  onAttachFile?: (job: Job, file: File) => Promise<void> | void;
  onRemoveAttachment?: (job: Job, url: string) => Promise<void> | void;
  // When provided (Shipped tab), shows a button to move the job back to the
  // active list in case it was shipped by mistake.
  onReturnToActive?: (job: Job) => Promise<void> | void;
}

export function JobsTable({
  jobs,
  departments,
  onViewHistory,
  onDeleteJob,
  onViewPdf,
  onEditJob,
  onAttachFile,
  onRemoveAttachment,
  onReturnToActive,
}: JobsTableProps) {
  // Which row is currently uploading an attachment (shows a spinner).
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const handleAttachChange = async (job: Job, file: File | undefined) => {
    if (!file || !onAttachFile) return;
    setUploadingId(job.id);
    try {
      await onAttachFile(job, file);
    } finally {
      setUploadingId(null);
    }
  };

  // Merge the legacy single attachment + the attachments array into one list.
  const getAttachments = (job: Job): Array<{ url: string; name: string }> => {
    const list = [...(job.attachments ?? [])];
    if (job.attachmentUrl) {
      list.unshift({ url: job.attachmentUrl, name: job.attachmentName || 'Attachment' });
    }
    return list;
  };

  const handleRemove = (job: Job, url: string, name: string) => {
    if (!onRemoveAttachment) return;
    if (window.confirm(`Remove attachment "${name}"?`)) {
      onRemoveAttachment(job, url);
    }
  };

  // Days until the due date (negative = overdue). No date -> +Infinity so
  // those rows sort to the bottom.
  const daysUntil = (dueDate?: string): number => {
    if (!dueDate) return Infinity;
    const m = String(dueDate).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return Infinity;
    const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / 86400000);
  };

  // Sort by urgency: overdue (red) first, then due-soon (yellow), then
  // far-out (green), then jobs without a due date.
  const sortedJobs = [...jobs].sort(
    (a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate)
  );

  // Due-date urgency color:
  //   red    = overdue (1+ days past due)
  //   yellow = due within 1-20 days (incl. today)
  //   green  = more than 20 days out
  const getDueInfo = (dueDate?: string) => {
    if (!dueDate) return null;
    const days = daysUntil(dueDate);
    const m = String(dueDate).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    let className: string;
    if (days < 0) className = 'bg-red-500 text-white';
    else if (days <= 20) className = 'bg-yellow-400 text-black';
    else className = 'bg-green-500 text-white';
    const label =
      days < 0
        ? `${Math.abs(days)}d overdue`
        : days === 0
        ? 'Due today'
        : `${days}d left`;
    return { className, label, dateStr: `${m[2]}/${m[3]}/${m[1]}` };
  };

  return (
    <div className="w-full bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest w-[32%]">
              Job
            </TableHead>
            <TableHead className="px-3 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest w-[12%]">
              Status
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest w-[38%]">
              Notes
            </TableHead>
            <TableHead className="px-3 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-right w-[8%]">
              File
            </TableHead>
            <TableHead className="px-3 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-right w-[7%]">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedJobs.map((job) => (
            <TableRow key={job.id} className="hover:bg-muted/30 border-b border-border transition-colors">
              <TableCell className="px-6 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onViewPdf?.(job)}
                    disabled={!job.fileUrl}
                    title={job.fileUrl ? 'View PDF' : 'No PDF attached'}
                    className="bg-primary/10 p-2.5 rounded-lg flex-shrink-0 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Eye size={16} className="text-primary" />
                  </button>
                  <div className="flex-1 min-w-0 max-w-[460px]">
                    {(job.customer || job.dwgNumber || job.partNumber) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mb-0.5">
                        {job.customer && (
                          <span><span className="font-semibold text-card-foreground/70">Company:</span> {job.customer}</span>
                        )}
                        {job.dwgNumber && (
                          <span><span className="font-semibold text-card-foreground/70">DWG#:</span> {job.dwgNumber}</span>
                        )}
                        {job.partNumber && (
                          <span><span className="font-semibold text-card-foreground/70">Part#:</span> {job.partNumber}</span>
                        )}
                      </div>
                    )}
                    {/* Title + due badge on the same line so the row stays
                        thin (important with 40-50 records). */}
                    <div className="flex items-center gap-3 min-w-0">
                      <p className="font-semibold text-sm text-card-foreground">{job.title}</p>
                      {(() => {
                        const di = getDueInfo(job.dueDate);
                        if (!di) return null;
                        return (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ml-auto flex-shrink-0 ${di.className}`}>
                            Due {di.dateStr} · {di.label}
                          </span>
                        );
                      })()}
                    </div>
                    {job.description && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 max-w-[440px]">
                        {job.description}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-3 py-4">
                <Badge
                  className="text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg whitespace-normal text-left leading-tight"
                  style={{
                    backgroundColor: departments.find((d) => d.id === job.departmentId)?.color,
                  }}
                >
                  {departments.find((d) => d.id === job.departmentId)?.name}
                </Badge>
              </TableCell>
              <TableCell className="px-6 py-3">
                <div className="min-w-[380px] flex items-center gap-2">
                  <span className="text-xs text-muted-foreground truncate">
                    {job.notes || '—'}
                  </span>
                  {job.outService && (
                    <span className="inline-flex items-center gap-1 flex-shrink-0">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-400/15 border border-amber-400/30 rounded-md px-1.5 py-0.5">
                        Out Service
                      </span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        {job.outService}
                      </span>
                    </span>
                  )}
                  {job.deviationStatus === 'pending' && (
                    <span className="inline-flex items-center gap-1 flex-shrink-0">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-red-600 rounded-md px-1.5 py-0.5">
                        Deviation
                      </span>
                      {job.deviation && (
                        <span className="text-[11px] text-red-600 dark:text-red-400 whitespace-nowrap">
                          {job.deviation}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="px-3 py-4 align-middle">
                <div className="flex flex-row flex-nowrap items-center justify-end gap-x-1.5">
                  {job.fileUrl && (
                    <button
                      type="button"
                      onClick={() => onViewPdf?.(job)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:bg-primary/10 rounded-md px-2 py-1 transition-colors"
                    >
                      <Eye size={13} />
                      View
                    </button>
                  )}
                  {/* Each extra attachment: open it, or remove it (revisions). */}
                  {getAttachments(job).map((att) => (
                    <div key={att.url} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => window.open(att.url, '_blank', 'noopener')}
                        title={att.name}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 rounded-md px-2 py-1 max-w-[120px] transition-colors"
                      >
                        <Paperclip size={13} className="flex-shrink-0" />
                        <span className="truncate">{att.name}</span>
                      </button>
                      {onRemoveAttachment && (
                        <button
                          type="button"
                          onClick={() => handleRemove(job, att.url, att.name)}
                          title="Remove attachment"
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md p-1 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!job.fileUrl && getAttachments(job).length === 0 && (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {onAttachFile && (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingId === job.id}
                        onChange={(e) => {
                          handleAttachChange(job, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md px-2 py-1 transition-colors">
                        {uploadingId === job.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Paperclip size={14} />
                        )}
                        {uploadingId === job.id ? 'Uploading…' : 'Attach'}
                      </span>
                    </label>
                  )}
                </div>
              </TableCell>
              <TableCell className="px-3 py-4">
                <div className="flex items-center justify-end gap-1">
                  {/* Return to Active: only on the Shipped tab, undoes a job
                      that was shipped by mistake. */}
                  {onReturnToActive && (
                    <button
                      type="button"
                      onClick={() => onReturnToActive(job)}
                      title="Return to Active"
                      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary hover:text-primary-foreground hover:bg-primary border border-primary/40 rounded-md px-2 py-1 mr-1 transition-colors"
                    >
                      <Undo2 size={12} />
                      Return
                    </button>
                  )}
                  {/* DEV badge: shows a job carries a deviation and its outcome.
                      Green = approved, gray = rejected. Click opens the job. */}
                  {(job.deviationStatus === 'accepted' || job.deviationStatus === 'rejected') && (
                    <button
                      type="button"
                      onClick={() => onEditJob?.(job)}
                      title={`Deviation ${job.deviationStatus === 'accepted' ? 'approved' : 'rejected'}${job.deviation ? `: ${job.deviation}` : ''}`}
                      className={`text-[9px] font-bold uppercase tracking-wider text-white rounded-md px-1.5 py-1 mr-1 transition-colors ${
                        job.deviationStatus === 'accepted'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-zinc-600 hover:bg-zinc-700'
                      }`}
                    >
                      DEV
                    </button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEditJob?.(job)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                    title="Edit job"
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onViewHistory(job)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                    title="History"
                  >
                    <Clock size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(`Delete job "${job.title}"? This cannot be undone.`)) {
                        onDeleteJob(job.id);
                      }
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    title="Delete job"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {jobs.length === 0 && (
        <div className="p-20 text-center">
          <FileText size={48} className="mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="font-semibold uppercase text-[11px] tracking-widest text-muted-foreground">
            No jobs
          </p>
        </div>
      )}
    </div>
  );
}
