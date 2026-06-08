import { NextResponse } from 'next/server';
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
