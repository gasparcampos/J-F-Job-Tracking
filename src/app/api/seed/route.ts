import { NextResponse } from 'next/server';
import { departmentsDB, employeesDB, resetDepartments, seedDB } from '@/lib/json-db';

export const runtime = 'nodejs';

/**
 * GET /api/seed
 * Ensures defaults exist. The previous SQLite/JSON implementation wiped the
 * file on each call; with Firestore we keep data and only reseed defaults
 * when collections are empty. `?reset=departments` forces the old behavior
 * for the departments collection.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const reset = url.searchParams.get('reset');

    if (reset === 'departments') {
      await resetDepartments();
    } else {
      await seedDB();
    }

    const [departments, employees] = await Promise.all([
      departmentsDB.findAll(),
      employeesDB.findAll(),
    ]);

    return NextResponse.json({
      message: 'Database ready',
      departments,
      employees,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed database' },
      { status: 500 }
    );
  }
}
