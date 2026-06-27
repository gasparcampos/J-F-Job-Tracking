import { NextRequest, NextResponse } from 'next/server';
import { employeesDB, seedDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await seedDB();
    const employees = await employeesDB.findAll();
    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await seedDB();
    const body = await request.json();
    const name = (body?.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const employee = await employeesDB.create({ name, email: body?.email });
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error('Error creating employee:', error);
    return NextResponse.json(
      { error: 'Failed to create employee' },
      { status: 500 }
    );
  }
}
