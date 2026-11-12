/**
 * PIN login sessions. A signed cookie (HMAC-SHA256 via Web Crypto, so it works
 * in the proxy and in API routes alike) carries who is logged in and what they
 * may see. No session store: the signature + expiry are the whole check.
 *
 * Login is only ENFORCED when AUTH_ENABLED=true (apphosting.yaml). With it off
 * everything stays open as before, but logging in still works so it can be
 * tested — and a logged-in machinist is still limited by the API checks.
 */

export const SESSION_COOKIE = 'jf_session';

export type UserRole = 'admin' | 'machinist';

export interface Session {
  uid: string;
  name: string;
  role: UserRole;
  /** Department ids a machinist works in (ignored for admins). */
  depts: string[];
  /** Expiry, ms since epoch. */
  exp: number;
}

export const SESSION_SHORT_MS = 12 * 60 * 60 * 1000; // shop PCs: one shift
export const SESSION_LONG_MS = 30 * 24 * 60 * 60 * 1000; // "remember this device"

export const authEnabled = () => process.env.AUTH_ENABLED === 'true';

// Dedicated AUTH_SECRET if set; otherwise derived from the service-account key
// that every deployment already has (never exposed to the browser).
function secretMaterial(): string {
  const s = process.env.AUTH_SECRET || process.env.FIREBASE_PRIVATE_KEY || '';
  if (!s) throw new Error('No AUTH_SECRET / FIREBASE_PRIVATE_KEY to sign sessions');
  return `jf-session-v1:${s}`;
}

let keyPromise: Promise<CryptoKey> | null = null;
function hmacKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secretMaterial()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }
  return keyPromise;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export async function signSession(s: Session): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify(s)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(),
      fromB64url(sig),
      new TextEncoder().encode(payload),
    );
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    if (!s?.uid || !s.role || typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** Session from a request's cookie header (works with NextRequest or Request). */
export async function sessionFromRequest(req: Request): Promise<Session | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySession(m ? decodeURIComponent(m[1]) : null);
}
