import fs from 'fs';
import path from 'path';

// Simple JSON file-based storage for jobs
const DB_PATH = path.join('/tmp', 'jobtracker.json');

interface StoredJob {
  id: string;
  title: string;
  description?: string;
  priority: number;
  departmentId: string;
  order: number;
  assignedTo?: string;
  fileUrl?: string;
  fileName?: string;
  previewUrl?: string;
  pageCount?: number;
  notes?: string;
  inProgress: boolean;
  inProgressAt?: string;
  // New fields for job tracking
  jobNumber?: string;
  customer?: string;
  poNumber?: string;
  line?: string;
  dwgNumber?: string;
  partNumber?: string;
  dueDate?: string;
  history: Array<{
    id: string;
    jobId: string;
    fromDeptId?: string;
    toDeptId: string;
    employeeId?: string;
    employeeName?: string;
    notes?: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface StoredDepartment {
  id: string;
  name: string;
  color: string;
  order: number;
  defaultEmployee?: string;
}

interface StoredEmployee {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  isActive: boolean;
}

interface Database {
  jobs: StoredJob[];
  departments: StoredDepartment[];
  employees: StoredEmployee[];
}

function loadDB(): Database {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading database:', error);
  }
  
  // Return and save default data
  const defaultData: Database = {
    jobs: [],
    departments: [
      { id: 'd1', name: 'NEW MATERIAL', color: '#f59e0b', order: 0, defaultEmployee: 'Gaspar' },
      { id: 'd2', name: 'Cut Saw (Segueta)', color: '#ef4444', order: 1, defaultEmployee: 'Gaspar' },
      { id: 'd3', name: 'WOOD PALLET', color: '#8b5cf6', order: 2, defaultEmployee: 'All' },
      { id: 'd4', name: 'Night shift', color: '#1e293b', order: 3, defaultEmployee: 'Aldo' },
      { id: 'd5', name: 'BLUE PALLET', color: '#3b82f6', order: 4, defaultEmployee: 'All' },
      { id: 'd6', name: 'ARTURO', color: '#10b981', order: 5, defaultEmployee: 'Arturo' },
      { id: 'd7', name: 'GERMAN', color: '#f97316', order: 6, defaultEmployee: 'German' },
      { id: 'd8', name: 'ROMULO', color: '#06b6d4', order: 7, defaultEmployee: 'Romulo' },
      { id: 'd9', name: 'LATHE DEBURR', color: '#84cc16', order: 8, defaultEmployee: 'Meno' },
      { id: 'd10', name: 'LATHE INSPECTION', color: '#eab308', order: 9, defaultEmployee: 'Estrada' },
      { id: 'd11', name: 'MILL', color: '#ec4899', order: 10, defaultEmployee: 'JR' },
      { id: 'd12', name: 'MILL DEBURR', color: '#a855f7', order: 11, defaultEmployee: 'Meno' },
      { id: 'd13', name: 'FINAL INSPECTION', color: '#14b8a6', order: 12, defaultEmployee: 'Estrada' },
      { id: 'd14', name: 'STAMP', color: '#f43f5e', order: 13, defaultEmployee: 'Chito' },
      { id: 'd15', name: 'NDE', color: '#6366f1', order: 14, defaultEmployee: '' },
      { id: 'd16', name: 'O.S', color: '#0ea5e9', order: 15, defaultEmployee: '' },
      { id: 'd17', name: 'READY TO SHIP', color: '#22c55e', order: 16, defaultEmployee: '' },
    ],
    employees: [
      { id: 'e1', name: 'Gaspar', isActive: true },
      { id: 'e2', name: 'Aldo', isActive: true },
      { id: 'e3', name: 'Mazo', isActive: true },
      { id: 'e4', name: 'Arturo', isActive: true },
      { id: 'e5', name: 'German', isActive: true },
      { id: 'e6', name: 'Romulo', isActive: true },
      { id: 'e7', name: 'Meno', isActive: true },
      { id: 'e8', name: 'Estrada', isActive: true },
      { id: 'e9', name: 'JR', isActive: true },
      { id: 'e10', name: 'Daniel', isActive: true },
      { id: 'e11', name: 'Fedex', isActive: true },
      { id: 'e12', name: 'Chito', isActive: true },
      { id: 'e13', name: 'All', isActive: true },
    ],
  };
  
  // Save default data to disk
  saveDB(defaultData);
  
  return defaultData;
}

function saveDB(data: Database): void {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Get next order number for a department
function getNextOrder(deptId: string): number {
  const db = loadDB();
  const deptJobs = db.jobs.filter(j => j.departmentId === deptId);
  if (deptJobs.length === 0) return 0;
  return Math.max(...deptJobs.map(j => j.order ?? 0)) + 1;
}

// Jobs database operations
export const jobsDB = {
  findAll: (): StoredJob[] => {
    const db = loadDB();
    return db.jobs.sort((a, b) => {
      // First sort by department order, then by job order within department
      if (a.departmentId !== b.departmentId) {
        return a.departmentId.localeCompare(b.departmentId);
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });
  },
  
  findById: (id: string): StoredJob | null => {
    const db = loadDB();
    return db.jobs.find(j => j.id === id) || null;
  },
  
  create: (data: {
    title: string;
    description?: string;
    priority?: number;
    departmentId: string;
    assignedTo?: string;
    fileUrl?: string;
    fileName?: string;
    previewUrl?: string;
    pageCount?: number;
    notes?: string;
    // New fields
    jobNumber?: string;
    customer?: string;
    poNumber?: string;
    line?: string;
    dwgNumber?: string;
    partNumber?: string;
    dueDate?: string;
  }): StoredJob => {
    const db = loadDB();
    const id = generateId();
    const order = getNextOrder(data.departmentId);
    
    const job: StoredJob = {
      id,
      title: data.title,
      description: data.description,
      priority: data.priority || 3,
      departmentId: data.departmentId,
      order,
      assignedTo: data.assignedTo,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      previewUrl: data.previewUrl,
      pageCount: data.pageCount,
      notes: data.notes,
      inProgress: false,
      // New fields
      jobNumber: data.jobNumber,
      customer: data.customer,
      poNumber: data.poNumber,
      line: data.line,
      dwgNumber: data.dwgNumber,
      partNumber: data.partNumber,
      dueDate: data.dueDate,
      history: [{
        id: generateId(),
        jobId: id,
        toDeptId: data.departmentId,
        notes: '📄 Trabajo creado',
        timestamp: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.jobs.push(job);
    saveDB(db);
    return job;
  },
  
  update: (id: string, data: Partial<StoredJob>): StoredJob | null => {
    const db = loadDB();
    const index = db.jobs.findIndex(j => j.id === id);
    if (index === -1) return null;
    
    db.jobs[index] = {
      ...db.jobs[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    saveDB(db);
    return db.jobs[index];
  },
  
  reorder: (jobId: string, targetDeptId: string, newOrder: number): StoredJob | null => {
    const db = loadDB();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return null;
    
    // Get all jobs in the target department
    const deptJobs = db.jobs
      .filter(j => j.departmentId === targetDeptId && j.id !== jobId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    // Update the moved job
    job.departmentId = targetDeptId;
    job.order = newOrder;
    job.updatedAt = new Date().toISOString();
    
    // Reorder all jobs in the department
    let currentOrder = 0;
    for (const j of deptJobs) {
      if (currentOrder === newOrder) {
        currentOrder++;
      }
      j.order = currentOrder;
      currentOrder++;
    }
    
    saveDB(db);
    return job;
  },
  
  addHistory: (jobId: string, entry: {
    fromDeptId?: string;
    toDeptId: string;
    employeeId?: string;
    employeeName?: string;
    notes?: string;
  }): StoredJob | null => {
    const db = loadDB();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return null;
    
    job.history.push({
      id: generateId(),
      jobId,
      fromDeptId: entry.fromDeptId,
      toDeptId: entry.toDeptId,
      employeeId: entry.employeeId,
      employeeName: entry.employeeName,
      notes: entry.notes,
      timestamp: new Date().toISOString(),
    });
    job.updatedAt = new Date().toISOString();
    saveDB(db);
    return job;
  },
  
  addAnnotation: (jobId: string, annotation: string): StoredJob | null => {
    const db = loadDB();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return null;
    
    job.history.push({
      id: generateId(),
      jobId,
      toDeptId: job.departmentId,
      notes: annotation,
      timestamp: new Date().toISOString(),
    });
    job.updatedAt = new Date().toISOString();
    saveDB(db);
    return job;
  },
  
  toggleInProgress: (jobId: string): StoredJob | null => {
    const db = loadDB();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return null;
    
    job.inProgress = !job.inProgress;
    job.inProgressAt = job.inProgress ? new Date().toISOString() : undefined;
    
    // Add history entry
    job.history.push({
      id: generateId(),
      jobId,
      toDeptId: job.departmentId,
      notes: job.inProgress ? '🔥 In Progress iniciado' : '⏸️ In Progress detenido',
      timestamp: new Date().toISOString(),
    });
    
    job.updatedAt = new Date().toISOString();
    saveDB(db);
    return job;
  },
  
  delete: (id: string): boolean => {
    const db = loadDB();
    const index = db.jobs.findIndex(j => j.id === id);
    if (index === -1) return false;
    db.jobs.splice(index, 1);
    saveDB(db);
    return true;
  },
  
  deleteAll: (): void => {
    const db = loadDB();
    db.jobs = [];
    saveDB(db);
  },
};

// Departments operations
export const departmentsDB = {
  findAll: (): StoredDepartment[] => {
    const db = loadDB();
    return db.departments.sort((a, b) => a.order - b.order);
  },
  
  update: (id: string, data: Partial<StoredDepartment>): StoredDepartment | null => {
    const db = loadDB();
    const index = db.departments.findIndex(d => d.id === id);
    if (index === -1) return null;
    db.departments[index] = { ...db.departments[index], ...data };
    saveDB(db);
    return db.departments[index];
  },
};

// Employees operations
export const employeesDB = {
  findAll: (): StoredEmployee[] => {
    const db = loadDB();
    return db.employees.filter(e => e.isActive).sort((a, b) => a.name.localeCompare(b.name));
  },
  
  findById: (id: string): StoredEmployee | null => {
    const db = loadDB();
    return db.employees.find(e => e.id === id) || null;
  },
};

// Seed default data
export const seedDB = (): void => {
  if (!fs.existsSync(DB_PATH)) {
    saveDB({
      jobs: [],
      departments: [
        { id: 'd1', name: 'NEW MATERIAL', color: '#f59e0b', order: 0, defaultEmployee: 'Gaspar' },
        { id: 'd2', name: 'Cut Saw (Segueta)', color: '#ef4444', order: 1, defaultEmployee: 'Gaspar' },
        { id: 'd3', name: 'WOOD PALLET', color: '#8b5cf6', order: 2, defaultEmployee: 'All' },
        { id: 'd4', name: 'Night shift', color: '#1e293b', order: 3, defaultEmployee: 'Aldo' },
        { id: 'd5', name: 'BLUE PALLET', color: '#3b82f6', order: 4, defaultEmployee: 'All' },
        { id: 'd6', name: 'ARTURO', color: '#10b981', order: 5, defaultEmployee: 'Arturo' },
        { id: 'd7', name: 'GERMAN', color: '#f97316', order: 6, defaultEmployee: 'German' },
        { id: 'd8', name: 'ROMULO', color: '#06b6d4', order: 7, defaultEmployee: 'Romulo' },
        { id: 'd9', name: 'LATHE DEBURR', color: '#84cc16', order: 8, defaultEmployee: 'Meno' },
        { id: 'd10', name: 'LATHE INSPECTION', color: '#eab308', order: 9, defaultEmployee: 'Estrada' },
        { id: 'd11', name: 'MILL', color: '#ec4899', order: 10, defaultEmployee: 'JR' },
        { id: 'd12', name: 'MILL DEBURR', color: '#a855f7', order: 11, defaultEmployee: 'Meno' },
        { id: 'd13', name: 'FINAL INSPECTION', color: '#14b8a6', order: 12, defaultEmployee: 'Estrada' },
        { id: 'd14', name: 'STAMP', color: '#f43f5e', order: 13, defaultEmployee: 'Chito' },
        { id: 'd15', name: 'NDE', color: '#6366f1', order: 14, defaultEmployee: '' },
        { id: 'd16', name: 'O.S', color: '#0ea5e9', order: 15, defaultEmployee: '' },
        { id: 'd17', name: 'READY TO SHIP', color: '#22c55e', order: 16, defaultEmployee: '' },
      ],
      employees: [
        { id: 'e1', name: 'Gaspar', isActive: true },
        { id: 'e2', name: 'Aldo', isActive: true },
        { id: 'e3', name: 'Mazo', isActive: true },
        { id: 'e4', name: 'Arturo', isActive: true },
        { id: 'e5', name: 'German', isActive: true },
        { id: 'e6', name: 'Romulo', isActive: true },
        { id: 'e7', name: 'Meno', isActive: true },
        { id: 'e8', name: 'Estrada', isActive: true },
        { id: 'e9', name: 'JR', isActive: true },
        { id: 'e10', name: 'Daniel', isActive: true },
        { id: 'e11', name: 'Fedex', isActive: true },
        { id: 'e12', name: 'Chito', isActive: true },
        { id: 'e13', name: 'All', isActive: true },
      ],
    });
  }
};

// Reset departments to default
export const resetDepartments = (): StoredDepartment[] => {
  const db = loadDB();
  db.departments = [
    { id: 'd1', name: 'NEW MATERIAL', color: '#f59e0b', order: 0, defaultEmployee: 'Gaspar' },
    { id: 'd2', name: 'Cut Saw (Segueta)', color: '#ef4444', order: 1, defaultEmployee: 'Gaspar' },
    { id: 'd3', name: 'WOOD PALLET', color: '#8b5cf6', order: 2, defaultEmployee: 'All' },
    { id: 'd4', name: 'Night shift', color: '#1e293b', order: 3, defaultEmployee: 'Aldo' },
    { id: 'd5', name: 'BLUE PALLET', color: '#3b82f6', order: 4, defaultEmployee: 'All' },
    { id: 'd6', name: 'ARTURO', color: '#10b981', order: 5, defaultEmployee: 'Arturo' },
    { id: 'd7', name: 'GERMAN', color: '#f97316', order: 6, defaultEmployee: 'German' },
    { id: 'd8', name: 'ROMULO', color: '#06b6d4', order: 7, defaultEmployee: 'Romulo' },
    { id: 'd9', name: 'LATHE DEBURR', color: '#84cc16', order: 8, defaultEmployee: 'Meno' },
    { id: 'd10', name: 'LATHE INSPECTION', color: '#eab308', order: 9, defaultEmployee: 'Estrada' },
    { id: 'd11', name: 'MILL', color: '#ec4899', order: 10, defaultEmployee: 'JR' },
    { id: 'd12', name: 'MILL DEBURR', color: '#a855f7', order: 11, defaultEmployee: 'Meno' },
    { id: 'd13', name: 'FINAL INSPECTION', color: '#14b8a6', order: 12, defaultEmployee: 'Estrada' },
    { id: 'd14', name: 'STAMP', color: '#f43f5e', order: 13, defaultEmployee: 'Chito' },
    { id: 'd15', name: 'NDE', color: '#6366f1', order: 14, defaultEmployee: '' },
    { id: 'd16', name: 'O.S', color: '#0ea5e9', order: 15, defaultEmployee: '' },
    { id: 'd17', name: 'READY TO SHIP', color: '#22c55e', order: 16, defaultEmployee: '' },
  ];
  saveDB(db);
  return db.departments;
};
