import { NextRequest, NextResponse } from 'next/server';
import { jobsDB } from '@/lib/json-db';
import { machinistJobGuard } from '@/lib/machinist-guard';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // The floor screen sends { pin } when a machinist presses Start.
    const body: Record<string, unknown> = await request.json().catch(() => ({}));
    const denied = await machinistJobGuard(request, id, 'toggle', body);
    if (denied) return denied;
    const startedBy = typeof body.startedBy === 'string' ? body.startedBy : undefined;
    const job = await jobsDB.toggleInProgress(id, startedBy);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error('Error toggling in-progress:', error);
    return NextResponse.json(
      { error: 'Failed to toggle in-progress' },
      { status: 500 }
    );
  }
}
