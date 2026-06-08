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

function extractFieldsFromText(text: string): ExtractedData {
  const data: ExtractedData = {
    jobNumber: null,
    customer: null,
    poNumber: null,
    line: null,
    dwgNumber: null,
    partNumber: null,
    dueDate: null,
  };

  console.log('=== EXTRACTING FROM TEXT ===');
  console.log('Text length:', text.length);
  console.log('Text preview:', text.substring(0, 500));

  // Common patterns for job documents - case insensitive
  const patterns = {
    jobNumber: [
      /JOB\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
      /JOB\s*NO\.?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
      /JOB\s*NUMBER\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
    ],
    customer: [
      /CUSTOMER\s*:?\s*([A-Za-z][A-Za-z0-9\s&.,\-]{1,30})/i,
      /CLIENT\s*:?\s*([A-Za-z][A-Za-z0-9\s&.,\-]{1,30})/i,
      /COMPANY\s*:?\s*([A-Za-z][A-Za-z0-9\s&.,\-]{1,30})/i,
      /SHIP\s*TO\s*:?\s*([A-Za-z][A-Za-z0-9\s&.,\-]{1,30})/i,
    ],
    poNumber: [
      /PO\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-]+)/i,
      /P\.?O\.?\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-]+)/i,
      /PURCHASE\s*ORDER\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-]+)/i,
    ],
    line: [
      /LINE\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
      /LINE\s*NO\.?\s*:?\s*([A-Z0-9\-]+)/i,
      /LINE\s*ITEM\s*:?\s*([A-Z0-9\-]+)/i,
    ],
    dwgNumber: [
      /DWG\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
      /DRAWING\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
      /DWG\s*NO\.?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
    ],
    partNumber: [
      /PART\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
      /PART\s*NO\.?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
      /P\/N\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
    ],
    dueDate: [
      /DUE\s*DATE\s*:?\s*([A-Za-z0-9\/\-\s,]{6,20})/i,
      /DELIVERY\s*DATE\s*:?\s*([A-Za-z0-9\/\-\s,]{6,20})/i,
      /SHIP\s*DATE\s*:?\s*([A-Za-z0-9\/\-\s,]{6,20})/i,
      /DUE\s*:?\s*([A-Za-z0-9\/\-\s,]{6,20})/i,
    ],
  };

  // Extract each field
  for (const [field, regexList] of Object.entries(patterns)) {
    for (const regex of regexList) {
      const match = text.match(regex);
      if (match && match[1]) {
        let value = match[1].trim();
        // Clean up the value
        value = value.replace(/\s+/g, ' ').trim();
        // Remove trailing punctuation or unwanted chars
        value = value.replace(/[,:;]+$/, '').trim();
        if (value.length > 0 && value.length < 100) {
          (data as any)[field] = value;
          console.log(`Found ${field}:`, value);
          break;
        }
      }
    }
  }

  console.log('=== EXTRACTION RESULT ===');
  console.log(JSON.stringify(data, null, 2));

  return data;
}

export async function POST(request: NextRequest) {
  console.log('=== EXTRACT PDF DATA API CALLED ===');
  
  try {
    const body = await request.json();
    const { fileUrl, fileName } = body;

    console.log('Request body:', { fileUrl, fileName });

    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 });
    }

    // Check if it's a PDF
    const isPdf = fileUrl.toLowerCase().endsWith('.pdf');
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileUrl);
    
    console.log('File type check:', { isPdf, isImage, fileUrl });
    
    if (!isPdf && !isImage) {
      return NextResponse.json({ 
        success: false,
        error: 'Unsupported file type',
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

    // For images, return message that only PDFs are supported
    if (isImage) {
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
        message: 'Image files require manual data entry. PDF text extraction is automatic.',
      });
    }

    // Read the PDF file
    let pdfBuffer: Buffer;
    
    if (fileUrl.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), 'public', fileUrl);
      console.log('Reading file from:', filePath);
      if (!fs.existsSync(filePath)) {
        console.log('File not found:', filePath);
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      pdfBuffer = fs.readFileSync(filePath);
    } else {
      // Fetch from URL
      console.log('Fetching from URL:', fileUrl);
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
    }

    console.log('PDF buffer size:', pdfBuffer.length);

    // Extract text from PDF using pdf-parse
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(pdfBuffer);
    const fullText = pdfData.text;

    console.log('Extracted text length:', fullText.length);

    // Extract fields from the text
    const extractedData = extractFieldsFromText(fullText);

    console.log('Returning extracted data:', extractedData);

    return NextResponse.json({
      success: true,
      data: extractedData,
      rawText: fullText.substring(0, 2000),
    });

  } catch (error) {
    console.error('Error extracting PDF data:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to extract data', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
