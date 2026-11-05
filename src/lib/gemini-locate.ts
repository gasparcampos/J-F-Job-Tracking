import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import type { Job } from '@/types';

const MODEL = 'gemini-3.8-flash';

export interface GeminiIdentify {
  jobNumbers: string[];
  read: { dwgNumber?: string; partNumber?: string; title?: string; customer?: string; jobNumber?: string };
}

const PROMPT = `You are looking at a photo or scan of a machining print (engineering drawing)
and/or a route sheet from J&F Machine Shop. Photos may be blurry, tilted, folded or partly
cut off.

1. Read the identifying data, mainly from the drawing title block: drawing number
   ("DWG NO"), part number, revision, title / part name, customer (e.g. HALLIBURTON), and
   any JOB# (5 digits, usually starting with 43) or PO#.
2. Compare it with the shop's jobs listed below and return the job numbers this print
   belongs to. Match on the drawing number or part number (allow for a character or two
   that is hard to read); title and customer only help to confirm. Several jobs can share
   the same drawing (repeat orders) -- return all of them. If nothing matches with
   reasonable confidence, return an empty list. Never guess from the title alone.

JOBS (JOB# | DWG# | Part# | name | customer | PO#):
`;

/**
 * Asks Gemini (vision) which job a print belongs to. Used when plain OCR
 * can't read the title block well enough (blurry / small / angled photos).
 * Returns null if Gemini isn't configured or fails.
 */
export async function identifyJobWithGemini(
  buffer: Buffer,
  mimeType: string,
  jobs: Job[]
): Promise<GeminiIdentify | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const list = jobs
    .filter((j) => j.jobNumber)
    .map((j) => [j.jobNumber, j.dwgNumber, j.partNumber, j.name, j.customer, j.poNumber].map((v) => v || '-').join(' | '))
    .join('\n');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data: buffer.toString('base64') } }, { text: PROMPT + list }],
        },
      ],
      config: {
        temperature: 0,
        // Reading a title block doesn't need long reasoning; keeps it fast.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            read: {
              type: Type.OBJECT,
              properties: {
                dwgNumber: { type: Type.STRING },
                partNumber: { type: Type.STRING },
                title: { type: Type.STRING },
                customer: { type: Type.STRING },
                jobNumber: { type: Type.STRING },
              },
            },
            jobNumbers: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['jobNumbers'],
        },
      },
    });
    const parsed = JSON.parse(res.text ?? '{}');
    return {
      jobNumbers: Array.isArray(parsed.jobNumbers) ? parsed.jobNumbers.map(String) : [],
      read: parsed.read ?? {},
    };
  } catch (error) {
    console.error('Gemini identify error:', error);
    return null;
  }
}
