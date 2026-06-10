'use client';

import { FileText, Clock, Trash2, Eye } from 'lucide-react';
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
}

export function JobsTable({
  jobs,
  departments,
  onViewHistory,
  onDeleteJob,
  onViewPdf,
}: JobsTableProps) {
  // Modern priority colors - solid
  const priorityColors: Record<number, string> = {
    1: 'bg-red-500 text-white',
    2: 'bg-orange-500 text-white',
    3: 'bg-amber-500 text-white',
    4: 'bg-blue-500 text-white',
    5: 'bg-emerald-500 text-white',
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
              Status
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Priority
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Assigned
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              File
            </TableHead>
            <TableHead className="px-6 py-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Notes
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
                    <p className="font-semibold text-sm text-card-foreground">{job.title}</p>
                    {job.description && (
                      <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {job.description}
                      </p>
                    )}
                  </div>
                </div>
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
                <span
                  className={`font-bold text-xs px-3 py-1.5 rounded-lg ${
                    priorityColors[job.priority] || priorityColors[3]
                  }`}
                >
                  P{job.priority}
                </span>
              </TableCell>
              <TableCell className="px-6 py-4">
                <span className="text-sm text-card-foreground font-medium">
                  {job.assignedTo || '—'}
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
                <span className="text-xs text-muted-foreground truncate max-w-[150px] block">
                  {job.notes || '—'}
                </span>
              </TableCell>
              <TableCell className="px-6 py-4">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onViewHistory(job)}
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
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
