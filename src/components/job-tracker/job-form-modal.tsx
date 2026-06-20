'use client';

import { useState, useRef } from 'react';
import { X, Upload, Wrench, Loader2, FileText, Check, Paperclip } from 'lucide-react';
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
import type { Department, Employee, CreateJobInput } from '@/types';
import { FilePreview } from './file-preview';

interface JobFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Returns true if the job was created. When it returns false (e.g. a
  // duplicate JOB#), the form stays open so the user can fix the number.
  onSubmit: (data: CreateJobInput) => Promise<boolean> | void;
  departments: Department[];
  employees: Employee[];
}

export function JobFormModal({
  isOpen,
  onClose,
  onSubmit,
  departments,
  employees,
}: JobFormModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || '');
  const [priority, setPriority] = useState(3);
  const [assignedTo, setAssignedTo] = useState('__none__');
  const [outService, setOutService] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    url: string;
    name: string;
    isPdf?: boolean;
  } | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  
  const [jobNumber, setJobNumber] = useState('');
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [customerOther, setCustomerOther] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [line, setLine] = useState('');
  const [quantity, setQuantity] = useState('');
  const [dwgNumber, setDwgNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [dueDate, setDueDate] = useState('');

  const CUSTOMER_OPTIONS = ['Baker', 'Halliburton', 'Liberty', 'Other'];
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  // Upload an extra attachment (no OCR; this is just a side file).
  const handleAttachUpload = async () => {
    const file = attachInputRef.current?.files?.[0];
    if (!file) return;
    setIsAttaching(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setAttachment({ url: data.fileUrl, name: data.fileName });
      }
    } catch (error) {
      console.error('Attachment upload error:', error);
    } finally {
      setIsAttaching(false);
    }
  };

  const handleFileUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return null;

    setIsUploading(true);
    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadRes.json();
      console.log('Upload response:', uploadData);
      
      if (uploadData.success) {
        const isPdf = uploadData.isPdf || file.name.toLowerCase().endsWith('.pdf');

        setUploadedFile({
          url: uploadData.fileUrl,
          name: uploadData.fileName,
          isPdf: isPdf,
        });

        // Auto-fill Job Details from the route sheet (OCR). Best-effort:
        // only fills empty fields so it never clobbers what you typed.
        setIsExtracting(true);
        try {
          const exRes = await fetch('/api/extract-job-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileUrl: uploadData.fileUrl, fileName: uploadData.fileName }),
          });
          const ex = await exRes.json();
          const d = ex?.data;
          if (d) {
            if (d.customer) {
              setCustomer(d.customer);
              if (d.customer === 'Other' && d.customerRaw) setCustomerOther(d.customerRaw);
            }
            if (d.poNumber) setPoNumber((v) => v || d.poNumber);
            if (d.line) setLine((v) => v || d.line);
            if (d.jobNumber) setJobNumber((v) => v || d.jobNumber);
            if (d.quantity) setQuantity((v) => v || d.quantity);
            if (d.dwgNumber) setDwgNumber((v) => v || d.dwgNumber);
            if (d.partNumber) setPartNumber((v) => v || d.partNumber);
            if (d.dueDate) setDueDate((v) => v || d.dueDate);
            // Default title: "JOB# 43765 / 37 PCS / DUE DATE: 06/10/2026"
            const duePretty = d.dueDate
              ? (() => {
                  const m = String(d.dueDate).match(/(\d{4})-(\d{2})-(\d{2})/);
                  return m ? `${m[2]}/${m[3]}/${m[1]}` : d.dueDate;
                })()
              : null;
            const titleParts: string[] = [];
            if (d.jobNumber) titleParts.push(`JOB# ${d.jobNumber}`);
            if (d.quantity) titleParts.push(`${d.quantity} PCS`);
            if (duePretty) titleParts.push(`DUE DATE: ${duePretty}`);
            if (titleParts.length) {
              setTitle((v) => v || titleParts.join(' / '));
            }
          }
        } catch (exErr) {
          console.warn('Auto-fill (OCR) failed:', exErr);
        } finally {
          setIsExtracting(false);
        }

        return uploadData;
      }
      return null;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = () => {
    setUploadedFile(null);
    setTimeout(() => handleFileUpload(), 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (fileInputRef.current?.files?.[0] && !uploadedFile) {
      await handleFileUpload();
    }

    const finalCustomer =
      customer === 'Other' ? customerOther.trim() : customer;

    const result = await onSubmit({
      title,
      description,
      departmentId,
      priority,
      assignedTo: assignedTo === '__none__' ? undefined : assignedTo,
      outService: outService || undefined,
      fileUrl: uploadedFile?.url,
      fileName: uploadedFile?.name,
      attachmentUrl: attachment?.url,
      attachmentName: attachment?.name,
      jobNumber: jobNumber || undefined,
      name: name || undefined,
      customer: finalCustomer || undefined,
      poNumber: poNumber || undefined,
      line: line || undefined,
      quantity: quantity || undefined,
      dwgNumber: dwgNumber || undefined,
      partNumber: partNumber || undefined,
      dueDate: dueDate || undefined,
    });

    // If creation failed (e.g. duplicate JOB#), keep the form open so the
    // user can correct the work number without losing what they typed.
    if (result === false) return;

    // Reset
    setTitle('');
    setDescription('');
    setDepartmentId(departments[0]?.id || '');
    setPriority(3);
    setAssignedTo('__none__');
    setOutService('');
    setUploadedFile(null);
    setAttachment(null);
    setJobNumber('');
    setName('');
    setCustomer('');
    setCustomerOther('');
    setPoNumber('');
    setLine('');
    setQuantity('');
    setDwgNumber('');
    setPartNumber('');
    setDueDate('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="bg-card border-b border-border px-8 py-6 flex justify-between items-center sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Wrench size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-card-foreground">New Job</h2>
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
          {/* File Upload */}
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">
              📄 Upload document (PDF or image)
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                className="flex-1 text-xs font-medium text-muted-foreground file:bg-primary/10 file:border-0 file:rounded-lg file:px-4 file:py-2.5 file:text-primary file:mr-4 file:font-semibold file:uppercase file:tracking-wider file:shadow-sm hover:file:bg-primary/20 transition-all file:cursor-pointer"
                onChange={handleFileChange}
              />
              {isUploading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
              {isExtracting && (
                <span className="flex items-center gap-1.5 text-[11px] text-primary whitespace-nowrap">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reading document…
                </span>
              )}
            </div>
            
            {/* File Info */}
            {uploadedFile && (
              <div className="mt-3 rounded-xl border border-border overflow-hidden bg-muted/50 p-4">
                <div className="flex items-center gap-3">
                  <FileText size={24} className="text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{uploadedFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">File uploaded</p>
                  </div>
                  <Check size={20} className="text-emerald-500" />
                </div>
              </div>
            )}

            {/* Document Preview */}
            {uploadedFile && (
              <div className="mt-3">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">
                  Preview
                </Label>
                <FilePreview fileUrl={uploadedFile.url} fileName={uploadedFile.name} />
              </div>
            )}
          </div>

          {/* Job Details */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
              Job Details
            </h3>

            {/* Row 1: the five identifiers, all on one line.
                Widths tuned: longer customer/PO, short line item & qty. */}
            <div className="grid gap-3" style={{ gridTemplateColumns: '1.25fr 1.3fr 0.55fr 1fr 0.75fr' }}>
              {/* 1. Customer (dropdown) */}
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Customer</Label>
                <Select value={customer} onValueChange={setCustomer}>
                  <SelectTrigger className="rounded-lg h-9 bg-background border-border text-xs">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {CUSTOMER_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c} className="hover:bg-muted text-xs">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customer === 'Other' && (
                  <Input
                    value={customerOther}
                    onChange={(e) => setCustomerOther(e.target.value)}
                    placeholder="Customer name"
                    className="rounded-lg h-9 bg-background border-border text-xs mt-1.5"
                  />
                )}
              </div>
              {/* 2. PO# */}
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">PO#</Label>
                <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              {/* 3. Line Item */}
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Line Item</Label>
                <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Line" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              {/* 4. Job# */}
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">JOB#</Label>
                <Input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="Job Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              {/* 5. Quantity */}
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

          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Initial Stage</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="rounded-lg h-11 bg-background border-border">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id} className="hover:bg-muted">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dept.color }} />
                        {dept.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            {/* Attachment: one extra side file (no OCR). */}
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Attachment</Label>
              <input
                type="file"
                ref={attachInputRef}
                className="hidden"
                onChange={handleAttachUpload}
              />
              <Button
                type="button"
                onClick={() => attachInputRef.current?.click()}
                disabled={isAttaching}
                variant="outline"
                title={attachment?.name}
                className="w-full h-11 rounded-lg bg-background border-border hover:bg-muted text-card-foreground font-medium justify-start gap-2 overflow-hidden"
              >
                {isAttaching ? (
                  <Loader2 size={16} className="animate-spin flex-shrink-0" />
                ) : attachment ? (
                  <Check size={16} className="text-emerald-500 flex-shrink-0" />
                ) : (
                  <Paperclip size={16} className="flex-shrink-0" />
                )}
                <span className="truncate text-xs">
                  {attachment ? attachment.name : 'Attach file'}
                </span>
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Out Service</Label>
            <Textarea value={outService} onChange={(e) => setOutService(e.target.value)} placeholder="Outside services (e.g. phosphate, NDE)..." rows={3} className="rounded-lg bg-background border-border resize-none" />
          </div>

          <Button type="submit" disabled={isUploading || isExtracting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-lg font-semibold uppercase tracking-wider shadow-lg shadow-primary/30 disabled:opacity-50">
            {isUploading || isExtracting ? (
              <><Loader2 size={16} className="mr-2 animate-spin" />Processing...</>
            ) : (
              <><Upload size={16} className="mr-2" />Create Job</>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
