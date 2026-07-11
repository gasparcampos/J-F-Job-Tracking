export interface Department {
  id: string;
  name: string;
  color: string;
  order: number;
  defaultEmployee?: string;
}

export interface Employee {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  isActive: boolean;
}

export interface JobHistoryEntry {
  id: string;
  jobId: string;
  fromDeptId?: string;
  toDeptId: string;
  employeeId?: string;
  employeeName?: string;
  notes?: string;
  timestamp: string;
}

export interface Job {
  id: string;
  title: string;
  description?: string;
  priority: number;
  departmentId: string;
  order: number;
  department?: Department;
  assignedTo?: string;
  fileUrl?: string;
  fileName?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachments?: Array<{ url: string; name: string }>;
  previewUrl?: string;
  pageCount?: number;
  notes?: string;
  inProgress?: boolean;
  inProgressAt?: string;
  // Milliseconds worked per department (keyed by departmentId). The clock
  // runs while In Progress and is banked when work stops.
  deptTimes?: Record<string, number>;
  // New fields for job tracking
  jobNumber?: string;
  name?: string;
  customer?: string;
  poNumber?: string;
  line?: string;
  quantity?: string;
  dwgNumber?: string;
  partNumber?: string;
  dueDate?: string;
  // Material-specific fields (raw stock traceability).
  materialPo?: string;
  heatNumber?: string;
  hrc?: string;
  // Permanent "outside services" note (e.g. phosphate, NDE). Stays anchored
  // to the job and is NOT overwritten by department moves like `notes` is.
  outService?: string;
  // Deviation details (free text) plus its review status. A job whose
  // deviationStatus is 'pending' is pulled out of the active list into the
  // Deviations list until it's accepted or rejected.
  deviation?: string;
  deviationStatus?: 'pending' | 'accepted' | 'rejected' | '';
  // Shipped (sent) from READY TO SHIP. A shipped job leaves the Kanban board
  // and shows in the Enviados (Shipped) list until returned to active.
  shipped?: boolean;
  shippedAt?: string;
  history?: JobHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

// API Types
export interface CreateJobInput {
  title: string;
  description?: string;
  priority?: number;
  departmentId: string;
  assignedTo?: string;
  notes?: string;
  fileUrl?: string;
  fileName?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  previewUrl?: string;
  pageCount?: number;
  // New fields for job tracking
  jobNumber?: string;
  name?: string;
  customer?: string;
  poNumber?: string;
  line?: string;
  quantity?: string;
  dwgNumber?: string;
  partNumber?: string;
  dueDate?: string;
  materialPo?: string;
  heatNumber?: string;
  hrc?: string;
  outService?: string;
}

export interface UpdateJobInput {
  title?: string;
  description?: string;
  priority?: number;
  departmentId?: string;
  assignedTo?: string;
  notes?: string;
  fileUrl?: string;
  fileName?: string;
  previewUrl?: string;
  pageCount?: number;
  // Job tracking fields (editable from the table)
  jobNumber?: string;
  name?: string;
  customer?: string;
  poNumber?: string;
  line?: string;
  quantity?: string;
  dwgNumber?: string;
  partNumber?: string;
  dueDate?: string;
  materialPo?: string;
  heatNumber?: string;
  hrc?: string;
  outService?: string;
  deviation?: string;
  deviationStatus?: 'pending' | 'accepted' | 'rejected' | '';
  shipped?: boolean;
  shippedAt?: string;
}

// Leftover machined pieces stored in racks/shelves (Extra Parts tab).
// Linked to the original Job by jobId (optional), but the identifying
// fields are copied so the row is self-contained even if the job is later
// deleted or shipped.
export interface ExtraPart {
  id: string;
  jobId?: string;
  jobNumber?: string;
  company?: string;
  dwgNumber?: string;
  partNumber?: string;
  poNumber?: string;
  name?: string;
  heatNumber?: string;
  partQty?: string;
  place?: string;
  partDate?: string;
  employeeName?: string;
  partNotes?: string;
  // While `active` is true the piece is still in stock. When set to false,
  // exitDate is auto-filled with today server-side.
  active: boolean;
  exitDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExtraPartInput {
  jobId?: string;
  jobNumber?: string;
  company?: string;
  dwgNumber?: string;
  partNumber?: string;
  poNumber?: string;
  name?: string;
  heatNumber?: string;
  partQty?: string;
  place?: string;
  partDate?: string;
  employeeName?: string;
  partNotes?: string;
  active?: boolean;
  exitDate?: string;
}

export type UpdateExtraPartInput = Partial<CreateExtraPartInput>;

export interface MoveJobInput {
  jobId: string;
  targetDeptId: string;
  employeeId?: string;
  employeeName?: string;
  notes?: string;
}
