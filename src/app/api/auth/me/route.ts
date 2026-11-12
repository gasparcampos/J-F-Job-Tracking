import { NextRequest, NextResponse } from 'next/server';
import { authEnabled, sessionFromRequest } from '@/lib/auth-shared';
import { usersDB } from '@/lib/json-db';

export const runtime = 'nodejs';

// Who is logged in (null if nobody) and whether login is being enforced.
// Role and departments are read fresh, so an admin's change in Usuarios
// applies without logging out; a hidden/removed user counts as logged out.
export async function GET(request: NextRequest) {
  const s = await sessionFromRequest(request);
  const u = s ? await usersDB.getAuth(s.uid) : null;
  const valid = u && u.isActive && u.role;
  return NextResponse.json({
    authEnabled: authEnabled(),
    user: valid ? { id: u.id, name: u.name, role: u.role, depts: u.departmentIds } : null,
  });
}
