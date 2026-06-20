'use client';

import { useState, useEffect } from 'react';
import { X, Pencil, Save, AlertTriangle, Check, Ban } from 'lucide-react';
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
  const [name, setName] = useState('');
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
  const [outService, setOutService] = useState('');
  const [deviation, setDeviation] = useState('');
  const [deviationStatus, setDeviationStatus] = useState<'pending' | 'accepted' | 'rejected' | ''>('');
  const [isSaving, setIsSaving] = useState(false);

  // Load the job's current values whenever a new job is opened for editing.
  useEffect(() => {
    if (!job) return;
    setTitle(job.title ?? '');
    setJobNumber(job.jobNumber ?? '');
    setName(job.name ?? '');
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
    setOutService(job.outService ?? '');
    setDeviation(job.deviation ?? '');
    setDeviationStatus(job.deviationStatus ?? '');
  }, [job]);

  if (!job) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const result = await onSave(job.id, {
        title,
        jobNumber: jobNumber.trim() || undefined,
        name: name.trim() || undefined,
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
        outService: outService.trim() || undefined,
        deviation: deviation.trim() || undefined,
        // Always send the status (incl. '') so resolving a deviation clears it.
        deviationStatus,
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
      <div className="bg-card w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
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

            {/* Row 1: customer / PO# / line / job# / quantity.
                Widths tuned: longer customer/PO, short line item & qty. */}
            <div className="grid gap-3" style={{ gridTemplateColumns: '1.25fr 1.3fr 0.55fr 1fr 0.75fr' }}>
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

            {/* Row 2: drawing / part / name / due date.
                Longer DWG#/Part# for long part numbers. */}
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: '1.5fr 1.5fr 1.4fr 1.1fr' }}>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">DWG#</Label>
                <Input value={dwgNumber} onChange={(e) => setDwgNumber(e.target.value)} placeholder="Drawing #" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Part#</Label>
                <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Part Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Title / Description *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title..." required className="rounded-lg h-11 bg-background border-border" />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Priority</Label>
              <Select value={priority.toString()} onValueChange={(v) => setPriority(Number(v))}>
                <SelectTrigger className="rounded-lg h-11 bg-background border-border">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {[1, 2, 3, 4, 5].map((p) => (
                    <SelectItem key={p} value={p.toString()} className="hover:bg-muted">Level {p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Out Service</Label>
            <Textarea value={outService} onChange={(e) => setOutService(e.target.value)} placeholder="Outside services (e.g. phosphate, NDE)..." rows={2} className="rounded-lg bg-background border-border resize-none" />
          </div>

          {/* Deviation: details + workflow button. A pending deviation moves
              the job into the Deviations list until accepted/rejected. */}
          <div className={`rounded-xl p-4 border ${deviationStatus === 'pending' ? 'border-red-500/60 bg-red-500/5' : 'border-border bg-muted/30'}`}>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <AlertTriangle size={13} className={deviationStatus === 'pending' ? 'text-red-500' : 'text-muted-foreground'} />
                Deviation
              </Label>
              {deviationStatus === 'pending' && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-red-600 rounded-md px-2 py-0.5 animate-pulse">
                  Pending
                </span>
              )}
              {deviationStatus === 'accepted' && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-green-600 rounded-md px-2 py-0.5">
                  Accepted
                </span>
              )}
              {deviationStatus === 'rejected' && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-zinc-600 rounded-md px-2 py-0.5">
                  Rejected
                </span>
              )}
            </div>
            <Textarea
              value={deviation}
              onChange={(e) => setDeviation(e.target.value)}
              placeholder="Deviation details (reason, dimensions, disposition)..."
              rows={2}
              className="rounded-lg bg-background border-border resize-none"
            />

            {deviationStatus === 'pending' ? (
              <div className="mt-3">
                <p className="text-[11px] text-muted-foreground mb-2">
                  Deviation sent. Once reviewed, mark the outcome to return the job to the active list:
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setDeviationStatus('accepted')}
                    className="flex-1 h-10 rounded-lg font-semibold uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Check size={15} className="mr-1.5" />
                    Accepted
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setDeviationStatus('rejected')}
                    className="flex-1 h-10 rounded-lg font-semibold uppercase tracking-wider bg-zinc-600 hover:bg-zinc-700 text-white"
                  >
                    <Ban size={15} className="mr-1.5" />
                    Rejected
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                onClick={() => setDeviationStatus('pending')}
                className="mt-3 w-full h-10 rounded-lg font-semibold uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white"
              >
                <AlertTriangle size={15} className="mr-1.5" />
                {deviationStatus ? 'Send Deviation Again' : 'Send Deviation'}
              </Button>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">
              Changes apply when you click <span className="font-semibold">Save Changes</span>.
            </p>
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
