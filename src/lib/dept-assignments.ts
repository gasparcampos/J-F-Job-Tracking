/**
 * Who a job is assigned to when it lands in each area (by department name,
 * uppercased). Used by the server (enforced on every move) and by the move
 * dialogs (what they show / ask).
 *
 *  - fixed:  always this person.
 *  - none:   nobody (the job sits unassigned there).
 *  - choice: one of these people; the move dialog asks which one.
 *  - machinists: optional, but only someone with the machinist role (admins
 *    don't machine); the dialog lists just them.
 *
 * Areas not listed keep whoever the mover picked.
 */
export type DeptAssignment =
  | { kind: 'fixed'; name: string }
  | { kind: 'none' }
  | { kind: 'choice'; names: string[] }
  | { kind: 'machinists' };

export const DEPT_ASSIGNMENTS: Record<string, DeptAssignment> = {
  'NEW MATERIAL': { kind: 'fixed', name: 'Gaspar' },
  'WOOD PALLET': { kind: 'machinists' },
  'NIGHT SHIFT': { kind: 'choice', names: ['Aldo', 'Francisco'] },
  'BLUE PALLET': { kind: 'machinists' },
  'CNC LATHE 1': { kind: 'fixed', name: 'German' },
  // Víctor is "Romulo" in the employee list.
  'MANUAL LATHE': { kind: 'fixed', name: 'Romulo' },
  // José Sena (was "Meno").
  'LATHE DEBURR': { kind: 'fixed', name: 'José Sena' },
  'MILL DEBURR': { kind: 'fixed', name: 'José Sena' },
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
 * For a `machinists` area, `machinistNames` is the allowed list (anyone else
 * becomes ''); without it the area isn't enforced.
 */
export function resolveAssignee(
  deptName: string | undefined,
  requested: string | undefined,
  machinistNames?: string[],
): string | undefined {
  const rule = assignmentForDept(deptName);
  if (!rule) return undefined;
  if (rule.kind === 'fixed') return rule.name;
  if (rule.kind === 'none') return '';
  if (rule.kind === 'machinists') {
    if (!machinistNames) return undefined;
    return machinistNames.find((n) => fold(n) === fold(requested ?? '')) ?? '';
  }
  const pick = rule.names.find((n) => fold(n) === fold(requested ?? ''));
  return pick ?? '';
}
