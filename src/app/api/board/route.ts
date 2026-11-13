import { NextResponse } from 'next/server';
import { jobsDB, departmentsDB, usersDB } from '@/lib/json-db';
import { visibleDepartments } from '@/lib/dept-flow';

export const runtime = 'nodejs';

/**
 * The shop board shown on the login screen before anyone signs in.
 * Public on purpose, so it only carries what the floor needs to see:
 * the machinist departments, who works in each (names only) and a short
 * line per job. No customer, PDF, notes, history or prices.
 */
export async function GET() {
  try {
    const [jobs, depts, users] = await Promise.all([jobsDB.findAll(), departmentsDB.findAll(), usersDB.listAll()]);

    const machinists = users.filter((u) => u.isActive && u.role === 'machinist' && u.hasPin);
    const departments = visibleDepartments(depts)
      .map((d) => ({
        id: d.id,
        name: d.name,
        color: d.color,
        order: d.order,
        people: machinists.filter((u) => u.departmentIds.includes(d.id)).map((u) => ({ id: u.id, name: u.name })),
      }))
      .filter((d) => d.people.length > 0)
      .sort((a, b) => a.order - b.order);

    const ids = new Set(departments.map((d) => d.id));
    const boardJobs = jobs
      .filter((j) => ids.has(j.departmentId) && !j.shipped && j.deviationStatus !== 'pending')
      .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3) || (a.order ?? 0) - (b.order ?? 0))
      .map((j) => ({
        id: j.id,
        departmentId: j.departmentId,
        jobNumber: j.jobNumber ?? '',
        name: j.name || j.title || '',
        priority: j.priority ?? 3,
        quantity: j.quantity ?? '',
        dueDate: j.dueDate ? String(j.dueDate).slice(0, 10) : '',
        assignedTo: j.assignedTo ?? '',
        inProgress: !!j.inProgress,
      }));

    return NextResponse.json({ departments, jobs: boardJobs }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error building board:', error);
    return NextResponse.json({ error: 'Failed to load board' }, { status: 500 });
  }
}
