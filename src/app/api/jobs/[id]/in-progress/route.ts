import { NextRequest, NextResponse } from 'next/server';
import { jobsDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await jobsDB.toggleInProgress(id);

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
