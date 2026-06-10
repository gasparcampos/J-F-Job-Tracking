import { NextRequest, NextResponse } from 'next/server';
import { jobsDB, seedDB } from '@/lib/json-db';

export const runtime = 'nodejs';

// GET all jobs
export async function GET() {
  try {
    await seedDB();
    const jobs = await jobsDB.findAll();
    return NextResponse.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

// POST create a new job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const job = await jobsDB.create({
      title: body.title,
      description: body.description,
      priority: body.priority,
      departmentId: body.departmentId,
      assignedTo: body.assignedTo,
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      previewUrl: body.previewUrl,
      pageCount: body.pageCount,
      notes: body.notes,
      jobNumber: body.jobNumber,
      customer: body.customer,
      poNumber: body.poNumber,
      line: body.line,
      quantity: body.quantity,
      dwgNumber: body.dwgNumber,
      partNumber: body.partNumber,
      dueDate: body.dueDate,
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    );
  }
}

// DELETE all jobs
export async function DELETE() {
  try {
    await jobsDB.deleteAll();
    return NextResponse.json({ message: 'All jobs deleted' });
  } catch (error) {
    console.error('Error deleting jobs:', error);
    return NextResponse.json(
      { error: 'Failed to delete jobs' },
      { status: 500 }
    );
  }
}
