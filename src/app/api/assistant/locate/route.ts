import { NextRequest, NextResponse } from 'next/server';
import { jobsDB, departmentsDB, extraPartsDB } from '@/lib/json-db';
import { ocrBuffer } from '@/lib/ocr';
import { locateJobsFromText, describeLocations, buildLocations } from '@/lib/job-locate';
import { identifyJobWithGemini } from '@/lib/gemini-locate';

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

    const [text, jobs, departments, extraParts] = await Promise.all([
      ocrBuffer(buffer, isPdf).catch((e) => {
        console.error('OCR error:', e);
        return '';
      }),
      jobsDB.findAll(),
      departmentsDB.findAll(),
      extraPartsDB.findAll(),
    ]);

    let result = locateJobsFromText(text, jobs, departments, extraParts);
    let aiNote = '';

    // OCR found nothing, or only a one-character-off match: blurry or small
    // print. Let Gemini look at the image itself and pick from the job list.
    if (!result.matches.length || result.matches.every((m) => m.approximate)) {
      const mime = isPdf ? 'application/pdf' : file.type || 'image/jpeg';
      const ai = await identifyJobWithGemini(buffer, mime, jobs);
      const wanted = new Set((ai?.jobNumbers ?? []).map((n) => n.replace(/\D/g, '')));
      const picked = jobs.filter((j) => j.jobNumber && wanted.has(j.jobNumber.replace(/\D/g, '')));
      if (picked.length) {
        picked.sort((a, b) => Number(!!a.shipped) - Number(!!b.shipped));
        const located = buildLocations(
          picked.slice(0, 6).map((job) => ({ job, matchedBy: ['AI'] })),
          jobs,
          departments,
          extraParts
        );
        result = { ...located, candidates: [] };
        const readBits = [
          ai?.read.dwgNumber ? `DWG ${ai.read.dwgNumber}` : null,
          ai?.read.partNumber ? `Part ${ai.read.partNumber}` : null,
          ai?.read.title || null,
        ].filter(Boolean);
        aiNote =
          (lang === 'es' ? '🤖 Identificado por IA leyendo el plano' : '🤖 Identified by AI reading the print') +
          (readBits.length ? ` (${readBits.join(' · ')})` : '') +
          '.';
      }
    }

    const reply =
      !text.trim() && !result.matches.length
        ? lang === 'es'
          ? 'No pude leer esa imagen. Intenta con una foto más clara y derecha donde se vea el cuadro de títulos del plano.'
          : "I couldn't read that image. Try a clearer, straight-on photo showing the drawing's title block."
        : [describeLocations(result, lang), aiNote].filter(Boolean).join('\n');

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
