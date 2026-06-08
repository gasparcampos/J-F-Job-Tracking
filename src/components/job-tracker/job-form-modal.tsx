'use client';

import { useState, useRef } from 'react';
import { X, Upload, Wrench, Loader2, FileText, Check, Sparkles } from 'lucide-react';
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
  onSubmit: (data: CreateJobInput) => void;
  departments: Department[];
  employees: Employee[];
}

interface ExtractedData {
  jobNumber: string | null;
  customer: string | null;
  poNumber: string | null;
  line: string | null;
  dwgNumber: string | null;
  partNumber: string | null;
  dueDate: string | null;
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
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    url: string;
    name: string;
    isPdf?: boolean;
  } | null>(null);
  
  const [jobNumber, setJobNumber] = useState('');
  const [customer, setCustomer] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [line, setLine] = useState('');
  const [dwgNumber, setDwgNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        
        // Extract data with VLM
        setIsExtracting(true);
        try {
          console.log('Calling VLM extraction for:', uploadData.fileUrl);
          
          const extractRes = await fetch('/api/extract-job-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              fileUrl: uploadData.fileUrl, 
              fileName: uploadData.fileName 
            }),
          });

          const extractResult = await extractRes.json();
          console.log('VLM extraction result:', extractResult);
          
          if (extractResult.success && extractResult.data) {
            setExtractedData(extractResult.data);
            
            // Auto-fill form fields
            if (extractResult.data.jobNumber) setJobNumber(extractResult.data.jobNumber);
            if (extractResult.data.customer) setCustomer(extractResult.data.customer);
            if (extractResult.data.poNumber) setPoNumber(extractResult.data.poNumber);
            if (extractResult.data.line) setLine(extractResult.data.line);
            if (extractResult.data.dwgNumber) setDwgNumber(extractResult.data.dwgNumber);
            if (extractResult.data.partNumber) setPartNumber(extractResult.data.partNumber);
            if (extractResult.data.dueDate) setDueDate(extractResult.data.dueDate);
            
            // Auto-fill title
            if (extractResult.data.jobNumber || extractResult.data.partNumber) {
              const titleParts = [];
              if (extractResult.data.jobNumber) titleParts.push(extractResult.data.jobNumber);
              if (extractResult.data.partNumber) titleParts.push(extractResult.data.partNumber);
              setTitle(titleParts.join(' - '));
            }
            
            console.log('✅ Form auto-filled successfully!');
          }
        } catch (extractError) {
          console.error('VLM extraction error:', extractError);
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
    setExtractedData(null);
    setTimeout(() => handleFileUpload(), 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (fileInputRef.current?.files?.[0] && !uploadedFile) {
      await handleFileUpload();
    }

    onSubmit({
      title,
      description,
      departmentId,
      priority,
      assignedTo: assignedTo === '__none__' ? undefined : assignedTo,
      notes: notes || undefined,
      fileUrl: uploadedFile?.url,
      fileName: uploadedFile?.name,
      jobNumber: jobNumber || undefined,
      customer: customer || undefined,
      poNumber: poNumber || undefined,
      line: line || undefined,
      dwgNumber: dwgNumber || undefined,
      partNumber: partNumber || undefined,
      dueDate: dueDate || undefined,
    });

    // Reset
    setTitle('');
    setDescription('');
    setDepartmentId(departments[0]?.id || '');
    setPriority(3);
    setAssignedTo('__none__');
    setNotes('');
    setUploadedFile(null);
    setExtractedData(null);
    setJobNumber('');
    setCustomer('');
    setPoNumber('');
    setLine('');
    setDwgNumber('');
    setPartNumber('');
    setDueDate('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
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
              📄 Upload Document - AI extracts data automatically
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
                <div className="flex items-center gap-2 text-orange-500">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  <span className="text-xs">AI reading...</span>
                </div>
              )}
            </div>
            
            {/* File Info */}
            {uploadedFile && (
              <div className="mt-3 rounded-xl border border-border overflow-hidden bg-muted/50 p-4">
                <div className="flex items-center gap-3">
                  <FileText size={24} className="text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{uploadedFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isExtracting ? '🔄 AI is reading document...' :
                       extractedData ? '✅ Data extracted automatically!' : 'File uploaded'}
                    </p>
                  </div>
                  {isExtracting ? (
                    <Loader2 size={20} className="text-primary animate-spin" />
                  ) : (
                    <Check size={20} className="text-emerald-500" />
                  )}
                </div>
              </div>
            )}

            {/* Document Preview */}
            {uploadedFile && (
              <div className="mt-3">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">
                  Vista previa
                </Label>
                <FilePreview fileUrl={uploadedFile.url} fileName={uploadedFile.name} />
              </div>
            )}
            
            {/* Extracted Data Preview */}
            {extractedData && (
              <div className="mt-3 bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600">✨ AI Extracted:</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  {extractedData.jobNumber && <div><span className="text-muted-foreground">JOB#:</span> <span className="font-bold text-card-foreground">{extractedData.jobNumber}</span></div>}
                  {extractedData.customer && <div><span className="text-muted-foreground">Customer:</span> <span className="font-bold text-card-foreground">{extractedData.customer}</span></div>}
                  {extractedData.poNumber && <div><span className="text-muted-foreground">PO#:</span> <span className="font-bold text-card-foreground">{extractedData.poNumber}</span></div>}
                  {extractedData.partNumber && <div><span className="text-muted-foreground">Part#:</span> <span className="font-bold text-card-foreground">{extractedData.partNumber}</span></div>}
                  {extractedData.dwgNumber && <div><span className="text-muted-foreground">DWG#:</span> <span className="font-bold text-card-foreground">{extractedData.dwgNumber}</span></div>}
                  {extractedData.line && <div><span className="text-muted-foreground">Line:</span> <span className="font-bold text-card-foreground">{extractedData.line}</span></div>}
                  {extractedData.dueDate && <div><span className="text-muted-foreground">Due:</span> <span className="font-bold text-card-foreground">{extractedData.dueDate}</span></div>}
                </div>
              </div>
            )}
          </div>

          {/* Job Details */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
              Job Details
            </h3>
            
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">JOB#</Label>
                <Input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="Job Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Customer</Label>
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">PO#</Label>
                <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Line</Label>
                <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Line" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">DWG#</Label>
                <Input value={dwgNumber} onChange={(e) => setDwgNumber(e.target.value)} placeholder="Drawing #" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Part#</Label>
                <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Part Number" className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg h-9 bg-background border-border text-xs" />
              </div>
              <div>
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

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 block">Additional Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions..." rows={3} className="rounded-lg bg-background border-border resize-none" />
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
