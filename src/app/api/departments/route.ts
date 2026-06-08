import { NextRequest, NextResponse } from 'next/server';
import { departmentsDB, seedDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await seedDB();
    const departments = await departmentsDB.findAll();
    return NextResponse.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch departments' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const department = await departmentsDB.update(body.id, { name: body.name });

    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    return NextResponse.json(department);
  } catch (error) {
    console.error('Error updating department:', error);
    return NextResponse.json(
      { error: 'Failed to update department' },
      { status: 500 }
    );
  }
}
