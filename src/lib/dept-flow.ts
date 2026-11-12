import type { Department } from '@/types';

/**
 * How jobs flow between columns. Shared by the admin dashboard, the
 * machinists' floor screen and the API (which checks that a machinist only
 * completes a job into one of the allowed targets).
 */

// Columns hidden from the board for now. Nothing is deleted — the department
// and any jobs inside it stay saved in Firestore; just remove the name from
// this set to show the column again.
export const HIDDEN_DEPARTMENT_NAMES = new Set(['ARTURO', 'CUT SAW (SEGUETA)']);
export const visibleDepartments = (list: Department[]) =>
  list.filter((d) => !HIDDEN_DEPARTMENT_NAMES.has(d.name.trim().toUpperCase()));

// Columns that are just hand-off stages: their cards show ONLY the Move button
// (no Progress / no Complete). The operator only routes the job onward from here.
// Karina's five areas (KARINA, STAMP, NDE, O.S, READY TO SHIP) are Move-only
// too; READY TO SHIP also gets Ship. Jobs entering them are auto-assigned to
// Karina server-side (see KARINA_DEPARTMENT_NAMES in lib/json-db.ts).
export const MOVE_ONLY_DEPARTMENT_NAMES = new Set([
  'NEW MATERIAL',
  'WOOD PALLET',
  'BLUE PALLET',
  'KARINA',
  'STAMP',
  'NDE',
  'O.S',
  'READY TO SHIP',
]);

// Production columns that follow a strict flow: cards show ONLY Progress +
// Complete (no Move). The job advances through Complete, not manual moves.
export const NO_MOVE_DEPARTMENT_NAMES = new Set([
  'NIGHT SHIFT',
  'CNC LATHE 1',
  'MANUAL LATHE',
  'LATHE DEBURR',
  'LATHE INSPECTION',
  'MILL',
  'MILL DEBURR',
  'FINAL INSPECTION',
]);

// When Complete is pressed in a given column, force the job into this target
// column (by name) instead of just the next one in order. Keeps the default
// destination correct even if columns are hidden or reordered.
export const COMPLETE_TARGET_OVERRIDES: Record<string, string> = {
  'NIGHT SHIFT': 'BLUE PALLET',
  'CNC LATHE 1': 'LATHE DEBURR',
  'MANUAL LATHE': 'LATHE DEBURR',
  'LATHE DEBURR': 'LATHE INSPECTION',
  'STAMP': 'KARINA',
};

// When Complete is pressed in these columns, pop up a small picker so the
// operator chooses between the listed target columns instead of a single
// default (e.g. Lathe Inspection → Mill or Karina).
export const COMPLETE_CHOICE_OVERRIDES: Record<string, string[]> = {
  'LATHE INSPECTION': ['MILL', 'KARINA', 'STAMP'],
  'FINAL INSPECTION': ['KARINA', 'STAMP'],
};

const upper = (s?: string) => (s ?? '').trim().toUpperCase();

/**
 * Where Complete may send a job sitting in `deptId`, given the visible
 * columns in board order. One target = go straight there; several = the
 * operator picks; none = already at the last stage.
 */
export function completeTargets(deptId: string, departments: Department[]): Department[] {
  const current = departments.find((d) => d.id === deptId);
  const name = upper(current?.name);

  const choice = COMPLETE_CHOICE_OVERRIDES[name];
  if (choice) {
    const targets = choice
      .map((n) => departments.find((d) => upper(d.name) === n))
      .filter((d): d is Department => !!d && d.id !== deptId);
    if (targets.length) return targets;
  }

  const override = COMPLETE_TARGET_OVERRIDES[name];
  if (override) {
    const t = departments.find((d) => upper(d.name) === override);
    if (t && t.id !== deptId) return [t];
  }

  const i = departments.findIndex((d) => d.id === deptId);
  return i >= 0 && i < departments.length - 1 ? [departments[i + 1]] : [];
}
