'use client';

import { useState, useEffect } from 'react';
import { X, User, ArrowRight } from 'lucide-react';
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

interface AssignModalProps {
  job: Job | null;
  targetDepartment: Department | null;
  employees: Employee[];
  onAssign: (employeeName: string, notes: string) => void;
  onCancel: () => void;
}

export function AssignModal({
  job,
  targetDepartment,
  employees,
  onAssign,
  onCancel,
}: AssignModalProps) {
  const [selectedEmployee, setSelectedEmployee] = useState('__none__');
  const [notes, setNotes] = useState('');

  // Pre-select default employee when target department changes
  useEffect(() => {
    if (targetDepartment?.defaultEmployee) {
      // Check if the default employee exists in the employees list
      const employeeExists = employees.some(e => e.name === targetDepartment.defaultEmployee);
      if (employeeExists) {
        // Use setTimeout to avoid synchronous setState warning
        const timer = setTimeout(() => {
          setSelectedEmployee(targetDepartment.defaultEmployee!);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
    const timer = setTimeout(() => {
      setSelectedEmployee('__none__');
    }, 0);
    return () => clearTimeout(timer);
  }, [targetDepartment, employees]);

  if (!job || !targetDepartment) return null;

  const handleAssign = () => {
    const employeeName = selectedEmployee === '__none__' ? '' : selectedEmployee;
    onAssign(employeeName, notes);
    setNotes('');
    setSelectedEmployee('__none__');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200">
        <div className="bg-primary px-6 py-5 flex justify-between items-center text-primary-foreground">
          <div className="flex items-center gap-2">
            <User size={18} />
            <h3 className="font-bold text-sm">Assign Next Stage</h3>
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

          {/* Target department */}
          <div className="text-center bg-muted/50 py-4 rounded-xl border border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
              Move to
            </p>
            <div className="flex items-center justify-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: targetDepartment.color }}
              />
              <p
                className="font-bold text-lg uppercase tracking-tight"
                style={{ color: targetDepartment.color }}
              >
                {targetDepartment.name}
              </p>
            </div>
            {targetDepartment.defaultEmployee && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Default assignee: <span className="font-bold text-primary">{targetDepartment.defaultEmployee}</span>
              </p>
            )}
          </div>

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

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={handleAssign}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-lg font-semibold uppercase tracking-wider shadow-lg shadow-primary/30"
            >
              <ArrowRight size={16} className="mr-2" />
              Confirm and Move
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
