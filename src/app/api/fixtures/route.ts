import { NextRequest, NextResponse } from 'next/server';
import { fixturesDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const fixtures = await fixturesDB.findAll();
    return NextResponse.json(fixtures);
  } catch (error) {
    console.error('Error fetching fixtures:', error);
    return NextResponse.json({ error: 'Failed to fetch fixtures' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // fixturesDB.create only keeps known fixture fields.
    const fixture = await fixturesDB.create(body);
    return NextResponse.json(fixture);
  } catch (error) {
    console.error('Error creating fixture:', error);
    return NextResponse.json({ error: 'Failed to create fixture' }, { status: 500 });
  }
}
