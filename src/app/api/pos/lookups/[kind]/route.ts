import { NextRequest, NextResponse } from 'next/server';
import { poEmployeesDB, poShippingDB, poSuppliersDB, saveCompany } from '@/lib/po-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DBS = { suppliers: poSuppliersDB, employees: poEmployeesDB, shipping: poShippingDB } as const;

/**
 * POST /api/pos/lookups/{suppliers|employees|shipping}: add a record.
 * POST /api/pos/lookups/company: save My Company Information.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    const body = await request.json();
    if (kind === 'company') return NextResponse.json(await saveCompany(body));
    const db = DBS[kind as keyof typeof DBS];
    if (!db) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
    const named = kind === 'employees' ? body.firstName || body.lastName : body.name;
    if (!String(named ?? '').trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    return NextResponse.json(await db.create(body));
  } catch (error) {
    console.error('Error saving PO lookup:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
