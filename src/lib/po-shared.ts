/**
 * PO helpers shared by the server and the browser: the Access value lists,
 * what a PO does to the job (NDE / outside service / nothing), the board note,
 * and small formatters.
 */
import type { PoKind, PoLine, PurchaseOrder, PoSupplier } from '@/types/po';

// ---- Value lists from the Access form (free text is still allowed) ----

// Most-used Descriptions in the Access data, plus the form's own list.
export const DESCRIPTION_OPTIONS = [
  'RAW MATERIAL',
  'NEW MATERIAL',
  'TOOLING',
  'COATING',
  'WET MAG',
  'LP',
  'PHOSPHATE',
  'HEAT TREAT',
  'HEATTREAT & CARB',
  'CARBURIZE',
  'DRILLING & HONE',
  'DRILL // HONE',
  'DRILL',
  'HONE',
  'EDM',
  'QPQ',
  'WET MAG & PHOSPHATE',
  'TESTING',
  'CALIBRATION',
  'SUPPLIES',
  'MAINTENANCE',
  'THREAD PROTECTORS',
];
export const HOT_RUSH_OPTIONS = ['HO-HOT', 'HOT-RUSH PLEASE', 'HOT-HOT-HOT', 'NEED BACK,SAME DAY'];
export const MATERIAL_CONDITION_OPTIONS = [
  'N/A',
  'MATERIAL-ANNELLED',
  'MATERIAL BY SPEC',
  'MATERIAL FOR REFERENCE ONLY',
];
export const EMPLOYEE_RECEIVED_OPTIONS = ['GASPAR', 'KARINA', 'MARK', 'WILLIE'];
export const STATUS_OPTIONS = ['OPEN', 'CLOSED', 'PENDING', 'VOID'] as const;
/**
 * ACTIVE follows OPEN // CLOSE: CLOSED, PENDING or VOID take the PO off OUTSIDE
 * (it goes to OLD FILES); OPEN puts it back. Blank leaves ACTIVE as it is.
 */
export function activeForStatus(status: string | null | undefined): boolean | null {
  if (status === 'OPEN') return true;
  if (status === 'CLOSED' || status === 'PENDING' || status === 'VOID') return false;
  return null;
}
export const CITY_OPTIONS = ['HOUSTON', 'KATY', 'TOMBALL', 'SUGARLAND', 'PEARLAND'];
export const STATE_OPTIONS = ['TX', 'NY'];

// ---- What the PO does to the job ----

const NDE_RE = /\b(WET\s*MAG|MAG\s*PART\w*|MPI|LP|LPI|LIQUID\s*PEN\w*|PENETRANT|NDE|NDT|TESTING|TEST\s*PC|ULTRASONIC|X-?RAY)\b/;
const NONE_RE = /\b(RAW\s*MAT\w*|NEW\s*MAT\w*|MATERIAL|MAT|TOOLING|TOOLS?|SUPPLIES|SUPPLY|MAINTENANCE|CALIBRATION|THREAD\s*PROTECTORS?|INSERTS?|BAR\s*STOCK)\b/;
const OS_RE = /(COAT|PHOSPHAT|PLAT(E|ING)|HEAT\s*-?\s*TREAT|HEATTREAT|CARB|NITRID|QPQ|DRILL|HONE|HONING|EDM|PEEN|ANODIZ|PAINT|GRIND|BLAST|THREAD\s*ROLL|STRESS\s*RELIE|PASSIVAT|CHROME|XYLAN|IMPREGLON|BORING|WELD|LAP\b|LAPPING|BLACK\s*OXIDE|CADMIUM|ZINC|NICKEL|MOLY|TEFLON|SANDBLAST|NORMALIZ|ANNEAL|TEMPER|OUTSIDE\s*SERVICE|O\/S)/;

/** What a Description alone says, or null when it doesn't tell. */
export function kindFromDescription(description: string): PoKind | null {
  const d = (description ?? '').toUpperCase();
  if (!d.trim()) return null;
  if (NDE_RE.test(d)) return 'nde';
  if (NONE_RE.test(d)) return 'none';
  if (OS_RE.test(d)) return 'os';
  return null;
}

/** The PO's effect on the job: its Description first, else its supplier's kind. */
export function poKind(po: Pick<PurchaseOrder, 'description'>, supplier?: Pick<PoSupplier, 'kind'> | null): PoKind {
  return kindFromDescription(po.description) ?? supplier?.kind ?? 'none';
}

export const KIND_LABEL: Record<PoKind, string> = {
  nde: 'NDE → board NDE, back to KARINA',
  os: 'Outside service → board O.S, back to READY TO SHIP (heat treat / stress relief, not carburized: WOOD PALLET; EDM: KARINA)',
  none: "Material / tooling (doesn't move the job)",
};

// Heat treat and stress relief come back to WOOD PALLET (more machining to do);
// carburized parts are done, so they go to READY TO SHIP.
const CARB_RE = /CARB/;
// EDM comes back to KARINA.
const EDM_RE = /\bEDM\b/;
const HEAT_RE = /(HEAT\s*-?\s*TREAT|HEATTREAT|\bH\s*\/\s*T\b|STRESS\s*-?\s*RELIE)/;

/**
 * Board department a job goes back to when the PO is received (null = it doesn't move).
 * The Description decides; when it names no process (e.g. just a spec), a heat
 * treat supplier's name (HOUSTON HEAT TREAT...) does. Anything carburized
 * (CARBURIZE, HEATTREAT & CARB) goes to READY TO SHIP.
 */
export function returnDeptName(
  kind: PoKind,
  description: string | null | undefined,
  supplierName?: string | null
): 'KARINA' | 'WOOD PALLET' | 'READY TO SHIP' | null {
  if (kind === 'nde') return 'KARINA';
  if (kind !== 'os') return null;
  const d = String(description ?? '').toUpperCase();
  const s = String(supplierName ?? '').toUpperCase();
  const noProcess = kindFromDescription(d) === null;
  if (EDM_RE.test(d) || (noProcess && EDM_RE.test(s))) return 'KARINA';
  if (CARB_RE.test(d)) return 'READY TO SHIP';
  const heat = HEAT_RE.test(d) || (noProcess && HEAT_RE.test(s));
  return heat ? 'WOOD PALLET' : 'READY TO SHIP';
}

/** The PO form's one-line label for this PO's description. */
export function kindLabelFor(kind: PoKind, description: string | null | undefined, supplierName?: string | null): string {
  if (kind !== 'os') return KIND_LABEL[kind];
  return `Outside service → board O.S, back to ${returnDeptName(kind, description, supplierName)}`;
}

// ---- Numbers, dates, notes ----

export const lineSubtotal = (l: PoLine) => (Number(l.units) || 0) * (Number(l.unitPrice) || 0);
export const poTotal = (lines: PoLine[]) => lines.reduce((s, l) => s + lineSubtotal(l), 0);

/** Distinct JOB#s (digits only) written in the WO column. */
export function workOrdersOf(lines: PoLine[]): string[] {
  const out = new Set<string>();
  for (const l of lines) {
    for (const part of String(l.wo ?? '').split(/[\s,/&;]+/)) {
      const digits = part.replace(/\D/g, '');
      if (digits.length >= 3) out.add(digits);
    }
  }
  return [...out];
}

export const money = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** "2026-11-19" -> "11/19/2026" (Access Short Date). */
export function usDate(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

/** "2026-11-19" -> "11/19" (the board notes use month/day). */
export function monthDay(iso?: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[1]}/${m[2]}` : '';
}

// The shop's clock (the server runs in UTC).
const SHOP_TZ = 'America/Chicago';

/** Shop-local today as YYYY-MM-DD. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Shop-local time now as HH:MM:SS (Access TIME ORDER). */
export function nowTime(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
}

/** "09:16:20" -> "9:16:20 AM". */
export function time12(t?: string): string {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t ?? '');
  if (!m) return '';
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]}${m[3] ? `:${m[3]}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Access "DAYS OVER" = today - Date Required (negative = days left). */
export function daysOver(eta?: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(eta ?? '');
  if (!m) return null;
  const due = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const t = todayIso().split('-').map(Number);
  const now = Date.UTC(t[0], t[1] - 1, t[2]);
  return Math.round((now - due) / 86400000);
}

/** Board note when the job goes out: "@ HOUSTON PLATING HUMBLE 11/19 PO# 57258 ETA 11/30". */
export function poSentNote(po: Pick<PurchaseOrder, 'supplierName' | 'orderDate' | 'poNumber' | 'eta'>): string {
  return [
    `@ ${(po.supplierName || '?').toUpperCase()}`,
    monthDay(po.orderDate),
    `PO# ${po.poNumber}`,
    po.eta && `ETA ${monthDay(po.eta)}`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Board note when the job comes back. */
export function poBackNote(po: Pick<PurchaseOrder, 'supplierName' | 'receivedDate' | 'poNumber'>): string {
  return `BACK FROM ${(po.supplierName || '?').toUpperCase()} ${monthDay(po.receivedDate)} PO# ${po.poNumber}`.replace(/\s+/g, ' ');
}

export const employeeLabel = (e?: { firstName?: string; lastName?: string } | null) =>
  e ? [e.lastName, e.firstName].filter(Boolean).join(', ') : '';
