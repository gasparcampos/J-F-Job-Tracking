import { NextRequest, NextResponse } from 'next/server';
import { pdf } from 'pdf-to-img';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { pdfPath } = await request.json();
    
    if (!pdfPath) {
      return NextResponse.json({ error: 'PDF path is required' }, { status: 400 });
    }

    // Resolve the full path
    const fullPath = path.join(process.cwd(), 'public', pdfPath.replace(/^\//, ''));
    
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'PDF file not found' }, { status: 404 });
    }

    // Convert PDF to images
    const document = await pdf(fullPath, { scale: 2 });
    const images: string[] = [];
    
    for await (const page of document) {
      // Convert buffer to base64
      const base64 = page.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;
      images.push(dataUrl);
    }

    return NextResponse.json({ 
      success: true, 
      images,
      pageCount: images.length 
    });
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    return NextResponse.json(
      { error: 'Failed to convert PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
