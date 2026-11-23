import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const MODEL = 'gemini-3.8-flash';

export interface PurchaseOrderRead {
  poNumber: string;
  supplier: string;
  orderDate: string; // as printed, e.g. 11/19/2026
  eta: string;
  // WO column of each line = the J&F JOB#.
  workOrders: string[];
}

const PROMPT = `This is a photo or screenshot that may show J&F Machine Shop's "Purchase Orders"
form (from their Access system). That form has a title "Purchase Order Number: NNNNN",
fields PO NUMBER, Supplier, Order Date, ETA, and a lines table with columns like Unit,
PROD_DESCRIP, SPEC, REV, PART#, WO, Unit Price. The WO column is the shop's JOB# (5 digits).

If the image is NOT that Purchase Order form (e.g. a drawing or route sheet), return
isPurchaseOrder=false and nothing else.
If it is, read exactly what is printed: PO number, Supplier (full name), Order Date, ETA
(dates as MM/DD/YYYY), and the WO of every line that has one. Do not guess unreadable
digits: leave a field empty instead.`;

/** Reads a J&F Purchase Order form with Gemini vision. Null if it isn't one. */
export async function readPurchaseOrderWithGemini(
  buffer: Buffer,
  mimeType: string
): Promise<PurchaseOrderRead | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data: buffer.toString('base64') } }, { text: PROMPT }],
        },
      ],
      config: {
        temperature: 0,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isPurchaseOrder: { type: Type.BOOLEAN },
            poNumber: { type: Type.STRING },
            supplier: { type: Type.STRING },
            orderDate: { type: Type.STRING },
            eta: { type: Type.STRING },
            workOrders: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['isPurchaseOrder'],
        },
      },
    });
    const p = JSON.parse(res.text ?? '{}');
    if (!p.isPurchaseOrder) return null;
    const workOrders: string[] = Array.isArray(p.workOrders)
      ? [...new Set<string>(p.workOrders.map((w: unknown) => String(w).replace(/\D/g, '')).filter(Boolean))]
      : [];
    return {
      poNumber: String(p.poNumber ?? '').trim(),
      supplier: String(p.supplier ?? '').trim().toUpperCase(),
      orderDate: String(p.orderDate ?? '').trim(),
      eta: String(p.eta ?? '').trim(),
      workOrders,
    };
  } catch (error) {
    console.error('Gemini PO read error:', error);
    return null;
  }
}

/** "11/19/2026" -> "11/19" (the shop's notes use month/day). */
export function shortDate(d: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})/.exec(d.trim());
  return m ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}` : d.trim();
}

/** Shop-style note: "@ HOUSTON PLATING HUMBLE 11/19 PO# 57258 ETA 11/30". */
export function poNote(po: PurchaseOrderRead): string {
  return [
    `@ ${po.supplier || '?'}`,
    po.orderDate && shortDate(po.orderDate),
    po.poNumber && `PO# ${po.poNumber}`,
    po.eta && `ETA ${shortDate(po.eta)}`,
  ]
    .filter(Boolean)
    .join(' ');
}
