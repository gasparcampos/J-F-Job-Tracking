'use client';

import { FileText, Clock, Trash2, Eye, Pencil, Paperclip } from 'lucide-react';
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
}

export function JobsTable({
  jobs,
  departments,
  onViewHistory,
  onDeleteJob,
  onViewPdf,
  onEditJob,
}: JobsTableProps) {
  // Modern priority colors - solid
  const priorityColors: Record<number, string> = {
    1: 'bg-red-500 text-white',
    2: 'bg-orange-500 text-white',
    3: 'bg-amber-500 text-white',
    4: 'bg-blue-500 text-white',
    5: 'bg-emerald-500 text-white',
  };

  // Due-date urgency color:
  //   red    = overdue (1+ days past due)
  //   yellow = due within 1-20 days (incl. today)
  //   orange = more than 20 days out
  const getDueInfo = (dueDate?: string) => {
    if (!dueDate) return null;
    const m = String(dueDate).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    let className: string;
    if (days < 0) className = 'bg-red-500 text-white';
    else if (days <= 20) className = 'bg-yellow-400 text-black';
    else className = 'bg-orange-500 text-white';
    const label =
      days < 0
        ? `${Math.abs(days)}d overdue`
        : days === 0
        ? 'Due today'
        : `${days}d left`;
    return { className, label, dateStr: `${m[2]}/${m[3]}/${m[1]}` };
  };

  return (
    <div className="bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Job
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Priority
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Status
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Assigned
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Notes
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              File
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id} className="hover:bg-muted/30 border-b border-border transition-colors">
              <TableCell className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2.5 rounded-lg">
                    <FileText size={16} className="text-primary" />
                  </div>
                  <div>
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
                    <p className="font-semibold text-sm text-card-foreground">{job.title}</p>
                    {job.description && (
                      <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {job.description}
                      </p>
                    )}
                    {(() => {
                      const di = getDueInfo(job.dueDate);
                      if (!di && !job.attachmentUrl) return null;
                      return (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {di && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${di.className}`}>
                              Due {di.dateStr} · {di.label}
                            </span>
                          )}
                          {job.attachmentUrl && (
                            <a
                              href={job.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={job.attachmentName}
                              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                            >
                              <Paperclip size={11} className="flex-shrink-0" />
                              <span className="truncate max-w-[140px]">{job.attachmentName || 'Attachment'}</span>
                            </a>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-6 py-4">
                <span
                  className={`font-bold text-xs px-3 py-1.5 rounded-lg ${
                    priorityColors[job.priority] || priorityColors[3]
                  }`}
                >
                  P{job.priority}
                </span>
              </TableCell>
              <TableCell className="px-6 py-4">
                <Badge
                  className="text-white text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg"
                  style={{
                    backgroundColor: departments.find((d) => d.id === job.departmentId)?.color,
                  }}
                >
                  {departments.find((d) => d.id === job.departmentId)?.name}
                </Badge>
              </TableCell>
              <TableCell className="px-6 py-4">
                <span className="text-sm text-card-foreground font-medium">
                  {job.assignedTo || '—'}
                </span>
              </TableCell>
              <TableCell className="px-6 py-4">
                <span className="text-xs text-muted-foreground line-clamp-2 max-w-[360px] block">
                  {job.notes || '—'}
                </span>
              </TableCell>
              <TableCell className="px-6 py-4">
                {job.fileUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewPdf?.(job)}
                    className="flex items-center gap-2 text-primary hover:bg-primary/10"
                  >
                    <Eye size={14} />
                    View
                  </Button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="px-6 py-4">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEditJob?.(job)}
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                    title="Edit job"
                  >
                    <Pencil size={18} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onViewHistory(job)}
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                    title="History"
                  >
                    <Clock size={18} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteJob(job.id)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
