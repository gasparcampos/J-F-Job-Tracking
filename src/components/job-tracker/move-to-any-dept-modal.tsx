'use client';

import { useState } from 'react';
import { X, ArrowRight, Building2, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Job, Department, Employee } from '@/types';

interface MoveToAnyDeptModalProps {
  job: Job | null;
  departments: Department[];
  employees: Employee[];
  onMove: (targetDeptId: string, employeeName: string, notes: string, discardTime: boolean) => void;
  onCancel: () => void;
  // Optional pre-fill (used by the "Ship" shortcut: target = READY TO SHIP,
  // processor = Karina). When set, the title also reflects the shipping intent.
  defaultDeptId?: string;
  defaultEmployee?: string;
  shipMode?: boolean;
}

export function MoveToAnyDeptModal({
  job,
  departments,
  employees,
  onMove,
  onCancel,
  defaultDeptId,
  defaultEmployee,
  shipMode,
}: MoveToAnyDeptModalProps) {
  const [selectedDeptId, setSelectedDeptId] = useState<string>(defaultDeptId ?? '');
  const [selectedEmployee, setSelectedEmployee] = useState<string>(defaultEmployee || '__none__');
  const [notes, setNotes] = useState('');
  // When true, the time worked in the current area is discarded on move
  // (a "reset" for sending the job back to a previous process).
  const [discardTime, setDiscardTime] = useState(false);

  if (!job) return null;

  // Find the selected department to get default employee
  const selectedDept = departments.find(d => d.id === selectedDeptId);

  // Only offer the reset option when there's actually time to discard in the
  // current area (banked time or a running clock).
  const hasStageTime = (job.deptTimes?.[job.departmentId] ?? 0) > 0 || !!job.inProgress;

  const handleDeptChange = (deptId: string) => {
    setSelectedDeptId(deptId);
    // Pre-select default employee for the new department
    const dept = departments.find(d => d.id === deptId);
    if (dept?.defaultEmployee) {
      const employeeExists = employees.some(e => e.name === dept.defaultEmployee);
      if (employeeExists) {
        setSelectedEmployee(dept.defaultEmployee);
        return;
      }
    }
    setSelectedEmployee('__none__');
  };

  const handleMove = () => {
    if (!selectedDeptId) return;
    const employeeName = selectedEmployee === '__none__' ? '' : selectedEmployee;
    onMove(selectedDeptId, employeeName, notes, discardTime);
    setNotes('');
    setSelectedDeptId('');
    setSelectedEmployee('__none__');
    setDiscardTime(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-orange-600 to-amber-500 px-6 py-5 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <Building2 size={18} />
            <h3 className="font-bold text-sm">{shipMode ? 'Ship Job' : 'Move to Any Area'}</h3>
          </div>
          <button
            onClick={onCancel}
            className="hover:bg-white/10 p-1.5 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Job info */}
          <div className="bg-muted/50 p-3 rounded-xl border border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
              Job
            </p>
            <p className="font-semibold text-card-foreground text-sm">
              {job.title}
            </p>
          </div>

          {/* Ship destination banner (ship mode has a single, fixed target). */}
          {shipMode && (
            <div className="text-center bg-green-500/10 py-3 rounded-xl border border-green-600/30">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                Sending to
              </p>
              <p className="font-bold text-lg uppercase tracking-tight text-green-600 dark:text-green-400">
                Shipped / Enviados
              </p>
            </div>
          )}

          {/* Department selector (hidden in ship mode — destination is fixed). */}
          {!shipMode && (
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">
              Select Target Area
            </Label>
            <Select value={selectedDeptId} onValueChange={handleDeptChange}>
              <SelectTrigger className="w-full rounded-lg h-12 bg-background border-border">
                <SelectValue placeholder="Select area..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border max-h-64">
                {departments.map((dept) => (
                  <SelectItem
                    key={dept.id}
                    value={dept.id}
                    className="hover:bg-muted"
                    disabled={dept.id === job.departmentId}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: dept.color }}
                      />
                      <span>{dept.name}</span>
                      {dept.id === job.departmentId && (
                        <span className="text-[9px] text-muted-foreground ml-2">(current)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}

          {/* Selected department preview */}
          {!shipMode && selectedDept && (
            <div className="text-center bg-muted/50 py-4 rounded-xl border border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                Move to
              </p>
              <div className="flex items-center justify-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: selectedDept.color }}
                />
                <p
                  className="font-bold text-lg uppercase tracking-tight"
                  style={{ color: selectedDept.color }}
                >
                  {selectedDept.name}
                </p>
              </div>
              {selectedDept.defaultEmployee && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Default assignee: <span className="font-bold text-primary">{selectedDept.defaultEmployee}</span>
                </p>
              )}
            </div>
          )}

          {/* Employee selector */}
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">
              Who processes this job?
            </Label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-full rounded-lg h-11 bg-background border-border">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="__none__" className="hover:bg-muted">Unassigned</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.name} className="hover:bg-muted">
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">
              Process notes
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add updates or instructions..."
              className="rounded-lg h-24 bg-background border-border resize-none"
            />
          </div>

          {/* Reset time option — for sending the job back to a previous
              process. Hidden in ship mode and when there's no time to reset. */}
          {!shipMode && hasStageTime && (
            <button
              type="button"
              onClick={() => setDiscardTime((v) => !v)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                discardTime
                  ? 'bg-amber-500/10 border-amber-500/60'
                  : 'bg-muted/40 border-border hover:border-amber-500/40'
              }`}
            >
              <div
                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  discardTime ? 'bg-amber-500 border-amber-500' : 'border-muted-foreground/50'
                }`}
              >
                {discardTime && <Check size={14} className="text-white" strokeWidth={3} />}
              </div>
              <div>
                <p className="text-xs font-bold text-card-foreground flex items-center gap-1.5">
                  <RotateCcw size={12} className="text-amber-500" />
                  Reset time (don&apos;t count it)
                </p>
                <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                  Use when sending the job back to a previous step. The time worked in the current area is discarded and not added to the totals.
                </p>
              </div>
            </button>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={handleMove}
              disabled={!selectedDeptId}
              className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white h-12 rounded-lg font-semibold uppercase tracking-wider shadow-lg disabled:opacity-50"
            >
              <ArrowRight size={16} className="mr-2" />
              {shipMode ? 'Confirm Ship' : 'Confirm Move'}
            </Button>
            <Button
              variant="outline"
              onClick={onCancel}
              className="w-full h-11 rounded-lg font-semibold uppercase tracking-wider border-border"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
