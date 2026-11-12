import { NextRequest, NextResponse } from 'next/server';
import { usersDB } from '@/lib/json-db';
import { isValidPin } from '@/lib/pin';
import { verifyPinAttempt } from '@/lib/pin-attempt';
import {
  SESSION_COOKIE,
  SESSION_LONG_MS,
  SESSION_SHORT_MS,
  signSession,
} from '@/lib/auth-shared';

export const runtime = 'nodejs';

const fail = (error: string, status = 401) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  try {
    const { userId, pin, remember } = await request.json();
    if (typeof userId !== 'string' || !isValidPin(pin)) return fail('PIN incorrecto');

    const user = await usersDB.getAuth(userId);
    if (!user || !user.isActive || !user.role || !user.hasPin) return fail('PIN incorrecto');

    const check = await verifyPinAttempt(user, pin);
    if (!check.ok) return fail(check.error, check.status);

    const ttl = remember ? SESSION_LONG_MS : SESSION_SHORT_MS;
    const token = await signSession({
      uid: user.id,
      name: user.name,
      role: user.role,
      depts: user.departmentIds,
      exp: Date.now() + ttl,
    });

    const res = NextResponse.json({ role: user.role, name: user.name });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(ttl / 1000),
    });
    return res;
  } catch (error) {
    console.error('Login error:', error);
    return fail('Error al iniciar sesión', 500);
  }
}
