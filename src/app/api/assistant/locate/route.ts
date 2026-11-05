import { NextRequest, NextResponse } from 'next/server';
import { jobsDB, departmentsDB, extraPartsDB } from '@/lib/json-db';
import { ocrBuffer } from '@/lib/ocr';
import { locateJobsFromText, describeLocations } from '@/lib/job-locate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * POST multipart { file, lang } -- a photo or PDF of a print / route sheet.
 * Reads it with OCR, matches it to jobs (JOB#, PO#, DWG#, Part#) and replies
 * where each job is on the board.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const lang = form.get('lang') === 'en' ? 'en' : 'es';
    if (!(file instanceof Blob) || !file.size) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: lang === 'es' ? 'El archivo es muy grande (máx. 15 MB).' : 'File too large (max 15 MB).' },
        { status: 413 }
      );
    }

    const name = (file as File).name?.toLowerCase() ?? '';
    const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
    const buffer = Buffer.from(await file.arrayBuffer());

    const [ocrText, jobs, departments, extraParts] = await Promise.all([
      ocrBuffer(buffer, isPdf),
      jobsDB.findAll(),
      departmentsDB.findAll(),
      extraPartsDB.findAll(),
    ]);

    const text = ocrText;
    const result = locateJobsFromText(text, jobs, departments, extraParts);
    const reply = !text.trim()
      ? lang === 'es'
        ? 'No pude leer texto en esa imagen. Intenta con una foto más clara y derecha.'
        : "I couldn't read any text in that image. Try a clearer, straight-on photo."
      : describeLocations(result, lang);

    return NextResponse.json({
      reply,
      matches: result.matches,
      extras: result.extras,
      textFound: text.trim().length > 0,
    });
  } catch (error) {
    console.error('Assistant locate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not read the image' },
      { status: 500 }
    );
  }
}
