import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { buildJobsContext } from '@/lib/assistant-context';
import { buildAssistantTools, resolveToolCalls, type AssistantLang, type ToolCall } from '@/lib/assistant-actions';
import { ensureZaiConfig } from '@/lib/ensure-zai-config';
import { departmentsDB } from '@/lib/json-db';

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
time and your replies are often read out loud: short sentences, no tables, no markdown.
Always reply in the same language the user wrote in (Spanish or English).

You can also CHANGE things with the tools provided (move jobs, start/pause progress,
change priority / due date / notes / assignee, add history notes, ship or return jobs,
store or take out extra parts). When the user asks for a change, call the matching
tool(s) -- several at once if they ask for several changes. The app shows the user
what will happen and asks them to confirm before anything is applied, so do NOT ask
for confirmation yourself and never say a change is already done. If a needed detail
is missing or ambiguous (e.g. which department, or the JOB# doesn't match any job),
ask a short question instead of calling a tool. Only call tools for explicit change
requests, never for plain questions.

JOB DATA:
`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages = body.messages as ChatMessage[] | undefined;
    const lang: AssistantLang = body.lang === 'es' ? 'es' : 'en';
    if (!messages || !messages.length) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    // ZAI.create() reads ./.z-ai-config (gitignored) for { baseUrl, apiKey }.
    // In production, write that file on first request from env vars (see
    // ensure-zai-config.ts) since the file itself can't be committed/deployed.
    ensureZaiConfig();
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

    const [jobsContext, departments] = await Promise.all([buildJobsContext(), departmentsDB.findAll()]);
    const deptNames = departments
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((d) => d.name);

    const completion = await zai.chat.completions.create({
      model: 'glm-4.6',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + jobsContext },
        ...messages,
      ],
      tools: buildAssistantTools(deptNames),
      tool_choice: 'auto',
    });

    const message = completion.choices?.[0]?.message ?? {};
    const toolCalls: ToolCall[] = message.tool_calls ?? [];
    const content: string = (message.content ?? '').trim();

    if (!toolCalls.length) {
      return NextResponse.json({ reply: content });
    }

    const { actions, errors } = await resolveToolCalls(toolCalls, lang);
    const fallback = actions.length
      ? lang === 'es' ? '¿Confirmas estos cambios?' : 'Confirm these changes?'
      : '';
    const reply = [content, ...errors].filter(Boolean).join('\n') || fallback;

    return NextResponse.json({ reply, actions });
  } catch (error) {
    console.error('Assistant error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Assistant unavailable' },
      { status: 500 }
    );
  }
}
