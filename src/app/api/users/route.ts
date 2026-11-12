import { NextRequest, NextResponse } from 'next/server';
import { usersDB, employeesDB } from '@/lib/json-db';
import { hashPin, isValidPin } from '@/lib/pin';
import { denyUnlessAdmin } from '@/lib/auth-guard';

export const runtime = 'nodejs';

// Admin "Usuarios" screen: list everyone with role / departments / PIN status.
export async function GET(request: NextRequest) {
  const denied = await denyUnlessAdmin(request);
  if (denied) return denied;
  return NextResponse.json(await usersDB.listAll());
}

// Create a person (reuses an existing record with the same name).
export async function POST(request: NextRequest) {
  const denied = await denyUnlessAdmin(request);
  if (denied) return denied;
  const body = await request.json();
  const name = String(body?.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  const emp = await employeesDB.create({ name });
  return NextResponse.json(await usersDB.update(emp.id, { isActive: true }), { status: 201 });
}

// Update one person: role, departments, active/hidden, and optionally a new PIN.
export async function PUT(request: NextRequest) {
  const denied = await denyUnlessAdmin(request);
  if (denied) return denied;
  const body = await request.json();
  const id = String(body?.id ?? '');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: Parameters<typeof usersDB.update>[1] = {};
  if (body.role === 'admin' || body.role === 'machinist' || body.role === '') patch.role = body.role;
  if (Array.isArray(body.departmentIds)) patch.departmentIds = body.departmentIds.map(String);
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
  if (body.pin !== undefined) {
    if (!isValidPin(body.pin)) {
      return NextResponse.json({ error: 'El PIN debe tener 6 dígitos' }, { status: 400 });
    }
    Object.assign(patch, hashPin(body.pin), { failedAttempts: 0, lockedUntil: null });
  }

  const user = await usersDB.update(id, patch);
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}
