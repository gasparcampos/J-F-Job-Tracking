import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

/**
 * Firebase Admin initialization (lazy).
 *
 * Initialization happens on first call to `getApp()` / `firestore` / `storage`
 * — NOT at module load. This matters on Firebase App Hosting because Next.js
 * evaluates every route module during the "Collecting page data" phase of
 * `next build`, and at that point runtime-only secrets (FIREBASE_CLIENT_EMAIL,
 * FIREBASE_PRIVATE_KEY) are not yet available. Doing init at import time would
 * throw "Invalid Firebase app options" and fail the build.
 *
 * Credentials are resolved in this order:
 *   1. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY env vars (explicit cert)
 *   2. Application Default Credentials (works on App Hosting / Cloud Run)
 */

let cachedApp: App | undefined;

function resolveCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    return cert({ projectId, clientEmail, privateKey });
  }

  // Fall back to ADC on Cloud Run / App Hosting.
  try {
    return applicationDefault();
  } catch {
    return undefined;
  }
}

function init(): App {
  const existing = getApps();
  if (existing.length) return existing[0]!;

  const credential = resolveCredential();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    (projectId ? `${projectId}.appspot.com` : undefined);

  // Only include keys that are actually defined — initializeApp validates
  // `credential` strictly and rejects `undefined` as an explicit value.
  const options: Parameters<typeof initializeApp>[0] = {};
  if (credential) options.credential = credential;
  if (projectId) options.projectId = projectId;
  if (storageBucket) options.storageBucket = storageBucket;

  return initializeApp(options);
}

export function getAdminApp(): App {
  if (!cachedApp) cachedApp = init();
  return cachedApp;
}

// Proxy exports so existing imports (`firestore`, `storage`, `bucket`) keep
// working without forcing init at module load. They lazily resolve on first
// property access.
export const firestore: Firestore = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    const real = getFirestore(getAdminApp());
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export const storage: Storage = new Proxy({} as Storage, {
  get(_target, prop, receiver) {
    const real = getStorage(getAdminApp());
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export const bucket: ReturnType<Storage['bucket']> = new Proxy(
  {} as ReturnType<Storage['bucket']>,
  {
    get(_target, prop, receiver) {
      const real = getStorage(getAdminApp()).bucket();
      const value = Reflect.get(real, prop, receiver);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  },
);

// Re-export the app reference for code that wants direct access.
export const adminApp = new Proxy({} as App, {
  get(_target, prop, receiver) {
    const real = getAdminApp();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
