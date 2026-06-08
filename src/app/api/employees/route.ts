import { NextResponse } from 'next/server';
import { employeesDB, seedDB } from '@/lib/json-db';

// GET all employees
export async function GET() {
  try {
    seedDB();
    const employees = employeesDB.findAll();
    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}
