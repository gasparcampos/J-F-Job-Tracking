import { NextResponse } from 'next/server';
import { getLiveVersion } from '@/lib/live-version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tiny real-time sync endpoint: returns a fingerprint of the current data.
// The board polls it every few seconds and reloads only when it changes.
export async function GET() {
  try {
    const v = await getLiveVersion();
    return NextResponse.json(
      { v },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Error reading live version:', error);
    return NextResponse.json({ v: null }, { status: 500 });
  }
}
