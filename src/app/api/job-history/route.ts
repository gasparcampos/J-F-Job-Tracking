import { NextRequest, NextResponse } from 'next/server';
import { firestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

/**
 * Search the Access job archive (`jobHistory`, imported from the MASTER
 * table). Matches JOB#, DWG# or Part# by prefix (3+ chars) through the
 * precomputed `searchKeys` array, so only matching docs are read — the
 * archive is never loaded whole.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 3) return NextResponse.json([]);
  try {
    const snap = await firestore
      .collection('jobHistory')
      .where('searchKeys', 'array-contains', q)
      .limit(25)
      .get();
    const jobs = snap.docs.map((d) => {
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
      };
    });
    return NextResponse.json(jobs);
  } catch (error) {
    console.error('Error searching job history:', error);
    return NextResponse.json({ error: 'Failed to search job history' }, { status: 500 });
  }
}
