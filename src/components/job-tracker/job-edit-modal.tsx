'use client';

import { useState, useEffect } from 'react';
import { X, Pencil, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Job, Employee, UpdateJobInput } from '@/types';

interface JobEditModalProps {
  job: Job | null;
  employees: Employee[];
  // Returns true if saved. When false (e.g. duplicate JOB#), the modal
  // stays open so the user can fix the value.
  onSave: (jobId: string, data: UpdateJobInput) => Promise<boolean> | void;
  onClose: () => void;
}

export function JobEditModal({ job, employees, onSave, onClose }: JobEditModalProps) {
  const [title, setTitle] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [customer, setCustomer] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [line, setLine] = useState('');
  const [quantity, setQuantity] = useState('');
  const [dwgNumber, setDwgNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState(3);
  const [assignedTo, setAssignedTo] = useState('__none__');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load the job's current values whenever a new job is opened for editing.
  useEffect(() => {
    if (!job) return;
    setTitle(job.title ?? '');
    setJobNumber(job.jobNumber ?? '');
    setCustomer(job.customer ?? '');
    setPoNumber(job.poNumber ?? '');
    setLine(job.line ?? '');
    setQuantity(job.quantity ?? '');
    setDwgNumber(job.dwgNumber ?? '');
    setPartNumber(job.partNumber ?? '');
    // <input type="date"> needs YYYY-MM-DD; trim any time portion.
    setDueDate(job.dueDate ? String(job.dueDate).slice(0, 10) : '');
    setPriority(job.priority ?? 3);
    setAssignedTo(job.assignedTo || '__none__');
    setNotes(job.notes ?? '');
  }, [job]);

  if (!job) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const result = await onSave(job.id, {
        title,
        jobNumber: jobNumber.trim() || undefined,
        customer: customer.trim() || undefined,
        poNumber: poNumber.trim() || undefined,
        line: line.trim() || undefined,
        quantity: quantity.trim() || undefined,
        dwgNumber: dwgNumber.trim() || undefined,
        partNumber: partNumber.trim() || undefined,
        dueDate: dueDate || undefined,
        priority,
        assignedTo: assignedTo === '__none__' ? undefined : assignedTo,
        notes: notes.trim() || undefined,
      });
      // Keep the modal open if the save failed (e.g. duplicate JOB#).
      if (result === false) return;
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="bg-card border-b border-border px-8 py-6 flex justify-between items-center sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Pencil size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-card-foreground">Edit Job</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                J&F MACHINE SHOP
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-muted p-2 rounded-lg transition-all text-muted-foreground hover:text-card-foreground">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-muted/30 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
              Job Details
            </h3>

            {/* Row 1: customer / PO# / line / job# / quantity */}
            <div className="grid grid-cols-5 gap-3">
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Customer</Label>
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">PO#</Label>
                <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Line Item</Label>
                <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Line" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">JOB#</Label>
                <Input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="Job Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Quantity</Label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
            </div>

            {/* Row 2: drawing / part / due date / priority */}
            <div className="grid grid-cols-6 gap-3 mt-3">
              <div className="col-span-2">
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">DWG#</Label>
                <Input value={dwgNumber} onChange={(e) => setDwgNumber(e.target.value)} placeholder="Drawing #" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div className="col-span-2">
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Part#</Label>
                <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Part Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div className="col-span-1">
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div className="col-span-1">
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Priority</Label>
                <Select value={priority.toString()} onValueChange={(v) => setPriority(Number(v))}>
                  <SelectTrigger className="rounded-lg h-9 bg-background border-border text-xs">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {[1, 2, 3, 4, 5].map((p) => (
                      <SelectItem key={p} value={p.toString()} className="hover:bg-muted text-xs">Level {p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Title / Description *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title..." required className="rounded-lg h-11 bg-background border-border" />
          </div>

          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Assign To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="rounded-lg h-11 bg-background border-border">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="__none__" className="hover:bg-muted">Unassigned</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.name} className="hover:bg-muted">{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Additional Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions..." rows={3} className="rounded-lg bg-background border-border resize-none" />
          </div>

          <div className="flex gap-3">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 h-12 rounded-lg font-semibold uppercase tracking-wider border-border">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-lg font-semibold uppercase tracking-wider shadow-lg shadow-primary/30 disabled:opacity-50">
              <Save size={16} className="mr-2" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
