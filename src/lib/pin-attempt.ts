import { usersDB, type StoredUserAuth } from './json-db';
import { checkPin, isValidPin, MAX_FAILED_ATTEMPTS, LOCKOUT_MS } from './pin';

export type PinAttempt = { ok: true } | { ok: false; error: string; status: number };

/**
 * Checks a PIN for a user and keeps the shared lockout counter: 5 wrong tries
 * (at login or on Start/Complete) lock that person out for 15 minutes.
 */
export async function verifyPinAttempt(user: StoredUserAuth, pin: unknown): Promise<PinAttempt> {
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    return { ok: false, error: `Demasiados intentos. Intenta de nuevo en ${mins} min.`, status: 429 };
  }

  if (!isValidPin(pin) || !checkPin(pin, user.pinHash, user.pinSalt)) {
    const attempts = user.failedAttempts + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await usersDB.update(user.id, {
        failedAttempts: 0,
        lockedUntil: new Date(Date.now() + LOCKOUT_MS).toISOString(),
      });
      return { ok: false, error: 'Demasiados intentos. Bloqueado 15 min.', status: 429 };
    }
    await usersDB.update(user.id, { failedAttempts: attempts });
    return { ok: false, error: `PIN incorrecto (${MAX_FAILED_ATTEMPTS - attempts} intentos restantes)`, status: 401 };
  }

  if (user.failedAttempts || user.lockedUntil) {
    await usersDB.update(user.id, { failedAttempts: 0, lockedUntil: null });
  }
  return { ok: true };
}
