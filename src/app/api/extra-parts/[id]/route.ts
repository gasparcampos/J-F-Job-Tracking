import { NextRequest, NextResponse } from 'next/server';
import { extraPartsDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const part = await extraPartsDB.findById(id);
    if (!part) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(part);
  } catch (error) {
    console.error('Error fetching extra part:', error);
    return NextResponse.json({ error: 'Failed to fetch extra part' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const part = await extraPartsDB.update(id, body);
    if (!part) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(part);
  } catch (error) {
    console.error('Error updating extra part:', error);
    return NextResponse.json({ error: 'Failed to update extra part' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = await extraPartsDB.delete(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting extra part:', error);
    return NextResponse.json({ error: 'Failed to delete extra part' }, { status: 500 });
  }
}
