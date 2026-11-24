import { NextRequest, NextResponse } from 'next/server';
import { purchaseOrdersDB, PoValidationError } from '@/lib/po-db';
import { applyPoToBoard } from '@/lib/po-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET: every PO as a compact row (newest first). ?wo=43860 -> full POs for that JOB#. */
export async function GET(request: NextRequest) {
  try {
    const wo = request.nextUrl.searchParams.get('wo');
    if (wo) return NextResponse.json(await purchaseOrdersDB.findByWorkOrder(wo));
    // The list only changes when a PO / supplier is saved: answer 304 when
    // the browser already has this version (the board's live sync asks often).
    const version = await purchaseOrdersDB.version();
    const etag = `"po-${version}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-cache' } });
    }
    const { list } = await purchaseOrdersDB.summariesVersioned(version);
    return NextResponse.json(list, { headers: { ETag: etag, 'Cache-Control': 'no-cache' } });
  } catch (error) {
    console.error('Error listing POs:', error);
    return NextResponse.json({ error: 'Failed to load purchase orders' }, { status: 500 });
  }
}

/** POST: new PO (next PO NUMBER), then move its jobs on the board. */
export async function POST(request: NextRequest) {
  try {
    const po = await purchaseOrdersDB.create(await request.json());
    const board = await applyPoToBoard(null, po).catch((e) => {
      console.error('PO board update failed:', e);
      return { moves: [], messages: ['No se pudo actualizar el tablero.'] };
    });
    return NextResponse.json({ po: (await purchaseOrdersDB.findById(po.id)) ?? po, board });
  } catch (error) {
    if (error instanceof PoValidationError) {
      return NextResponse.json({ error: error.message, missing: error.missing }, { status: 400 });
    }
    console.error('Error creating PO:', error);
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 });
  }
}
