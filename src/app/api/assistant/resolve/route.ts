import { NextRequest, NextResponse } from 'next/server';
import { resolveToolCalls, type AssistantLang } from '@/lib/assistant-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Validates tool calls made by the realtime (Gemini Live) assistant, which
 * runs in the browser, and turns them into confirmable actions -- the same
 * resolver the text assistant uses. Nothing is written here.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const calls = (body.calls ?? []) as { name?: string; args?: Record<string, unknown> }[];
    const lang: AssistantLang = body.lang === 'es' ? 'es' : 'en';

    const { actions, errors } = await resolveToolCalls(
      calls.map((c) => ({ function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } })),
      lang
    );
    return NextResponse.json({ actions, errors });
  } catch (error) {
    console.error('Assistant resolve error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not resolve' },
      { status: 500 }
    );
  }
}
