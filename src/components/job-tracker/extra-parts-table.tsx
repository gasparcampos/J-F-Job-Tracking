'use client';

import { FileText, Pencil, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ExtraPart } from '@/types';

interface ExtraPartsTableProps {
  parts: ExtraPart[];
  onEdit: (part: ExtraPart) => void;
  onDelete: (part: ExtraPart) => void;
}

export function ExtraPartsTable({ parts, onEdit, onDelete }: ExtraPartsTableProps) {
  return (
    <div className="w-full bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">JOB#</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Company</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Part#</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Place</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Qty</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Heat#</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Date</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Emp</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Status</TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parts.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/30 border-b border-border transition-colors">
                <TableCell className="px-4 py-3 font-semibold text-sm">{p.jobNumber || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-xs">{p.company || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-xs">{p.partNumber || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-xs font-medium text-primary">{p.place || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-xs">{p.partQty || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-xs">{p.heatNumber || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-xs">{p.partDate || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-xs">{p.employeeName || '—'}</TableCell>
                <TableCell className="px-4 py-3">
                  {p.active ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-md px-2 py-0.5">
                      <Check size={11} />
                      In stock
                    </span>
                  ) : (
                    <span className="inline-flex flex-col text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Out</span>
                      {p.exitDate && <span className="font-normal normal-case text-[9px]">{p.exitDate}</span>}
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(p)}
                      className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (window.confirm(`Delete extra part for JOB# ${p.jobNumber || '(no job)'}? This cannot be undone.`)) {
                          onDelete(p);
                        }
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                      title="Delete"
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

      {parts.length === 0 && (
        <div className="p-20 text-center">
          <FileText size={48} className="mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="font-semibold uppercase text-[11px] tracking-widest text-muted-foreground">
            No extra parts
          </p>
        </div>
      )}
    </div>
  );
}
