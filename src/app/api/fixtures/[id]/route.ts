import { NextRequest, NextResponse } from 'next/server';
import { fixturesDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fixture = await fixturesDB.findById(id);
    if (!fixture) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(fixture);
  } catch (error) {
    console.error('Error fetching fixture:', error);
    return NextResponse.json({ error: 'Failed to fetch fixture' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const fixture = await fixturesDB.update(id, body);
    if (!fixture) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(fixture);
  } catch (error) {
    console.error('Error updating fixture:', error);
    return NextResponse.json({ error: 'Failed to update fixture' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = await fixturesDB.delete(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting fixture:', error);
    return NextResponse.json({ error: 'Failed to delete fixture' }, { status: 500 });
  }
}
