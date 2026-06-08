import { NextRequest, NextResponse } from 'next/server';
import { bucket } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

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

    const blob = bucket.file(storagePath);
    await blob.save(buffer, {
      contentType: file.type || 'application/octet-stream',
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    // Long-lived signed URL so the client (PDF viewer, image viewer) can
    // load the file without needing Firebase Auth on the frontend.
    // 7 days is the maximum for V4 signed URLs.
    const [signedUrl] = await blob.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      version: 'v4',
    });

    const isPdf = file.name.toLowerCase().endsWith('.pdf');

    return NextResponse.json({
      success: true,
      fileUrl: signedUrl,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      isPdf,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
