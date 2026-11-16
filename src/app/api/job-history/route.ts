import { NextRequest, NextResponse } from 'next/server';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { firestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

const PAGE = 50;

function toJob(d: QueryDocumentSnapshot<DocumentData>, full: boolean) {
  const j = d.data();
  return {
    id: d.id,
    title: j.title ?? '',
    priority: 0,
    departmentId: '',
    order: 0,
    jobNumber: j.jobNumber,
    name: j.name,
    customer: j.customer,
    poNumber: j.poNumber,
    line: j.line,
    quantity: j.quantity,
    dwgNumber: j.dwgNumber,
    partNumber: j.partNumber,
    dueDate: j.dueDate,
    materialPo: j.materialPo,
    heatNumber: j.heatNumber,
    hrc: j.hrc,
    outService: j.outService,
    productionNotes: j.productionNotes,
    shipped: true,
    shippedAt: j.shippedAt ?? '',
    fromHistory: true,
    ...(full ? { orderDate: j.orderDate ?? '', legacy: j.legacy ?? {} } : {}),
  };
}

/**
 * The Access job archive (`jobHistory`, imported from the MASTER table).
 * The archive is never loaded whole — only matching docs are read.
 *
 *   ?q=<3+ chars>          JOB#, DWG# or Part# prefix (precomputed `searchKeys`).
 *                          Returns a plain array (used by the Extra Parts /
 *                          Fixtures lookup).
 *   ?full=1&q=<text>       Same search plus a Company prefix match, with the
 *                          raw Access fields. Returns { items, next }.
 *   ?full=1 [&after=<id>]  Browse newest first (by due date), 50 per page.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = (params.get('q') ?? '').trim();
  const q = raw.toLowerCase();
  const full = params.get('full') === '1';
  const col = firestore.collection('jobHistory');

  try {
    if (!full) {
      if (q.length < 3) return NextResponse.json([]);
      const snap = await col.where('searchKeys', 'array-contains', q).limit(25).get();
      return NextResponse.json(snap.docs.map((d) => toJob(d, false)));
    }

    if (raw) {
      if (raw.length < 2) return NextResponse.json({ items: [], next: null });
      const upper = raw.toUpperCase();
      const [byKey, byCustomer] = await Promise.all([
        q.length >= 3
          ? col.where('searchKeys', 'array-contains', q).limit(PAGE).get()
          : Promise.resolve(null),
        col.where('customer', '>=', upper).where('customer', '<', upper + '').limit(200).get(),
      ]);
      const seen = new Set<string>();
      const items = [...(byKey?.docs ?? []), ...byCustomer.docs]
        .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
        .map((d) => toJob(d, true))
        .sort((a, b) => String(b.dueDate ?? '').localeCompare(String(a.dueDate ?? '')));
      return NextResponse.json({ items, next: null, capped: byCustomer.size === 200 });
    }

    let query = col.orderBy('dueDate', 'desc').limit(PAGE);
    const after = params.get('after');
    if (after) {
      const cursor = await col.doc(after).get();
      if (cursor.exists) query = query.startAfter(cursor);
    }
    const snap = await query.get();
    const items = snap.docs.map((d) => toJob(d, true));
    return NextResponse.json({
      items,
      next: snap.size === PAGE ? snap.docs[snap.size - 1].id : null,
    });
  } catch (error) {
    console.error('Error searching job history:', error);
    return NextResponse.json({ error: 'Failed to search job history' }, { status: 500 });
  }
}
