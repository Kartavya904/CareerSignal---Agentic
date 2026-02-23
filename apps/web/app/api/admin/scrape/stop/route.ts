import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { requestScraperStop } from '@/lib/scraper-state';

/** Admin: request scraper to stop. Loop will exit at next check. */
export async function POST() {
  try {
    await getRequiredUserId();
    requestScraperStop();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to stop' },
      { status: 500 },
    );
  }
}
