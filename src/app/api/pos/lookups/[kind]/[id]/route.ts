import { NextRequest, NextResponse } from 'next/server';
import { poEmployeesDB, poShippingDB, poSuppliersDB } from '@/lib/po-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DBS = { suppliers: poSuppliersDB, employees: poEmployeesDB, shipping: poShippingDB } as const;
type Ctx = { params: Promise<{ kind: string; id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { kind, id } = await params;
  const db = DBS[kind as keyof typeof DBS];
  if (!db) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  const saved = await db.update(id, await request.json());
  return saved ? NextResponse.json(saved) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { kind, id } = await params;
  const db = DBS[kind as keyof typeof DBS];
  if (!db) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });
  return (await db.delete(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
