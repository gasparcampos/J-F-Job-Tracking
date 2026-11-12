import { NextResponse } from 'next/server';
import { usersDB } from '@/lib/json-db';

export const runtime = 'nodejs';

// Names shown on the login screen: active people with a role and a PIN set.
// Public on purpose (the login screen needs it) — names only, nothing else.
export async function GET() {
  try {
    const users = await usersDB.listAll();
    return NextResponse.json(
      users
        .filter((u) => u.isActive && u.role && u.hasPin)
        .map((u) => ({ id: u.id, name: u.name, role: u.role })),
    );
  } catch (error) {
    console.error('Error listing login users:', error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}
