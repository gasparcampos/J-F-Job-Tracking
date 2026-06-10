import { NextRequest, NextResponse } from 'next/server';
import { bucket } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExtractedData {
  customer: string | null;
  customerRaw: string | null;
  poNumber: string | null;
  jobNumber: string | null;
  line: string | null;
  quantity: string | null;
  dwgNumber: string | null;
  partNumber: string | null;
  dueDate: string | null; // YYYY-MM-DD for <input type=date>
}

const EMPTY: ExtractedData = {
  customer: null,
  customerRaw: null,
  poNumber: null,
  jobNumber: null,
  line: null,
  quantity: null,
  dwgNumber: null,
  partNumber: null,
  dueDate: null,
};

/** Map an OCR'd customer name to one of the dropdown options. */
function mapCustomer(raw: string | null): { value: string | null; raw: string | null } {
  if (!raw) return { value: null, raw: null };
  const u = raw.toUpperCase();
  if (u.includes('HALLIBURTON')) return { value: 'Halliburton', raw };
  if (u.includes('LIBERTY')) return { value: 'Liberty', raw };
  if (u.includes('BAKER')) return { value: 'Baker', raw };
  return { value: 'Other', raw };
}

/** MM/DD/YYYY (or M/D/YY) -> YYYY-MM-DD */
function toISODate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let [, mm, dd, yy] = m;
  if (yy.length === 2) yy = '20' + yy;
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function parseRouteSheet(text: string): ExtractedData {
  const pick = (re: RegExp): string | null => {
    const m = text.match(re);
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
  };

  const customerRaw = pick(/Customer:?\s*([A-Za-z][A-Za-z .,&'-]+?)\s*(?:P\.?\s*O\.?|Job|\n)/i);
  const { value: customer } = mapCustomer(customerRaw);

  const data: ExtractedData = {
    customer,
    customerRaw,
    poNumber: pick(/P\.?\s*O\.?\s*#?\.?:?\s*([A-Z0-9-]+)/i),
    jobNumber: pick(/Job\s*#?\.?:?\s*([A-Z0-9-]{3,})/i),
    line: pick(/Line\s*Item\s*#?\.?:?\s*([A-Z0-9-]+)/i),
    quantity: pick(/(?:^|\n)\s*(\d+)\s*-\s*[A-Za-z]/),
    dwgNumber: pick(/Dwg\s*#?\.?:?\s*([A-Z0-9.\/-]+(?:\s*REV\s*[A-Z0-9]+)?)/i),
    partNumber: pick(/Part\s*#?\.?:?\s*([A-Z0-9.\/-]+(?:\s*REV\s*[A-Z0-9]+)?)/i),
    dueDate: toISODate(pick(/Due\s*Date:?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i)),
  };
  return data;
}

/** Extract the storage path from a Firebase download URL or accept a raw path. */
function storagePathFromUrl(fileUrl: string): string | null {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('uploads/')) return fileUrl;
  const m = fileUrl.match(/\/o\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileUrl, fileName } = body as { fileUrl?: string; fileName?: string };

    if (!fileUrl) {
      return NextResponse.json({ success: false, data: EMPTY, error: 'fileUrl required' }, { status: 400 });
    }

    const isPdf = (fileName || fileUrl).toLowerCase().split('?')[0].endsWith('.pdf');
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test((fileName || fileUrl).toLowerCase().split('?')[0]);
    if (!isPdf && !isImage) {
      return NextResponse.json({ success: true, data: EMPTY, aiAvailable: false });
    }

    // Download the file bytes from Storage (server-side, no CORS).
    const path = storagePathFromUrl(fileUrl);
    let buffer: Buffer;
    if (path) {
      const [buf] = await bucket.file(path).download();
      buffer = buf;
    } else {
      const res = await fetch(fileUrl);
      buffer = Buffer.from(await res.arrayBuffer());
    }

    // OCR with Google Cloud Vision (decodes the scanned route sheet).
    const visionMod = await import('@google-cloud/vision');
    const Client = visionMod.default.ImageAnnotatorClient;
    const client = new Client({
      projectId: process.env.FIREBASE_PROJECT_ID,
      credentials:
        process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
          ? {
              client_email: process.env.FIREBASE_CLIENT_EMAIL,
              private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }
          : undefined,
    });

    let fullText = '';
    if (isPdf) {
      const [result] = await client.batchAnnotateFiles({
        requests: [
          {
            inputConfig: { mimeType: 'application/pdf', content: buffer },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            pages: [1],
          },
        ],
      });
      fullText =
        result.responses?.[0]?.responses?.[0]?.fullTextAnnotation?.text ?? '';
    } else {
      const [result] = await client.documentTextDetection({ image: { content: buffer } });
      fullText = result.fullTextAnnotation?.text ?? '';
    }

    const data = parseRouteSheet(fullText);

    return NextResponse.json({
      success: true,
      aiAvailable: true,
      data,
      rawText: fullText.slice(0, 2000),
    });
  } catch (error) {
    console.error('OCR extract error:', error);
    // Never block the upload flow — return empty so the user fills manually.
    return NextResponse.json({
      success: true,
      aiAvailable: false,
      data: EMPTY,
      message: error instanceof Error ? error.message : 'OCR unavailable',
    });
  }
}
