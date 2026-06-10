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

// Lines that are field labels (used to skip over them when scanning for values).
const LABEL = /^(P\.?\s*O|W\.?\s*O|Part|Dwg|Due|Line|Job|Buyer|Order|Material|PO|Route|Customer)/i;

function parseRouteSheet(text: string): ExtractedData {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Customer can span the line(s) after "Customer:" (e.g. "HALLI" / "HALLIBURTON ENERGY").
  let customerRaw: string | null = null;
  const ci = lines.findIndex((l) => /^Customer[:\s]/i.test(l));
  if (ci >= 0) {
    const parts = [lines[ci].replace(/^Customer[:\s]*/i, '').trim()].filter(Boolean);
    for (let j = ci + 1; j < Math.min(ci + 3, lines.length); j++) {
      if (/^[A-Za-z][A-Za-z .,&'-]+$/.test(lines[j]) && !LABEL.test(lines[j])) parts.push(lines[j]);
      else break;
    }
    customerRaw = parts.join(' ').replace(/\s+/g, ' ').trim() || null;
  }
  const { value: customer } = mapCustomer(customerRaw);

  // PO value can sit before OR after the "P.O. #:" label; take the longest candidate.
  const poCands: string[] = [];
  let m = text.match(/P\.?\s*O\.?\s*#?[.:]*\s*\n?\s*([A-Z0-9-]{4,})/i);
  if (m) poCands.push(m[1]);
  m = text.match(/([A-Z0-9-]{4,})\s*\n?\s*P\.?\s*O\.?\s*#/i);
  if (m) poCands.push(m[1]);
  poCands.sort((a, b) => b.length - a.length);
  const poNumber = poCands[0] || null;

  // Quantity: a number directly above/next to the item description (e.g. "2 CASE", "37\nPLUG").
  const qtyM = text.match(
    /(?:^|\n)\s*(\d{1,4})\s*[\n ]\s*(?:CASE|PLUG|SUB|PCS?|EA|UNITS?|ASSY|[A-Z]{3,})\b/,
  );

  // Value for a label: inline after the label, else the nearest following line that
  // has a digit (skipping other labels). For Dwg/Part, prefer the line with "REV".
  const valByLabel = (labelRe: RegExp, preferRev = false): string | null => {
    const i = lines.findIndex((l) => labelRe.test(l));
    if (i < 0) return null;
    const inline = lines[i].replace(labelRe, '').replace(/^[#.:\s]+/, '').trim();
    if (inline && /\d/.test(inline)) return inline.replace(/\s+/g, ' ');
    let firstDigit: string | null = null;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const v = lines[j];
      if (LABEL.test(v)) continue;
      if (preferRev && /REV/i.test(v)) return v.replace(/\s+/g, ' ');
      if (/\d/.test(v) && firstDigit === null) firstDigit = v.replace(/\s+/g, ' ');
    }
    return firstDigit;
  };

  const dueM = text.match(/Due\s*Date[.:]*\s*\n?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i);

  return {
    customer,
    customerRaw,
    poNumber,
    jobNumber: valByLabel(/^Job\s*#?/i),
    line: valByLabel(/^Line\s*Item\s*#?/i),
    quantity: qtyM ? qtyM[1] : null,
    dwgNumber: valByLabel(/^Dwg\s*#?/i, true),
    partNumber: valByLabel(/^Part\s*#?/i, true),
    dueDate: toISODate(dueM ? dueM[1] : null),
  };
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
