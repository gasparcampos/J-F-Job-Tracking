import { NextRequest, NextResponse } from 'next/server';
import { jobsDB, employeesDB, departmentsDB } from '@/lib/json-db';
import { formatDuration } from '@/lib/utils';

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

    // Resolve a REJECTED deviation. Two outcomes, both return the job to its
    // normal (non-deviation) state and leave a clear trail in the history:
    //   - 'rework': the same part is salvageable; it stays where it is and goes
    //     back to normal so work can continue to fix it.
    //   - 'remake': the part is scrapped; it restarts from scratch as new —
    //     progress is cleared and, if a first stage is supplied, it's sent back
    //     to the start of the route.
    if (body.deviationResolution === 'rework' || body.deviationResolution === 'remake') {
      const currentJob = await jobsDB.findById(id);
      if (!currentJob) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      const detail = (currentJob.deviation ?? '').trim();

      if (body.deviationResolution === 'rework') {
        await jobsDB.update(id, { deviationStatus: '' });
        await jobsDB.addHistory(id, {
          toDeptId: currentJob.departmentId,
          notes: `🔧 Deviation rejected → REWORK: part returned to normal to be reworked${detail ? ` (${detail})` : ''}`,
        });
      } else {
        const targetDeptId = body.targetDeptId || currentJob.departmentId;
        await jobsDB.update(id, {
          deviationStatus: '',
          deviation: '',
          inProgress: false,
          departmentId: targetDeptId,
        });
        await jobsDB.addHistory(id, {
          fromDeptId: currentJob.departmentId,
          toDeptId: targetDeptId,
          notes: `♻️ Deviation rejected → REMAKE: part scrapped, restarting from scratch as new${detail ? ` (was: ${detail})` : ''}`,
        });
      }

      const finalJob = await jobsDB.findById(id);
      return NextResponse.json(finalJob);
    }

    // Ship / un-ship. Shipping sends the job to the Enviados (Shipped) list and
    // off the Kanban board; returning brings it back to active. Both are logged.
    if (body.shipAction === 'ship' || body.shipAction === 'return') {
      const currentJob = await jobsDB.findById(id);
      if (!currentJob) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      if (body.shipAction === 'ship') {
        let employeeName = body.employeeName || '';
        if (body.employeeId && !employeeName) {
          const employee = await employeesDB.findById(body.employeeId);
          if (employee) employeeName = employee.name;
        }

        // Grand total worked across every department (plus any clock still
        // running) — stamped permanently in the ship entry so the final
        // build time is on record.
        const totalWorked =
          Object.values(currentJob.deptTimes ?? {}).reduce((sum, v) => sum + (v || 0), 0) +
          (currentJob.inProgress && currentJob.inProgressAt
            ? Math.max(0, Date.now() - new Date(currentJob.inProgressAt).getTime())
            : 0);
        const totalNote = totalWorked > 0 ? `⏱ Total build time: ${formatDuration(totalWorked)}` : '';

        await jobsDB.update(id, {
          shipped: true,
          shippedAt: new Date().toISOString(),
          assignedTo: employeeName || currentJob.assignedTo,
          inProgress: false,
        });
        await jobsDB.addHistory(id, {
          toDeptId: currentJob.departmentId,
          employeeId: body.employeeId,
          employeeName: employeeName || currentJob.assignedTo,
          notes: [body.notes || '🚚 Shipped', totalNote].filter(Boolean).join(' — '),
        });
      } else {
        await jobsDB.update(id, { shipped: false });
        await jobsDB.addHistory(id, {
          toDeptId: currentJob.departmentId,
          notes: '↩️ Returned to Active from Shipped',
        });
      }

      const finalJob = await jobsDB.findById(id);
      return NextResponse.json(finalJob);
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

      // Total time worked in the stage the job is leaving (already-banked
      // time plus the running clock, if any) — logged with the move so the
      // history shows exactly how long each stage took.
      const workedInStage =
        (currentJob.deptTimes?.[currentJob.departmentId] ?? 0) +
        (currentJob.inProgress && currentJob.inProgressAt
          ? Math.max(0, Date.now() - new Date(currentJob.inProgressAt).getTime())
          : 0);

      // Update job department. Moving to a new stage always clears the
      // in-progress flag (a job can't stay "in progress" across stages) and
      // banks any running time into the stage being left.
      const updatedJob = await jobsDB.update(id, {
        departmentId: body.targetDeptId,
        assignedTo: employeeName || currentJob.assignedTo,
        notes: body.notes,
        inProgress: false,
      });

      if (updatedJob) {
        const timeNote = workedInStage > 0 ? `⏱ Worked in stage: ${formatDuration(workedInStage)}` : '';
        await jobsDB.addHistory(id, {
          fromDeptId: currentJob.departmentId,
          toDeptId: body.targetDeptId,
          employeeId: body.employeeId,
          employeeName: employeeName,
          notes: [body.notes, timeNote].filter(Boolean).join(' — '),
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
