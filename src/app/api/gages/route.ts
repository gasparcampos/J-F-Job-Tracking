import { NextRequest, NextResponse } from 'next/server';
import { gagesDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const gages = await gagesDB.findAll();
    return NextResponse.json(gages);
  } catch (error) {
    console.error('Error fetching gages:', error);
    return NextResponse.json({ error: 'Failed to fetch gages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // gagesDB.create only keeps known gage fields.
    const gage = await gagesDB.create(body);
    return NextResponse.json(gage);
  } catch (error) {
    console.error('Error creating gage:', error);
    return NextResponse.json({ error: 'Failed to create gage' }, { status: 500 });
  }
}
