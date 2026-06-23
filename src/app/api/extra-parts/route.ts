import { NextRequest, NextResponse } from 'next/server';
import { extraPartsDB } from '@/lib/json-db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const parts = await extraPartsDB.findAll();
    return NextResponse.json(parts);
  } catch (error) {
    console.error('Error fetching extra parts:', error);
    return NextResponse.json({ error: 'Failed to fetch extra parts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const part = await extraPartsDB.create({
      jobId: body.jobId,
      jobNumber: body.jobNumber,
      company: body.company,
      dwgNumber: body.dwgNumber,
      partNumber: body.partNumber,
      poNumber: body.poNumber,
      name: body.name,
      heatNumber: body.heatNumber,
      partQty: body.partQty,
      place: body.place,
      partDate: body.partDate,
      employeeName: body.employeeName,
      partNotes: body.partNotes,
      active: body.active ?? true,
      exitDate: body.exitDate,
    });
    return NextResponse.json(part);
  } catch (error) {
    console.error('Error creating extra part:', error);
    return NextResponse.json({ error: 'Failed to create extra part' }, { status: 500 });
  }
}
