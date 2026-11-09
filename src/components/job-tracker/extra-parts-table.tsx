'use client';

import { FileText, Pencil, Trash2 } from 'lucide-react';
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
import { qtyInStock, fmtAccessDate } from '@/lib/job-lookup';

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
            {/* Same columns, same order as the Access XTRA PARTS search form. */}
            <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">JOB#</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Company</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">DWG#</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Part#</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Name</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-center">Qty</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Date</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">HT#</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Place</TableHead>
              <TableHead className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parts.map((p) => {
              const qty = qtyInStock(p.partQty);
              return (
              <TableRow key={p.id} className="hover:bg-muted/30 border-b border-border transition-colors">
                <TableCell className="px-3 py-2">
                  {/* Double-click the JOB# to open the record (edit / print label). */}
                  <button
                    type="button"
                    onDoubleClick={() => onEdit(p)}
                    title="Doble clic para abrir / imprimir"
                    className="font-semibold text-sm text-primary underline underline-offset-2 cursor-pointer select-none"
                  >
                    {p.jobNumber || '—'}
                  </button>
                </TableCell>
                <TableCell className="px-3 py-2 text-xs">{p.company || ''}</TableCell>
                <TableCell className="px-3 py-2 text-xs">{p.dwgNumber || ''}</TableCell>
                <TableCell className="px-3 py-2 text-xs">{p.partNumber || ''}</TableCell>
                <TableCell className="px-3 py-2 text-xs">{p.name || ''}</TableCell>
                {/* Green with the count while parts are in stock; empty once the
                    QTY is set to 0 (part taken out). */}
                <TableCell className={`px-3 py-2 text-center text-xs font-bold ${qty ? 'bg-green-600 text-white' : ''}`}>
                  {qty ? p.partQty!.trim() : ''}
                </TableCell>
                <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{fmtAccessDate(p.partDate)}</TableCell>
                <TableCell className="px-3 py-2 text-xs">{p.heatNumber || ''}</TableCell>
                <TableCell className="px-3 py-2 text-xs font-medium text-primary">{p.place || ''}</TableCell>
                <TableCell className="px-3 py-2">
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
              );
            })}
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
