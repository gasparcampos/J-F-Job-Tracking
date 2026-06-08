import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

/**
 * Firebase Admin initialization.
 *
 * Credentials are read from environment variables:
 *   - FIREBASE_PROJECT_ID
 *   - FIREBASE_CLIENT_EMAIL
 *   - FIREBASE_PRIVATE_KEY        (raw or with literal \n escapes)
 *   - FIREBASE_STORAGE_BUCKET     (e.g. jf-job-tracker.appspot.com)
 *
 * On Firebase App Hosting / Cloud Run the default service account is
 * available automatically, so explicit creds are optional in that env.
 */

function getCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    // Support keys stored with literal \n
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    return cert({ projectId, clientEmail, privateKey });
  }

  // Fall back to Application Default Credentials (works on App Hosting / GCP)
  return undefined;
}

let app: App;

if (!getApps().length) {
  const credential = getCredential();
  app = initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ||
      (process.env.FIREBASE_PROJECT_ID
        ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
        : undefined),
  });
} else {
  app = getApps()[0]!;
}

export const adminApp = app;
export const firestore: Firestore = getFirestore(app);
export const storage: Storage = getStorage(app);
export const bucket = storage.bucket();
