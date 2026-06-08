import { NextRequest, NextResponse } from 'next/server';
import { jobsDB } from '@/lib/json-db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, targetDeptId, newOrder } = body;
    
    if (!jobId || !targetDeptId || newOrder === undefined) {
      return NextResponse.json(
        { error: 'jobId, targetDeptId, and newOrder are required' },
        { status: 400 }
      );
    }
    
    const job = jobsDB.reorder(jobId, targetDeptId, newOrder);
    
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Return all jobs sorted correctly
    const allJobs = jobsDB.findAll();
    return NextResponse.json({ job, jobs: allJobs });
  } catch (error) {
    console.error('Error reordering job:', error);
    return NextResponse.json(
      { error: 'Failed to reorder job' },
      { status: 500 }
    );
  }
}
