'use client';

import { useState } from 'react';
import { Ruler, Pencil, Trash2, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Gage } from '@/types';
import { qtyInStock, fmtAccessDate } from '@/lib/job-lookup';
import {
  type GageFilter,
  filterGages,
  isLoaned,
  isToReturn,
  daysHeld,
  countByLender,
  downloadGagesExcel,
  printGagesList,
} from '@/lib/gage-list';

interface GagesTableProps {
  gages: Gage[];
  onEdit: (gage: Gage) => void;
  onDelete: (gage: Gage) => void;
}

const HEAD = 'px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest';
const CELL = 'px-3 py-2 text-xs';

export function GagesTable({ gages, onEdit, onDelete }: GagesTableProps) {
  // Owner filter: all / ours / lent by a customer / lent and still here.
  const [filter, setFilter] = useState<GageFilter>('all');
  const shown = filterGages(gages, filter);
  const toReturn = gages.filter(isToReturn);

  const chips: { key: GageFilter; label: string; count: number; warn?: boolean }[] = [
    { key: 'all', label: 'All', count: gages.length },
    { key: 'in-house', label: 'In-House', count: gages.filter((g) => !isLoaned(g)).length },
    { key: 'loaned', label: 'Customer (loaned)', count: gages.filter(isLoaned).length },
    { key: 'to-return', label: 'To Return', count: toReturn.length, warn: true },
  ];

  return (
    <div className="w-full bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
      {/* Filter + list export (Excel / print) of what's shown. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
              filter === c.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-card-foreground'
            }`}
          >
            {c.label}
            <span
              className={`text-[10px] font-bold px-1.5 rounded ${
                c.warn && c.count > 0 ? 'bg-amber-600 text-white' : filter === c.key ? 'bg-primary-foreground/20' : 'bg-muted'
              }`}
            >
              {c.count}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!shown.length}
            onClick={() => downloadGagesExcel(shown, filter)}
            className="gap-1.5 rounded-lg h-8"
            title="Download this list for Excel"
          >
            <FileSpreadsheet size={14} />
            Export Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!shown.length}
            onClick={() => printGagesList(shown, filter)}
            className="gap-1.5 rounded-lg h-8"
            title="Print this list"
          >
            <Printer size={14} />
            Print List
          </Button>
        </div>
        {/* How many customer gages are still here, per customer. */}
        {toReturn.length > 0 && (filter === 'loaned' || filter === 'to-return') && (
          <p className="w-full text-[11px] text-muted-foreground">
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {toReturn.length} gage{toReturn.length === 1 ? '' : 's'} de clientes por regresar:
            </span>{' '}
            {countByLender(toReturn).map(([c, n]) => `${c} ${n}`).join(' · ')}
          </p>
        )}
      </div>
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
              <TableHead className={HEAD}>Owner</TableHead>
              <TableHead className={HEAD}>Received</TableHead>
              <TableHead className={HEAD}>Returned</TableHead>
              <TableHead className={`${HEAD} text-right`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((f) => {
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
                  {/* Green with the count while the gage is on the shelf;
                      empty once GAGE QTY is set to 0 (taken out). */}
                  <TableCell className={`px-3 py-2 text-center text-xs font-bold ${inStock ? 'bg-green-600 text-white' : ''}`}>
                    {inStock ? f.qty!.trim() : ''}
                  </TableCell>
                  <TableCell className={`${CELL} whitespace-nowrap`}>{fmtAccessDate(f.dateIn)}</TableCell>
                  <TableCell className={`${CELL} whitespace-nowrap`}>{f.active ? '' : fmtAccessDate(f.dateOut)}</TableCell>
                  <TableCell className={`${CELL} font-medium text-primary`}>{f.place || ''}</TableCell>
                  {/* In-house, or the customer that lent it. Amber while we
                      still have a loaned gage; green once it went back. */}
                  <TableCell className={`${CELL} whitespace-nowrap`}>
                    {f.ownership === 'customer' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider text-white rounded px-1.5 py-px ${
                            f.returnedDate ? 'bg-green-600' : 'bg-amber-600'
                          }`}
                        >
                          {f.returnedDate ? 'Returned' : 'Loaned'}
                        </span>
                        {f.loanedBy || 'Customer'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">In-House</span>
                    )}
                  </TableCell>
                  <TableCell className={`${CELL} whitespace-nowrap`}>
                    {f.ownership === 'customer' ? fmtAccessDate(f.receivedDate) : ''}
                    {/* Days we've had it, while it's still here. */}
                    {isToReturn(f) && daysHeld(f) && (
                      <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">({daysHeld(f)} d)</span>
                    )}
                  </TableCell>
                  <TableCell className={`${CELL} whitespace-nowrap`}>
                    {f.ownership === 'customer' ? fmtAccessDate(f.returnedDate) : ''}
                  </TableCell>
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
                          if (window.confirm(`Delete gage for JOB# ${f.jobNumber || '(no job)'}? This cannot be undone.`)) {
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

      {shown.length === 0 && (
        <div className="p-20 text-center">
          <Ruler size={48} className="mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="font-semibold uppercase text-[11px] tracking-widest text-muted-foreground">No gages</p>
        </div>
      )}
    </div>
  );
}
