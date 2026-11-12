import { NextResponse } from 'next/server';
import { authEnabled, sessionFromRequest, type Session } from './auth-shared';

/**
 * For admin-only API routes. While login isn't enforced yet (AUTH_ENABLED off)
 * the route stays open, so admins can set everyone's PIN before switching it on.
 * Returns a response to send back when access is denied, else null.
 */
export async function denyUnlessAdmin(req: Request): Promise<NextResponse | null> {
  const s = await sessionFromRequest(req);
  if (s?.role === 'admin') return null;
  if (!authEnabled() && !s) return null;
  return NextResponse.json({ error: 'Admins only' }, { status: s ? 403 : 401 });
}

/** The logged-in machinist, if the caller is one (admins/no session → null). */
export async function machinistSession(req: Request): Promise<Session | null> {
  const s = await sessionFromRequest(req);
  return s?.role === 'machinist' ? s : null;
}
