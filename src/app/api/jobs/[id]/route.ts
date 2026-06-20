import { NextRequest, NextResponse } from 'next/server';
import { jobsDB, employeesDB, departmentsDB } from '@/lib/json-db';

export const runtime = 'nodejs';

// GET single job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await jobsDB.findById(id);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const departments = await departmentsDB.findAll();
    const jobWithDept = {
      ...job,
      department: departments.find((d) => d.id === job.departmentId),
    };

    return NextResponse.json(jobWithDept);
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

// PUT update job (including move to new department)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // If adding annotation
    if (body.annotation) {
      const job = await jobsDB.addAnnotation(id, body.annotation);
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json(job);
    }

    // If moving to a new department
    if (body.targetDeptId) {
      const currentJob = await jobsDB.findById(id);
      if (!currentJob) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      // Get employee name
      let employeeName = body.employeeName || '';
      if (body.employeeId && !employeeName) {
        const employee = await employeesDB.findById(body.employeeId);
        if (employee) {
          employeeName = employee.name;
        }
      }

      // Update job department. Moving to a new stage always clears the
      // in-progress flag (a job can't stay "in progress" across stages).
      const updatedJob = await jobsDB.update(id, {
        departmentId: body.targetDeptId,
        assignedTo: employeeName || currentJob.assignedTo,
        notes: body.notes,
        inProgress: false,
      });

      if (updatedJob) {
        await jobsDB.addHistory(id, {
          fromDeptId: currentJob.departmentId,
          toDeptId: body.targetDeptId,
          employeeId: body.employeeId,
          employeeName: employeeName,
          notes: body.notes,
        });
      }

      const finalJob = await jobsDB.findById(id);
      return NextResponse.json(finalJob);
    }

    // Block changing JOB# to one another job already uses.
    const newJobNumber = (body.jobNumber ?? '').trim();
    if (newJobNumber) {
      const existing = await jobsDB.findByJobNumber(newJobNumber);
      if (existing && existing.id !== id) {
        return NextResponse.json(
          {
            error: 'DUPLICATE_JOB_NUMBER',
            message: `JOB# ${newJobNumber} already exists. Use a different work number.`,
          },
          { status: 409 }
        );
      }
    }

    // Capture the prior deviation status so we can log transitions below.
    const beforeJob = await jobsDB.findById(id);

    // Regular update
    const job = await jobsDB.update(id, body);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Record deviation movements in the history so there's an exact trail of
    // when a job was sent to / cleared from the Deviations list.
    if (
      beforeJob &&
      typeof body.deviationStatus === 'string' &&
      body.deviationStatus !== (beforeJob.deviationStatus ?? '')
    ) {
      const detail = (body.deviation ?? job.deviation ?? '').trim();
      let note = '';
      if (body.deviationStatus === 'pending') {
        note = `🚩 Sent to Deviations${detail ? `: ${detail}` : ''}`;
      } else if (body.deviationStatus === 'accepted') {
        note = `✅ Deviation accepted${detail ? `: ${detail}` : ''}`;
      } else if (body.deviationStatus === 'rejected') {
        note = `🚫 Deviation rejected${detail ? `: ${detail}` : ''}`;
      }
      if (note) {
        const withHistory = await jobsDB.addHistory(id, {
          toDeptId: job.departmentId,
          notes: note,
        });
        if (withHistory) return NextResponse.json(withHistory);
      }
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: 'Failed to update job' },
      { status: 500 }
    );
  }
}

// DELETE single job
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await jobsDB.delete(id);

    if (!success) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Job deleted' });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}
