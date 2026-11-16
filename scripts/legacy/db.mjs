// Shared Firestore admin init for the one-off Access migration scripts.
// Reads credentials from .env.local (same vars the app uses).
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // The key may be stored with escaped newlines (\n or \\n).
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\+n/g, '\n'),
  }),
});

export const db = getFirestore();
