import { NextRequest, NextResponse } from 'next/server';
import { firestore } from '@/lib/firebase-admin';
import type { PoReportRow } from '@/types/po';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -- every PO line ordered in that range
 * (Access: Order Date Between Start And End). The TONY-ONLY reports filter
 * and group these rows by supplier, employee or description.
 */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from') ?? '';
  const to = request.nextUrl.searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 });
  }
  try {
    const snap = await firestore
      .collection('purchaseOrders')
      .where('orderDate', '>=', from)
      .where('orderDate', '<=', to)
      .get();
    const rows: PoReportRow[] = [];
    for (const d of snap.docs) {
      const p = d.data();
      for (const l of Array.isArray(p.lines) ? p.lines : []) {
        const unitPrice = Number(l.unitPrice) || 0;
        rows.push({
          poNumber: Number(p.poNumber ?? d.id),
          orderDate: String(p.orderDate ?? ''),
          supplierId: String(p.supplierId ?? ''),
          supplierName: String(p.supplierName ?? ''),
          employeeName: String(p.employeeName ?? ''),
          description: String(p.description ?? ''),
          prodDescrip: String(l.prodDescrip ?? ''),
          units: Number(l.units) || 0,
          unitPrice,
          priced: unitPrice > 0,
        });
      }
    }
    rows.sort((a, b) => a.supplierName.localeCompare(b.supplierName) || a.poNumber - b.poNumber);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('PO report error:', error);
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 });
  }
}
