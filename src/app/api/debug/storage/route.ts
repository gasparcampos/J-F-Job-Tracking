import { NextResponse } from 'next/server';
import { storage, bucket } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Temporary debug endpoint to diagnose Firebase Storage access.
 * Remove after the upload issue is resolved.
 */
export async function GET() {
  const envBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  const out: Record<string, unknown> = {
    env: {
      FIREBASE_STORAGE_BUCKET: envBucket ?? null,
      FIREBASE_PROJECT_ID: projectId ?? null,
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ?? null,
      HAS_FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    },
    bucketNameFromProxy: null as string | null,
    exists: null as unknown,
    existsError: null as string | null,
    canList: null as unknown,
    listError: null as string | null,
  };

  try {
    out.bucketNameFromProxy = bucket.name;
  } catch (e) {
    out.bucketNameFromProxy = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const [exists] = await bucket.exists();
    out.exists = exists;
  } catch (e) {
    out.existsError = e instanceof Error ? e.message : String(e);
  }

  try {
    const [buckets] = await storage.getBuckets();
    out.canList = buckets.map((b) => b.name);
  } catch (e) {
    out.listError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
