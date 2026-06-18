'use client';

import { X, Clock, User, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Job, Department } from '@/types';

interface HistoryModalProps {
  job: Job | null;
  departments: Department[];
  onClose: () => void;
}

export function HistoryModal({ job, departments, onClose }: HistoryModalProps) {
  if (!job) return null;

  // Newest entries first.
  const sortedHistory = [...job.history].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="flex-shrink-0 bg-card border-b border-border px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Clock size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-card-foreground">Full History</h3>
              <p className="text-[10px] text-muted-foreground">{job.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-muted p-2 rounded-lg transition-colors text-muted-foreground hover:text-card-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {sortedHistory.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium italic">No hay registros</p>
            </div>
          ) : (
            <div className="border-l-2 border-border ml-4 space-y-5">
              {sortedHistory.map((log, idx) => (
                <div key={log.id || idx} className="relative pl-8">
                  <div
                    className="absolute left-[-9px] top-1 w-4 h-4 rounded-full border-4 border-card shadow-md"
                    style={{ backgroundColor: departments.find((d) => d.id === log.toDeptId)?.color || '#f97316' }}
                  />
                  <div className="bg-muted/50 p-4 rounded-xl border border-border">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p
                          className="text-[10px] font-bold uppercase tracking-widest"
                          style={{ color: departments.find((d) => d.id === log.toDeptId)?.color || '#f97316' }}
                        >
                          {departments.find((d) => d.id === log.toDeptId)?.name || 'Desconocido'}
                        </p>
                        {log.employee && (
                          <div className="flex items-center gap-1.5 text-card-foreground mt-1">
                            <User size={12} />
                            <p className="text-xs font-semibold">{log.employee.name}</p>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground font-medium">
                          {new Date(log.timestamp).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    {log.notes && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <FileText size={10} />
                          <p className="text-[9px] font-semibold uppercase tracking-widest">Note</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{log.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-4 bg-card border-t border-border">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
