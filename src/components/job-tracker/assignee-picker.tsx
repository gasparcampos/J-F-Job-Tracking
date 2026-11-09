'use client';

import { Lock, UserX } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Employee } from '@/types';
import { assignmentForDept } from '@/lib/dept-assignments';

const NONE = '__none__';

/**
 * "Who processes this job?" for the move dialogs, following the area's
 * assignee rule (lib/dept-assignments.ts):
 *  - fixed  → shows the person, locked.
 *  - none   → shows "Sin asignar", locked.
 *  - choice → one button per person; the mover must pick one.
 *  - no rule → the regular employee list.
 * `value` is an employee name or '__none__'.
 */
export function AssigneePicker({
  deptName,
  employees,
  value,
  onChange,
}: {
  deptName?: string;
  employees: Employee[];
  value: string;
  onChange: (name: string) => void;
}) {
  const rule = assignmentForDept(deptName);
  const label = (
    <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">
      Who processes this job?
    </Label>
  );

  if (rule?.kind === 'fixed' || rule?.kind === 'none') {
    return (
      <div>
        {label}
        <div className="flex items-center gap-2 h-11 px-3 rounded-lg bg-muted/50 border border-border text-sm font-semibold">
          {rule.kind === 'fixed' ? (
            <>
              <Lock size={14} className="text-primary" />
              {rule.name}
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">siempre en esta área</span>
            </>
          ) : (
            <>
              <UserX size={14} className="text-muted-foreground" />
              Sin asignar
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">esta área no se asigna</span>
            </>
          )}
        </div>
      </div>
    );
  }

  if (rule?.kind === 'choice') {
    return (
      <div>
        {label}
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${rule.names.length}, minmax(0, 1fr))` }}>
          {rule.names.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-11 rounded-lg border text-sm font-bold transition-colors ${
                value === n
                  ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30'
                  : 'bg-background border-border hover:border-primary/60'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {!rule.names.includes(value) && (
          <p className="text-[11px] text-amber-500 mt-1.5 font-semibold">Escoge quién lo va a trabajar.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full rounded-lg h-11 bg-background border-border">
          <SelectValue placeholder="Select employee" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          <SelectItem value={NONE} className="hover:bg-muted">Unassigned</SelectItem>
          {employees.map((emp) => (
            <SelectItem key={emp.id} value={emp.name} className="hover:bg-muted">
              {emp.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * The name to send for a move into `deptName` given the dialog's `value`, or
 * null when the area needs a pick that hasn't been made yet.
 */
export function assigneeToSend(deptName: string | undefined, value: string): string | null {
  const rule = assignmentForDept(deptName);
  if (rule?.kind === 'fixed') return rule.name;
  if (rule?.kind === 'none') return '';
  if (rule?.kind === 'choice') return rule.names.includes(value) ? value : null;
  return value === NONE ? '' : value;
}
