import { NextRequest, NextResponse } from 'next/server';
import { jobsDB, departmentsDB, extraPartsDB } from '@/lib/json-db';
import { ocrBuffer } from '@/lib/ocr';
import { locateJobsFromText, describeLocations, buildLocations } from '@/lib/job-locate';
import { identifyJobWithGemini } from '@/lib/gemini-locate';
import { readPurchaseOrderWithGemini, poNote, type PurchaseOrderRead } from '@/lib/gemini-po';
import { resolveToolCalls, type ToolCall } from '@/lib/assistant-actions';
import type { AssistantAction, Department, Job } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 15 * 1024 * 1024;

// The outside-service department ("O.S").
const isOutsideService = (d: Department) => d.name.replace(/[^a-z]/gi, '').toUpperCase() === 'OS';

/**
 * A J&F Purchase Order photo: propose sending each WO (JOB#) to O.S with the
 * shop-style note, or just updating the note if it's already there. Nothing
 * is applied until the user confirms in the chat.
 */
async function proposeFromPurchaseOrder(
  po: PurchaseOrderRead,
  jobs: Job[],
  departments: Department[],
  lang: 'es' | 'en'
): Promise<{ text: string; actions: AssistantAction[] }> {
  const t = (es: string, en: string) => (lang === 'es' ? es : en);
  const os = departments.find(isOutsideService);
  const note = poNote(po);
  const head = [
    `📄 PO# ${po.poNumber || '?'}`,
    po.supplier,
    po.eta && `ETA ${po.eta}`,
    po.workOrders.length ? `WO ${po.workOrders.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (!po.workOrders.length) {
    return { text: `${head}\n${t('No pude leer el WO (JOB#) en el PO.', "Couldn't read the WO (JOB#) on the PO.")}`, actions: [] };
  }

  const calls: ToolCall[] = [];
  const lines: string[] = [head];
  for (const wo of po.workOrders) {
    const job = jobs.find((j) => (j.jobNumber ?? '').replace(/\D/g, '') === wo && !j.shipped);
    if (!job) {
      lines.push(t(`JOB# ${wo} no está en los trabajos activos.`, `JOB# ${wo} isn't an active job.`));
      continue;
    }
    const current = job.notes?.trim();
    if (current && current !== note) {
      lines.push(
        t(`Nota actual de JOB# ${wo}: "${current}" (se reemplaza).`, `Current note on JOB# ${wo}: "${current}" (will be replaced).`)
      );
    }
    const call =
      os && job.departmentId !== os.id
        ? { name: 'move_job', args: { job_number: job.jobNumber, department: os.name, notes: note } }
        : { name: 'update_job', args: { job_number: job.jobNumber, notes: note } };
    calls.push({ function: { name: call.name, arguments: JSON.stringify(call.args) } });
  }
  const { actions, errors } = calls.length ? await resolveToolCalls(calls, lang) : { actions: [], errors: [] };
  return { text: [...lines, ...errors].join('\n'), actions };
}

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

    // Screenshot / photo of a J&F Purchase Order: offer to record where the
    // job was sent.
    let poActions: AssistantAction[] = [];
    let poText = '';
    if (!isPdf && /purchase\s*orders?/i.test(text)) {
      const po = await readPurchaseOrderWithGemini(buffer, file.type || 'image/jpeg');
      if (po) {
        const proposal = await proposeFromPurchaseOrder(po, jobs, departments, lang);
        poActions = proposal.actions;
        poText = proposal.text;
      }
    }

    const reply =
      !text.trim() && !result.matches.length
        ? lang === 'es'
          ? 'No pude leer esa imagen. Intenta con una foto más clara y derecha donde se vea el cuadro de títulos del plano.'
          : "I couldn't read that image. Try a clearer, straight-on photo showing the drawing's title block."
        : [describeLocations(result, lang), aiNote, poText].filter(Boolean).join('\n');

    return NextResponse.json({
      reply,
      matches: result.matches,
      extras: result.extras,
      textFound: text.trim().length > 0,
      actions: poActions,
    });
  } catch (error) {
    console.error('Assistant locate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not read the image' },
      { status: 500 }
    );
  }
}
