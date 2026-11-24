/**
 * Purchase Orders for the assistants (text chat and Jarvis): the PO snapshot
 * in the prompt, the PO tools, and how each tool call becomes a confirmable
 * action (or a plain answer, for lookups). Saving a PO moves its jobs on the
 * board by itself (lib/po-automation.ts).
 */
import { purchaseOrdersDB, poLookupsDB } from './po-db';
import {
  EMPLOYEE_RECEIVED_OPTIONS,
  daysOver,
  employeeLabel,
  money,
  poKind,
  todayIso,
  usDate,
} from './po-shared';
import type { AssistantAction } from '@/types';
import type { PoSummary, PurchaseOrder } from '@/types/po';

type Lang = 'es' | 'en';
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

export const PO_TOOL_NAMES = new Set([
  'find_purchase_orders',
  'create_purchase_order',
  'receive_purchase_order',
  'update_purchase_order',
]);

export function buildPoTools() {
  const poNumber = { type: 'string', description: 'The PO number (e.g. 57258).' };
  return [
    fn(
      'find_purchase_orders',
      'Look up Purchase Orders (any age, including old ones not in the snapshot) by PO number, JOB# (WO), supplier, part/DWG#, HT# or text. Returns the matching POs to read to the user.',
      { query: { type: 'string', description: 'PO#, JOB#, supplier name, part#, HT# or words.' } },
      ['query']
    ),
    fn(
      'create_purchase_order',
      'Create a new Purchase Order. Saving it moves each WO (JOB#) on the board automatically (NDE work to NDE, outside service to O.S). Ask for any required detail that is missing (supplier, description, ETA, who authorizes it).',
      {
        supplier: { type: 'string', description: 'Supplier name as the user said it.' },
        description: { type: 'string', description: 'PO Description, e.g. COATING, WET MAG, PHOSPHATE, RAW MATERIAL, TOOLING.' },
        eta: { type: 'string', description: 'ETA / date required, YYYY-MM-DD.' },
        authorized_by: { type: 'string', description: 'Employee who authorizes the PO (first or last name).' },
        shipping_method: { type: 'string', description: 'e.g. OUR TRUCK, VENDOR DELIVERY, UPS, HOT SHOT. Default OUR TRUCK.' },
        hot_rush: { type: 'string', description: 'Optional rush flag, e.g. HOT-RUSH PLEASE.' },
        notes: { type: 'string' },
        lines: {
          type: 'array',
          description: 'PO lines.',
          items: {
            type: 'object',
            properties: {
              wo: { type: 'string', description: 'JOB# the line is for.' },
              units: { type: 'number' },
              prod_descrip: { type: 'string', description: 'What it is (part name / material size).' },
              spec: { type: 'string' },
              part_number: { type: 'string' },
              rev: { type: 'string' },
              unit_price: { type: 'number' },
            },
          },
        },
      },
      ['supplier', 'description', 'eta']
    ),
    fn(
      'receive_purchase_order',
      'Mark a Purchase Order as received (it arrived back). The jobs come back on the board automatically: from NDE to KARINA, from O.S to READY TO SHIP.',
      {
        po_number: poNumber,
        received_by: { type: 'string', description: `Who received it: ${EMPLOYEE_RECEIVED_OPTIONS.join(', ')} or another name.` },
      },
      ['po_number', 'received_by']
    ),
    fn(
      'update_purchase_order',
      'Change fields on a Purchase Order. Only include what the user asked to change.',
      {
        po_number: poNumber,
        eta: { type: 'string', description: 'New ETA, YYYY-MM-DD.' },
        notes: { type: 'string', description: 'PO NOTES (replaces them).' },
        status: { type: 'string', enum: ['OPEN', 'CLOSED', 'PENDING', 'VOID'] },
        hot_rush: { type: 'string' },
        heat_number: { type: 'string', description: 'HT#' },
      },
      ['po_number']
    ),
  ];
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const squash = (s: unknown) => norm(s).replace(/[^a-z0-9]/g, '');

function describe(p: PoSummary | PurchaseOrder, lang: Lang): string {
  const t = (es: string, en: string) => (lang === 'es' ? es : en);
  const d = daysOver(p.eta);
  const state = p.receivedDate
    ? t(`recibido ${usDate(p.receivedDate)}${p.employeeReceived ? ` por ${p.employeeReceived}` : ''}`, `received ${usDate(p.receivedDate)}${p.employeeReceived ? ` by ${p.employeeReceived}` : ''}`)
    : p.active
    ? t(`AFUERA, ETA ${usDate(p.eta)}${d && d > 0 ? ` (${d} días tarde)` : ''}`, `OUT, ETA ${usDate(p.eta)}${d && d > 0 ? ` (${d} days late)` : ''}`)
    : p.status || t('cerrado', 'closed');
  return [
    `PO# ${p.poNumber}`,
    p.supplierName,
    p.description,
    p.workOrders.length ? `WO ${p.workOrders.join(', ')}` : null,
    `${t('ordenado', 'ordered')} ${usDate(p.orderDate)}`,
    state,
    p.total ? money(p.total) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Snapshot for the prompt: POs still out, plus what came back this week. */
export async function buildPoContext(): Promise<string> {
  try {
    const all = await purchaseOrdersDB.summaries();
    const today = todayIso();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const out = all.filter((p) => p.active);
    const back = all.filter((p) => p.receivedDate && p.receivedDate >= weekAgo).slice(0, 30);
    const made = all.filter((p) => p.orderDate === today).length;
    const lines = [
      `\n\nPURCHASE ORDERS (today ${today}: ${made} made, ${all.filter((p) => p.receivedDate === today).length} received; next PO number ${(all[0]?.poNumber ?? 0) + 1}).`,
      'POs still OUT (active, waiting to come back):',
      ...(out.length ? out.map((p) => `- ${describe(p, 'en')}`) : ['- none']),
      'Received in the last 7 days:',
      ...(back.length ? back.map((p) => `- ${describe(p, 'en')}`) : ['- none']),
      'Older POs: use find_purchase_orders.',
    ];
    return lines.join('\n');
  } catch {
    return '';
  }
}

export interface PoResolution {
  actions: AssistantAction[];
  errors: string[];
  info: string[];
}

/** One PO tool call -> a confirmable action, an answer, or a question back. */
export async function resolvePoCall(name: string, args: Record<string, any>, lang: Lang, out: PoResolution): Promise<void> {
  const t = (es: string, en: string) => (lang === 'es' ? es : en);

  if (name === 'find_purchase_orders') {
    const q = norm(args.query);
    const digits = q.replace(/\D/g, '');
    const all = await purchaseOrdersDB.summaries();
    const hits = all.filter(
      (p) =>
        (digits && (String(p.poNumber) === digits || p.workOrders.includes(digits))) ||
        (q.length >= 3 &&
          (norm(p.supplierName).includes(q) ||
            squash(p.partDwg).includes(squash(q)) ||
            norm(p.heatNumber) === q ||
            norm(p.description).includes(q) ||
            norm(p.lineText).includes(q)))
    );
    out.info.push(
      hits.length
        ? `${t('POs encontrados', 'POs found')} (${hits.length}${hits.length > 8 ? t(', los 8 más recientes', ', newest 8') : ''}):\n` +
            hits.slice(0, 8).map((p) => `• ${describe(p, lang)}`).join('\n')
        : t(`No encontré POs para "${args.query}".`, `No POs found for "${args.query}".`)
    );
    return;
  }

  const lookups = await poLookupsDB.all();

  if (name === 'create_purchase_order') {
    const sq = squash(args.supplier);
    const suppliers = lookups.suppliers.filter((s) => squash(s.name) === sq);
    const loose = suppliers.length ? suppliers : lookups.suppliers.filter((s) => sq && squash(s.name).includes(sq));
    if (loose.length !== 1) {
      out.errors.push(
        loose.length
          ? t(`¿Cuál supplier? ${loose.slice(0, 6).map((s) => s.name).join(', ')}`, `Which supplier? ${loose.slice(0, 6).map((s) => s.name).join(', ')}`)
          : t(`No encontré el supplier "${args.supplier}". Agrégalo en la pestaña POs → Suppliers.`, `Supplier "${args.supplier}" not found. Add it in POs → Suppliers.`)
      );
      return;
    }
    const supplier = loose[0];
    const who = norm(args.authorized_by);
    const emp = who
      ? lookups.employees.find((e) => norm(e.firstName) === who || norm(e.lastName) === who || norm(employeeLabel(e)).includes(who))
      : undefined;
    if (!emp) {
      out.errors.push(t('¿Quién autoriza el PO (Authorized By)?', 'Who authorizes the PO (Authorized By)?'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.eta ?? ''))) {
      out.errors.push(t('¿Cuál es el ETA (fecha en que regresa)?', "What's the ETA (date it comes back)?"));
      return;
    }
    const shipWanted = squash(args.shipping_method || 'OUR TRUCK');
    const ship = lookups.shippingMethods.find((m) => squash(m.name) === shipWanted) ?? lookups.shippingMethods.find((m) => squash(m.name).includes(shipWanted));
    const lines = (Array.isArray(args.lines) ? args.lines : []).map((l: Record<string, any>) => ({
      wo: String(l.wo ?? '').trim(),
      units: Number(l.units) || 1,
      prodDescrip: String(l.prod_descrip ?? '').trim(),
      spec: String(l.spec ?? '').trim(),
      partNumber: String(l.part_number ?? '').trim(),
      rev: String(l.rev ?? '').trim(),
      unitPrice: l.unit_price === undefined ? null : Number(l.unit_price) || 0,
    }));
    const description = String(args.description ?? '').trim().toUpperCase();
    const kind = poKind({ description }, supplier);
    const wos = lines.map((l: { wo: string }) => l.wo).filter(Boolean);
    const board =
      kind === 'none' || !wos.length
        ? ''
        : t(` → JOB# ${wos.join(', ')} a ${kind === 'nde' ? 'NDE' : 'O.S'}`, ` → JOB# ${wos.join(', ')} to ${kind === 'nde' ? 'NDE' : 'O.S'}`);
    out.actions.push({
      label: t(
        `Crear PO a ${supplier.name}: ${description}, ETA ${usDate(args.eta)}, autoriza ${employeeLabel(emp)}${board}`,
        `Create PO to ${supplier.name}: ${description}, ETA ${usDate(args.eta)}, authorized by ${employeeLabel(emp)}${board}`
      ),
      method: 'POST',
      path: '/api/pos',
      body: {
        supplierId: supplier.id,
        description,
        employeeId: emp.id,
        eta: args.eta,
        shippingMethodId: ship?.id ?? '',
        hotRush: args.hot_rush ?? '',
        notes: args.notes ?? '',
        materialCondition: 'N/A',
        lines,
        active: true,
      },
    });
    return;
  }

  // receive / update: an existing PO.
  const po = await purchaseOrdersDB.findById(String(args.po_number ?? '').replace(/\D/g, ''));
  if (!po) {
    out.errors.push(t(`No encontré el PO# ${args.po_number}.`, `Couldn't find PO# ${args.po_number}.`));
    return;
  }

  if (name === 'receive_purchase_order') {
    if (po.receivedDate) {
      out.errors.push(t(`El PO# ${po.poNumber} ya se recibió el ${usDate(po.receivedDate)}.`, `PO# ${po.poNumber} was already received on ${usDate(po.receivedDate)}.`));
      return;
    }
    const who = String(args.received_by ?? '').trim().toUpperCase();
    if (!who) {
      out.errors.push(t('¿Quién lo recibió?', 'Who received it?'));
      return;
    }
    const supplier = lookups.suppliers.find((s) => s.id === po.supplierId);
    const kind = poKind(po, supplier);
    const back =
      kind === 'none' || !po.workOrders.length
        ? ''
        : t(
            ` → JOB# ${po.workOrders.join(', ')} regresa a ${kind === 'nde' ? 'KARINA' : 'READY TO SHIP'}`,
            ` → JOB# ${po.workOrders.join(', ')} back to ${kind === 'nde' ? 'KARINA' : 'READY TO SHIP'}`
          );
    out.actions.push({
      label: t(`Recibir PO# ${po.poNumber} (${po.supplierName}), recibió ${who}${back}`, `Receive PO# ${po.poNumber} (${po.supplierName}), received by ${who}${back}`),
      method: 'PUT',
      path: `/api/pos/${po.id}`,
      body: { employeeReceived: who, receivedDate: todayIso(), active: false },
    });
    return;
  }

  if (name === 'update_purchase_order') {
    const body: Record<string, unknown> = {};
    const bits: string[] = [];
    if (args.eta) {
      body.eta = args.eta;
      bits.push(`ETA ${usDate(args.eta)}`);
    }
    if (args.notes !== undefined) {
      body.notes = args.notes;
      bits.push(t(`notas "${args.notes}"`, `notes "${args.notes}"`));
    }
    if (args.status) {
      body.status = args.status;
      bits.push(String(args.status));
    }
    if (args.hot_rush !== undefined) {
      body.hotRush = args.hot_rush;
      bits.push(`HOT-RUSH ${args.hot_rush}`);
    }
    if (args.heat_number !== undefined) {
      body.heatNumber = args.heat_number;
      bits.push(`HT# ${args.heat_number}`);
    }
    if (!bits.length) {
      out.errors.push(t(`¿Qué cambio en el PO# ${po.poNumber}?`, `What should change on PO# ${po.poNumber}?`));
      return;
    }
    out.actions.push({
      label: t(`PO# ${po.poNumber}: ${bits.join(', ')}`, `PO# ${po.poNumber}: ${bits.join(', ')}`),
      method: 'PUT',
      path: `/api/pos/${po.id}`,
      body,
    });
  }
}
