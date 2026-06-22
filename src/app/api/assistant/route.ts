import { NextRequest, NextResponse } from 'next/server';
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured. Add it to .env.local to enable the assistant.' },
        { status: 501 }
      );
    }

    const body = await request.json();
    const messages = body.messages as ChatMessage[] | undefined;
    if (!messages || !messages.length) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    const jobsContext = await buildJobsContext();
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT + jobsContext,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', res.status, errText);
      return NextResponse.json(
        { error: `Assistant request failed (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text ?? '';

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Assistant error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Assistant unavailable' },
      { status: 500 }
    );
  }
}
