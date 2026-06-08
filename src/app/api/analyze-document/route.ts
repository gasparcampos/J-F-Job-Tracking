import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface ExtractedData {
  jobNumber: string | null;
  customer: string | null;
  poNumber: string | null;
  line: string | null;
  dwgNumber: string | null;
  partNumber: string | null;
  dueDate: string | null;
}

export async function POST(request: NextRequest) {
  console.log('=== ANALYZE DOCUMENT API ===');
  
  try {
    const body = await request.json();
    const { fileUrl, fileName } = body;

    console.log('Request body:', { fileUrl, fileName });

    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 });
    }

    // Check file type
    const isPdf = fileUrl.toLowerCase().endsWith('.pdf');
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileUrl);
    
    console.log('File type:', { isPdf, isImage, fileUrl });
    
    if (!isPdf && !isImage) {
      return NextResponse.json({ 
        success: false,
        error: 'Unsupported file type. Only PDF and images are supported.',
        data: {
          jobNumber: null,
          customer: null,
          poNumber: null,
          line: null,
          dwgNumber: null,
          partNumber: null,
          dueDate: null,
        }
      }, { status: 400 });
    }

    // For PDFs, try to extract text using pdf-to-img (convert to image first)
    if (isPdf) {
      try {
        // Convert PDF to image and return the first page
        const pdfToImg = (await import('pdf-to-img')).default;
        
        let fileBuffer: Buffer;
        if (fileUrl.startsWith('/uploads/')) {
          const filePath = path.join(process.cwd(), 'public', fileUrl);
          if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
          }
          fileBuffer = fs.readFileSync(filePath);
        } else {
          const response = await fetch(fileUrl);
          const arrayBuffer = await response.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
        }

        // Convert PDF to images
        const pdf = await pdfToImg.pdf(fileBuffer, { scale: 2 });
        const pages: string[] = [];
        
        for await (const page of pdf) {
          // Convert buffer to base64
          const base64 = page.toString('base64');
          pages.push(`data:image/png;base64,${base64}`);
          if (pages.length >= 3) break; // Only first 3 pages
        }
        
        console.log('PDF converted to images:', pages.length, 'pages');

        // Return images for display - since VLM isn't available, user will enter data manually
        return NextResponse.json({
          success: true,
          data: {
            jobNumber: null,
            customer: null,
            poNumber: null,
            line: null,
            dwgNumber: null,
            partNumber: null,
            dueDate: null,
          },
          message: 'PDF converted to images. Please enter job details manually.',
          previewImages: pages,
          isScanned: true,
        });
      } catch (pdfError) {
        console.error('Error processing PDF:', pdfError);
        return NextResponse.json({
          success: true,
          data: {
            jobNumber: null,
            customer: null,
            poNumber: null,
            line: null,
            dwgNumber: null,
            partNumber: null,
            dueDate: null,
          },
          message: 'Could not process PDF. Please enter job details manually.',
        });
      }
    }

    // For images, try VLM if available, otherwise return for manual entry
    if (isImage) {
      // Since VLM requires authentication that may not be configured,
      // return the image for manual data entry
      let imageUrl = fileUrl;
      if (fileUrl.startsWith('/uploads/')) {
        // Image is already accessible at this URL
        imageUrl = fileUrl;
      }
      
      return NextResponse.json({
        success: true,
        data: {
          jobNumber: null,
          customer: null,
          poNumber: null,
          line: null,
          dwgNumber: null,
          partNumber: null,
          dueDate: null,
        },
        message: 'Image uploaded. Please enter job details manually.',
        previewImages: [imageUrl],
        isScanned: true,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        jobNumber: null,
        customer: null,
        poNumber: null,
        line: null,
        dwgNumber: null,
        partNumber: null,
        dueDate: null,
      },
    });

  } catch (error) {
    console.error('Error analyzing document:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to analyze document', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
