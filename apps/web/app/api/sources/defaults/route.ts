import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';

/** Returns the list of default sources users can add. Will be repopulated from companies/sources catalog in Phase 3+. */
export async function GET() {
  try {
    await getRequiredUserId();
    return NextResponse.json([]);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list defaults' },
      { status: 500 },
    );
  }
}
