import { NextResponse } from 'next/server';
import { GoogleGenAI, Modality, StartSensitivity, type LiveConnectConfig } from '@google/genai';
import { buildJobsContext } from '@/lib/assistant-context';
import { buildAssistantTools } from '@/lib/assistant-actions';
import { departmentsDB } from '@/lib/json-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVE_MODEL = 'gemini-3.8-live';

const LIVE_PROMPT = `You are "Jarvis", the hands-free voice assistant for J&F Machine Shop's job tracker.
You are talking out loud with someone on a noisy shop floor: answer in one or two short
sentences, never read long lists unless asked, and speak in the same language the user
speaks (Spanish or English).
Answer questions using ONLY the job data below -- never invent job numbers, dates or
statuses. Jobs may be looked up by JOB#, PO#, DWG# or Part#.

You can change things with the tools (move jobs, start/pause progress, change priority /
due date / notes / assignee, add history notes, ship or return jobs, store or take out
extra parts). How changes work:
1. When the user asks for a change, call the matching tool(s). The tool result tells you
   what will be done ("proposed") and any problems ("errors"). Nothing is applied yet.
2. Briefly say what you are about to do and ask the user to confirm.
3. If the user says yes, call confirm_pending_changes. If they say no, call
   cancel_pending_changes. Then say in a few words what happened.
Never say a change is done before confirm_pending_changes returns success. If a detail
is missing (which department, which job), ask a short question instead of guessing.
The user may also confirm with a button; you'll get a text note when that happens.

JOB DATA (snapshot at the start of this conversation):
`;

// The tool schemas are written as plain JSON Schema (shared with the text
// assistant); Gemini's Schema wants upper-case type names.
function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = { ...schema };
  if (typeof out.type === 'string') out.type = out.type.toUpperCase();
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, toGeminiSchema(v)])
    );
  }
  if (out.required && !out.required.length) delete out.required;
  return out;
}

/**
 * Mints a short-lived, single-use Gemini Live token for the browser so the
 * real API key never leaves the server. The model, prompt (with a fresh job
 * snapshot) and tools are locked into the token.
 */
export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the server.' },
      { status: 501 }
    );
  }

  try {
    const [jobsContext, departments] = await Promise.all([buildJobsContext(), departmentsDB.findAll()]);
    const deptNames = departments
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((d) => d.name);

    const functionDeclarations = [
      ...buildAssistantTools(deptNames).map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: toGeminiSchema(t.function.parameters),
      })),
      {
        name: 'confirm_pending_changes',
        description: 'Apply the changes proposed in this conversation, after the user said yes.',
      },
      {
        name: 'cancel_pending_changes',
        description: 'Discard the proposed changes, after the user said no.',
      },
    ];

    const config: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: LIVE_PROMPT + jobsContext,
      tools: [{ functionDeclarations }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Shop floor is loud: be slower to decide someone started talking, and
      // wait a bit longer before treating a pause as the end of the sentence.
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          silenceDurationMs: 700,
        },
      },
    };

    const ai = new GoogleGenAI({ apiKey });
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: { model: LIVE_MODEL, config },
      },
    });

    return NextResponse.json({ token: token.name, model: LIVE_MODEL, config });
  } catch (error) {
    console.error('Live token error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start live session' },
      { status: 500 }
    );
  }
}
