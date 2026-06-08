import { NextRequest, NextResponse } from 'next/server';

// pdf-to-img and pdfjs-dist have top-level side effects that break Next.js's
// build-time page-data collection. Force this route to be runtime-only and
// import the heavy deps lazily.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { pdfPath, pdfUrl } = await request.json();
    const source: string | undefined = pdfUrl || pdfPath;

    if (!source) {
      return NextResponse.json(
        { error: 'pdfUrl or pdfPath is required' },
        { status: 400 }
      );
    }

    // Lazy-load pdf-to-img so the build doesn't try to evaluate it.
    const { pdf } = await import('pdf-to-img');

    // Resolve the input. Prefer a URL (Firebase Storage signed URL).
    // For legacy /uploads/... paths, build the absolute path against /public.
    let input: string;
    if (/^https?:\/\//i.test(source)) {
      // pdf-to-img accepts a Buffer or path; download the URL first.
      const res = await fetch(source);
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch PDF (${res.status})` },
          { status: 502 }
        );
      }
      const arrayBuffer = await res.arrayBuffer();
      input = Buffer.from(arrayBuffer) as unknown as string;
    } else {
      const fs = await import('fs');
      const path = await import('path');
      const fullPath = path.join(
        process.cwd(),
        'public',
        source.replace(/^\//, '')
      );
      if (!fs.existsSync(fullPath)) {
        return NextResponse.json(
          { error: 'PDF file not found' },
          { status: 404 }
        );
      }
      input = fullPath;
    }

    const document = await pdf(input as never, { scale: 2 });
    const images: string[] = [];

    for await (const page of document) {
      const base64 = page.toString('base64');
      images.push(`data:image/png;base64,${base64}`);
    }

    return NextResponse.json({
      success: true,
      images,
      pageCount: images.length,
    });
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    return NextResponse.json(
      {
        error: 'Failed to convert PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
