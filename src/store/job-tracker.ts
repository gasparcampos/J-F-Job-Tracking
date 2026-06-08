import { create } from 'zustand';
import type { Job, Department, Employee } from '@/types';

interface JobTrackerState {
  viewMode: 'kanban' | 'table';
  selectedJob: Job | null;
  historyJob: Job | null;
  isAddingJob: boolean;
  isMovingJob: boolean;
  movingJobId: string | null;
  targetDeptId: string | null;
  
  // Actions
  setViewMode: (mode: 'kanban' | 'table') => void;
  setSelectedJob: (job: Job | null) => void;
  setHistoryJob: (job: Job | null) => void;
  setIsAddingJob: (isAdding: boolean) => void;
  startMovingJob: (jobId: string, targetDeptId: string) => void;
  cancelMovingJob: () => void;
}

export const useJobTrackerStore = create<JobTrackerState>((set) => ({
  viewMode: 'kanban',
  selectedJob: null,
  historyJob: null,
  isAddingJob: false,
  isMovingJob: false,
  movingJobId: null,
  targetDeptId: null,
  
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedJob: (job) => set({ selectedJob: job }),
  setHistoryJob: (job) => set({ historyJob: job }),
  setIsAddingJob: (isAdding) => set({ isAddingJob: isAdding }),
  startMovingJob: (jobId, targetDeptId) => set({ 
    isMovingJob: true, 
    movingJobId: jobId, 
    targetDeptId 
  }),
  cancelMovingJob: () => set({ 
    isMovingJob: false, 
    movingJobId: null, 
    targetDeptId: null 
  }),
}));
