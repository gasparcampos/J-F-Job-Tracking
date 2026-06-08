import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { bucket } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Uploads to Firebase Storage and returns a Firebase download URL.
 *
 * Why download tokens instead of signed URLs:
 * Signed URLs require the runtime service account to have
 * `iam.serviceAccounts.signBlob` (typically granted via the
 * "Service Account Token Creator" role). Firebase download tokens
 * don't need that — the URL is composed of bucket + path + token
 * and served by the firebasestorage.googleapis.com gateway.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const timestamp = Date.now();
    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `uploads/${timestamp}_${originalName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const downloadToken = randomUUID();
    const blob = bucket.file(storagePath);

    await blob.save(buffer, {
      contentType: file.type || 'application/octet-stream',
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const bucketName = bucket.name;
    const encodedPath = encodeURIComponent(storagePath);
    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    const isPdf = file.name.toLowerCase().endsWith('.pdf');

    return NextResponse.json({
      success: true,
      fileUrl,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      isPdf,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload file',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
