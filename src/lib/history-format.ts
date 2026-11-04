import type { Department, JobHistoryEntry } from '@/types';

export interface DeptLabel {
  name: string;
  color: string;
}

const FALLBACK_COLOR = '#f97316';

/** Name + color of a department for a history entry (stored name first). */
export function deptLabel(
  departments: Department[],
  id: string | undefined,
  storedName?: string
): DeptLabel | null {
  if (!id && !storedName) return null;
  const d = id ? departments.find((x) => x.id === id) : undefined;
  return {
    name: storedName || d?.name || 'Unknown area',
    color: d?.color || FALLBACK_COLOR,
  };
}

/**
 * If the entry is a department move, returns the from/to labels, else null.
 * Works for old entries too (they store the department ids).
 */
export function moveInfo(
  entry: JobHistoryEntry,
  departments: Department[]
): { from: DeptLabel; to: DeptLabel } | null {
  if (!entry.fromDeptId || entry.fromDeptId === entry.toDeptId) return null;
  const from = deptLabel(departments, entry.fromDeptId, entry.fromDeptName);
  const to = deptLabel(departments, entry.toDeptId, entry.toDeptName);
  if (!from || !to) return null;
  return { from, to };
}
