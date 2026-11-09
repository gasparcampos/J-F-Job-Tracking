'use client';

import { Wrench, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Fixture } from '@/types';
import { qtyInStock, fmtAccessDate } from '@/lib/job-lookup';

interface FixturesTableProps {
  fixtures: Fixture[];
  onEdit: (fixture: Fixture) => void;
  onDelete: (fixture: Fixture) => void;
}

const HEAD = 'px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest';
const CELL = 'px-3 py-2 text-xs';

export function FixturesTable({ fixtures, onEdit, onDelete }: FixturesTableProps) {
  return (
    <div className="w-full bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
              <TableHead className={HEAD}>JOB#</TableHead>
              <TableHead className={HEAD}>Company</TableHead>
              <TableHead className={HEAD}>DWG#</TableHead>
              <TableHead className={HEAD}>Part#</TableHead>
              <TableHead className={HEAD}>Name</TableHead>
              <TableHead className={`${HEAD} text-center`}>Qty</TableHead>
              <TableHead className={HEAD}>Date In</TableHead>
              <TableHead className={HEAD}>Date Out</TableHead>
              <TableHead className={HEAD}>Place</TableHead>
              <TableHead className={`${HEAD} text-right`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fixtures.map((f) => {
              const inStock = qtyInStock(f.qty);
              return (
                <TableRow key={f.id} className="hover:bg-muted/30 border-b border-border transition-colors">
                  <TableCell className="px-3 py-2">
                    {/* Double-click the JOB# to open the record (edit / print label). */}
                    <button
                      type="button"
                      onDoubleClick={() => onEdit(f)}
                      title="Doble clic para abrir / imprimir"
                      className="font-semibold text-sm text-primary underline underline-offset-2 cursor-pointer select-none"
                    >
                      {f.jobNumber || '—'}
                    </button>
                  </TableCell>
                  <TableCell className={CELL}>{f.company || ''}</TableCell>
                  <TableCell className={CELL}>{f.dwgNumber || ''}</TableCell>
                  <TableCell className={CELL}>{f.partNumber || ''}</TableCell>
                  <TableCell className={CELL}>{f.name || ''}</TableCell>
                  {/* Green with the count while the fixture is on the shelf;
                      empty once FIX_QTY is set to 0 (taken out). */}
                  <TableCell className={`px-3 py-2 text-center text-xs font-bold ${inStock ? 'bg-green-600 text-white' : ''}`}>
                    {inStock ? f.qty!.trim() : ''}
                  </TableCell>
                  <TableCell className={`${CELL} whitespace-nowrap`}>{fmtAccessDate(f.dateIn)}</TableCell>
                  <TableCell className={`${CELL} whitespace-nowrap`}>{f.active ? '' : fmtAccessDate(f.dateOut)}</TableCell>
                  <TableCell className={`${CELL} font-medium text-primary`}>{f.place || ''}</TableCell>
                  <TableCell className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(f)}
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(`Delete fixture for JOB# ${f.jobNumber || '(no job)'}? This cannot be undone.`)) {
                            onDelete(f);
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

      {fixtures.length === 0 && (
        <div className="p-20 text-center">
          <Wrench size={48} className="mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="font-semibold uppercase text-[11px] tracking-widest text-muted-foreground">No fixtures</p>
        </div>
      )}
    </div>
  );
}
