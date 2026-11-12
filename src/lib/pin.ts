import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

// PINs are never stored: only a salted scrypt hash.
export function hashPin(pin: string): { pinHash: string; pinSalt: string } {
  const salt = randomBytes(16).toString('hex');
  return { pinHash: scryptSync(pin, salt, 32).toString('hex'), pinSalt: salt };
}

export function checkPin(pin: string, pinHash?: string, pinSalt?: string): boolean {
  if (!pinHash || !pinSalt) return false;
  const a = scryptSync(pin, pinSalt, 32);
  const b = Buffer.from(pinHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const isValidPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{6}$/.test(pin);

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
