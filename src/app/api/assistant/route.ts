import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { buildJobsContext } from '@/lib/assistant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are the shop-floor assistant for J&F Machine Shop's job tracker.
Answer questions about jobs using ONLY the job data provided below -- do not invent
job numbers, dates, or statuses that aren't listed. Jobs may be looked up by JOB#,
PO#, DWG#, or Part#. Be concise and direct, the user is on a shop floor with limited
time. Always reply in the same language the user wrote in (Spanish or English).

JOB DATA:
`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages = body.messages as ChatMessage[] | undefined;
    if (!messages || !messages.length) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    // ZAI.create() reads ./.z-ai-config (gitignored) for { baseUrl, apiKey }.
    let zai;
    try {
      zai = await ZAI.create();
    } catch {
      return NextResponse.json(
        {
          error:
            'Z.ai not configured. Fill in .z-ai-config in the project root with your real apiKey.',
        },
        { status: 501 }
      );
    }

    const jobsContext = await buildJobsContext();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + jobsContext },
        ...messages,
      ],
    });

    const reply = completion.choices?.[0]?.message?.content ?? '';

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Assistant error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Assistant unavailable' },
      { status: 500 }
    );
  }
}
