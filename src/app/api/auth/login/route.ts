import { NextRequest, NextResponse } from 'next/server';
import { usersDB } from '@/lib/json-db';
import { checkPin, isValidPin, MAX_FAILED_ATTEMPTS, LOCKOUT_MS } from '@/lib/pin';
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

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      return fail(`Demasiados intentos. Intenta de nuevo en ${mins} min.`, 429);
    }

    if (!checkPin(pin, user.pinHash, user.pinSalt)) {
      const attempts = user.failedAttempts + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await usersDB.update(user.id, {
          failedAttempts: 0,
          lockedUntil: new Date(Date.now() + LOCKOUT_MS).toISOString(),
        });
        return fail('Demasiados intentos. Bloqueado 15 min.', 429);
      }
      await usersDB.update(user.id, { failedAttempts: attempts });
      return fail(`PIN incorrecto (${MAX_FAILED_ATTEMPTS - attempts} intentos restantes)`);
    }

    if (user.failedAttempts || user.lockedUntil) {
      await usersDB.update(user.id, { failedAttempts: 0, lockedUntil: null });
    }

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
