/**
 * Who a job is assigned to when it lands in each area (by department name,
 * uppercased). Used by the server (enforced on every move) and by the move
 * dialogs (what they show / ask).
 *
 *  - fixed:  always this person.
 *  - none:   nobody (the job sits unassigned there).
 *  - choice: one of these people; the move dialog asks which one.
 *
 * Areas not listed keep whoever the mover picked.
 */
export type DeptAssignment =
  | { kind: 'fixed'; name: string }
  | { kind: 'none' }
  | { kind: 'choice'; names: string[] };

export const DEPT_ASSIGNMENTS: Record<string, DeptAssignment> = {
  'NEW MATERIAL': { kind: 'fixed', name: 'Gaspar' },
  'WOOD PALLET': { kind: 'none' },
  'NIGHT SHIFT': { kind: 'choice', names: ['Aldo', 'Mazo'] },
  'BLUE PALLET': { kind: 'none' },
  'CNC LATHE 1': { kind: 'fixed', name: 'German' },
  // Víctor is "Romulo" in the employee list.
  'MANUAL LATHE': { kind: 'fixed', name: 'Romulo' },
  // José Meño.
  'LATHE DEBURR': { kind: 'fixed', name: 'Meno' },
  'MILL DEBURR': { kind: 'fixed', name: 'Meno' },
  // José Estrada.
  'LATHE INSPECTION': { kind: 'fixed', name: 'Estrada' },
  'FINAL INSPECTION': { kind: 'fixed', name: 'Estrada' },
  // Junior, Ángel, Federico ("Fedex").
  MILL: { kind: 'choice', names: ['JR', 'Ángel', 'Fedex'] },
  // Karina handles everything from here to shipping.
  KARINA: { kind: 'fixed', name: 'Karina' },
  STAMP: { kind: 'fixed', name: 'Karina' },
  NDE: { kind: 'fixed', name: 'Karina' },
  'O.S': { kind: 'fixed', name: 'Karina' },
  'READY TO SHIP': { kind: 'fixed', name: 'Karina' },
};

export function assignmentForDept(deptName?: string | null): DeptAssignment | undefined {
  return deptName ? DEPT_ASSIGNMENTS[deptName.trim().toUpperCase()] : undefined;
}

// Names compare without case/accents ("Angel" = "Ángel").
const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Assignee a job must have after moving into `deptName`, given who the mover
 * picked (`requested`). Returns undefined when the area has no rule.
 * For a `choice` area, a pick outside the list becomes '' (unassigned).
 */
export function resolveAssignee(deptName: string | undefined, requested: string | undefined): string | undefined {
  const rule = assignmentForDept(deptName);
  if (!rule) return undefined;
  if (rule.kind === 'fixed') return rule.name;
  if (rule.kind === 'none') return '';
  const pick = rule.names.find((n) => fold(n) === fold(requested ?? ''));
  return pick ?? '';
}
