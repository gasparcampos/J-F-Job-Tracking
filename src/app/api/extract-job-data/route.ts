import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type ZAIType from 'z-ai-web-dev-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lazy import to keep z-ai-web-dev-sdk out of build-time evaluation.
type ZAIDefault = typeof ZAIType;
let ZAI: ZAIDefault | null = null;
async function loadZAI(): Promise<ZAIDefault> {
  if (!ZAI) {
    const mod = await import('z-ai-web-dev-sdk');
    ZAI = (mod as unknown as { default: ZAIDefault }).default ?? (mod as unknown as ZAIDefault);
  }
  return ZAI;
}

interface ExtractedData {
  jobNumber: string | null;
  customer: string | null;
  poNumber: string | null;
  line: string | null;
  dwgNumber: string | null;
  partNumber: string | null;
  dueDate: string | null;
}

// Initialize ZAI SDK
let zaiInstance: Awaited<ReturnType<ZAIDefault['create']>> | null = null;

async function getZai() {
  if (!zaiInstance) {
    const Z = await loadZAI();
    zaiInstance = await Z.create();
  }
  return zaiInstance;
}

async function extractFromPdfWithVLM(pdfPath: string): Promise<ExtractedData> {
  const zai = await getZai();
  
  // Read PDF and convert to base64
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64Pdf = pdfBuffer.toString('base64');
  const dataUrl = `data:application/pdf;base64,${base64Pdf}`;

  const prompt = `Analyze this PDF document and extract the following information in JSON format:
{
  "jobNumber": "JOB# or Job Number if found",
  "customer": "Customer name if found",
  "poNumber": "PO# or Purchase Order number if found",
  "line": "Line number if found",
  "dwgNumber": "DWG# or Drawing number if found",
  "partNumber": "Part# or Part Number if found",
  "dueDate": "Due date if found (in YYYY-MM-DD format if possible)"
}

IMPORTANT:
- Look carefully at ALL text in the document
- Extract values that are clearly visible
- If a field is not found, use null for that field
- Look for labels like: JOB#, CUSTOMER, PO#, LINE, DWG#, PART#, DUE DATE
- Look for header information, title blocks, or form fields
- Return ONLY valid JSON, no other text
- Be precise with the values extracted`;

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl }
          }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  const responseText = response.choices[0]?.message?.content || '';
  console.log('VLM Response:', responseText);

  // Parse the JSON response
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        jobNumber: parsed.jobNumber || null,
        customer: parsed.customer || null,
        poNumber: parsed.poNumber || null,
        line: parsed.line || null,
        dwgNumber: parsed.dwgNumber || null,
        partNumber: parsed.partNumber || null,
        dueDate: parsed.dueDate || null,
      };
    }
  } catch (e) {
    console.error('Failed to parse VLM response:', e);
  }

  return {
    jobNumber: null,
    customer: null,
    poNumber: null,
    line: null,
    dwgNumber: null,
    partNumber: null,
    dueDate: null,
  };
}

async function extractFromImageWithVLM(imagePath: string): Promise<ExtractedData> {
  const zai = await getZai();
  
  // Read image and convert to base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const prompt = `Analyze this document image and extract the following information in JSON format:
{
  "jobNumber": "JOB# or Job Number if found",
  "customer": "Customer name if found",
  "poNumber": "PO# or Purchase Order number if found",
  "line": "Line number if found",
  "dwgNumber": "DWG# or Drawing number if found",
  "partNumber": "Part# or Part Number if found",
  "dueDate": "Due date if found (in YYYY-MM-DD format if possible)"
}

IMPORTANT:
- Look carefully at ALL text in the document
- Extract values that are clearly visible
- If a field is not found, use null for that field
- Return ONLY valid JSON, no other text`;

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl }
          }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  const responseText = response.choices[0]?.message?.content || '';
  console.log('VLM Response:', responseText);

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        jobNumber: parsed.jobNumber || null,
        customer: parsed.customer || null,
        poNumber: parsed.poNumber || null,
        line: parsed.line || null,
        dwgNumber: parsed.dwgNumber || null,
        partNumber: parsed.partNumber || null,
        dueDate: parsed.dueDate || null,
      };
    }
  } catch (e) {
    console.error('Failed to parse VLM response:', e);
  }

  return {
    jobNumber: null,
    customer: null,
    poNumber: null,
    line: null,
    dwgNumber: null,
    partNumber: null,
    dueDate: null,
  };
}

export async function POST(request: NextRequest) {
  console.log('=== EXTRACT JOB DATA API (VLM) ===');
  
  try {
    const body = await request.json();
    const { fileUrl, fileName } = body;

    console.log('Request body:', { fileUrl, fileName });

    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 });
    }

    // Detect type from fileName (clean) — fileUrl may carry a ?alt=media&token=
    // query string (Firebase Storage) that breaks an endsWith('.pdf') check.
    const typeSource = (fileName || fileUrl.split('?')[0]).toLowerCase();
    const isPdf = typeSource.endsWith('.pdf');
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource);

    console.log('File type check:', { isPdf, isImage, typeSource, fileUrl });
    
    if (!isPdf && !isImage) {
      return NextResponse.json({ 
        success: false,
        error: 'Unsupported file type. Please upload a PDF or image file.',
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

    let filePath: string;
    
    if (fileUrl.startsWith('/uploads/')) {
      filePath = path.join(process.cwd(), 'public', fileUrl);
      console.log('Reading file from:', filePath);
      if (!fs.existsSync(filePath)) {
        console.log('File not found:', filePath);
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
    } else {
      console.log('Downloading from URL:', fileUrl);
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      filePath = path.join('/tmp', `temp_${Date.now()}${isPdf ? '.pdf' : '.png'}`);
      fs.writeFileSync(filePath, buffer);
    }

    // Extract data using VLM.
    // The z-ai-web-dev-sdk only works inside the z.ai sandbox; in production
    // (Firebase) it can't initialize. Degrade gracefully: return empty fields
    // with a 200 so the upload flow continues and the user fills in manually.
    const emptyData: ExtractedData = {
      jobNumber: null,
      customer: null,
      poNumber: null,
      line: null,
      dwgNumber: null,
      partNumber: null,
      dueDate: null,
    };

    let extractedData: ExtractedData;
    try {
      console.log('Extracting data with VLM...');
      extractedData = isPdf
        ? await extractFromPdfWithVLM(filePath)
        : await extractFromImageWithVLM(filePath);
    } catch (vlmError) {
      console.warn(
        'VLM extraction unavailable, falling back to manual entry:',
        vlmError instanceof Error ? vlmError.message : vlmError,
      );
      return NextResponse.json({
        success: true,
        data: emptyData,
        aiAvailable: false,
        message: 'AI extraction unavailable; please enter job details manually.',
      });
    }

    console.log('=== EXTRACTION RESULT ===');
    console.log(JSON.stringify(extractedData, null, 2));

    return NextResponse.json({
      success: true,
      data: extractedData,
      aiAvailable: true,
    });

  } catch (error) {
    console.error('Error extracting data:', error);
    // Never hard-fail the upload flow over extraction.
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
      aiAvailable: false,
      message: 'AI extraction unavailable; please enter job details manually.',
    });
  }
}
