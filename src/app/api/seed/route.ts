import { NextResponse } from 'next/server';
import { departmentsDB, employeesDB } from '@/lib/json-db';
import fs from 'fs';

const DB_PATH = '/tmp/jobtracker.json';

export async function GET() {
  try {
    // Force reset the database by deleting the file
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }
    
    // The next read will create the default data
    const departments = departmentsDB.findAll();
    const employees = employeesDB.findAll();
    
    return NextResponse.json({ 
      message: 'Database reset successfully', 
      departments,
      employees 
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed database' },
      { status: 500 }
    );
  }
}
