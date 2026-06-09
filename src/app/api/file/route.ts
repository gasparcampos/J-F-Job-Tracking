import { NextRequest, NextResponse } from 'next/server';
import { bucket } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy for files stored in Firebase Storage.
 *
 * Firebase download URLs (firebasestorage.googleapis.com) do NOT send CORS
 * headers, so PDF.js (which fetches via XHR/fetch in the browser) is blocked
 * when loading them cross-origin. Serving the bytes through our own origin
 * sidesteps CORS entirely.
 *
 * Usage: /api/file?path=uploads/1700000000_name.pdf
 *        /api/file?url=<full firebase download url>  (path is extracted)
 *
 * Only objects inside this project's bucket are served (no SSRF).
 */
function extractPath(req: NextRequest): string | null {
  const sp = req.nextUrl.searchParams;
  const direct = sp.get('path');
  if (direct) return direct.replace(/^\/+/, '');

  const url = sp.get('url');
  if (url) {
    // .../o/<URL-ENCODED-PATH>?alt=media&token=...
    const m = url.match(/\/o\/([^?]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const path = extractPath(req);
    if (!path) {
      return NextResponse.json({ error: 'path or url is required' }, { status: 400 });
    }

    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    const lower = path.toLowerCase();
    const contentType =
      metadata.contentType ||
      (lower.endsWith('.pdf')
        ? 'application/pdf'
        : lower.endsWith('.png')
        ? 'image/png'
        : /\.(jpg|jpeg)$/.test(lower)
        ? 'image/jpeg'
        : 'application/octet-stream');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=3600',
        // Same-origin already, but be explicit so embedding/fetch never trips.
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('File proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to read file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
