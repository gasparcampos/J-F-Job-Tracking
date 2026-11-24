import { NextResponse } from 'next/server';
import { poLookupsDB } from '@/lib/po-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Suppliers, Employees, Shipping Methods and the company info, for the PO screens. */
export async function GET() {
  try {
    return NextResponse.json(await poLookupsDB.all());
  } catch (error) {
    console.error('Error loading PO lookups:', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}
