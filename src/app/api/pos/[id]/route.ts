import { NextRequest, NextResponse } from 'next/server';
import { purchaseOrdersDB, PoValidationError } from '@/lib/po-db';
import { applyPoToBoard } from '@/lib/po-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const po = await purchaseOrdersDB.findById(id);
  return po ? NextResponse.json(po) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/** PUT: save the PO, then apply it to the board (send out / bring back). */
export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const saved = await purchaseOrdersDB.update(id, await request.json());
    if (!saved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const board = await applyPoToBoard(saved.before, saved.after).catch((e) => {
      console.error('PO board update failed:', e);
      return { moves: [], messages: ['No se pudo actualizar el tablero.'] };
    });
    return NextResponse.json({ po: (await purchaseOrdersDB.findById(id)) ?? saved.after, board });
  } catch (error) {
    if (error instanceof PoValidationError) {
      return NextResponse.json({ error: error.message, missing: error.missing }, { status: 400 });
    }
    console.error('Error updating PO:', error);
    return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ok = await purchaseOrdersDB.delete(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
