import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { buildJobsContext } from '@/lib/assistant-context';
import { ensureZaiConfig } from '@/lib/ensure-zai-config';
import { jobsDB, departmentsDB } from '@/lib/json-db';

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

If, and ONLY if, the user is clearly asking you to MOVE or TRANSFER a specific job
to a specific department, do two things: (1) write a short confirmation question
asking the user to confirm the move, in their language, and (2) on its own line at
the very end of your reply, append exactly this marker with the job's JOB# and the
exact department name from the valid list below:
[[MOVE_JOB jobNumber="<job number>" department="<exact department name>"]]
Do not use this marker for any other purpose, and do not use it just because the
user asked which department a job is in -- only for an explicit move/transfer request.

JOB DATA:
`;

const MOVE_MARKER_RE = /\[\[MOVE_JOB\s+jobNumber="([^"]+)"\s+department="([^"]+)"\]\]/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages = body.messages as ChatMessage[] | undefined;
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

    const jobsContext = await buildJobsContext();

    const completion = await zai.chat.completions.create({
      model: 'glm-4.6',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + jobsContext },
        ...messages,
      ],
    });

    const rawReply: string = completion.choices?.[0]?.message?.content ?? '';
    const match = rawReply.match(MOVE_MARKER_RE);
    const reply = rawReply.replace(MOVE_MARKER_RE, '').trim();

    if (!match) {
      return NextResponse.json({ reply });
    }

    const [, jobNumber, departmentName] = match;
    const [job, department] = await Promise.all([
      jobsDB.findByJobNumber(jobNumber),
      departmentsDB.findByName(departmentName),
    ]);

    if (!job || !department) {
      return NextResponse.json({ reply });
    }

    const departments = await departmentsDB.findAll();
    const fromDeptName = departments.find((d) => d.id === job.departmentId)?.name ?? job.departmentId;

    return NextResponse.json({
      reply,
      pendingMove: {
        jobId: job.id,
        jobNumber: job.jobNumber || job.title,
        fromDeptName,
        toDeptId: department.id,
        toDeptName: department.name,
      },
    });
  } catch (error) {
    console.error('Assistant error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Assistant unavailable' },
      { status: 500 }
    );
  }
}
