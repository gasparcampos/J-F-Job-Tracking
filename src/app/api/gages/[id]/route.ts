import { NextRequest, NextResponse } from 'next/server';
import { gagesDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const gage = await gagesDB.findById(id);
    if (!gage) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(gage);
  } catch (error) {
    console.error('Error fetching gage:', error);
    return NextResponse.json({ error: 'Failed to fetch gage' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const gage = await gagesDB.update(id, body);
    if (!gage) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(gage);
  } catch (error) {
    console.error('Error updating gage:', error);
    return NextResponse.json({ error: 'Failed to update gage' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = await gagesDB.delete(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting gage:', error);
    return NextResponse.json({ error: 'Failed to delete gage' }, { status: 500 });
  }
}
