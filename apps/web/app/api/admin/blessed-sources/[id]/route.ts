import { NextResponse } from 'next/server';
import { getDb, setBlessedSourceEnabledForScraping, getBlessedSourceById } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';

/** Admin-only: PATCH blessed source (e.g. enabled_for_scraping). Single-user V1: any signed-in user is admin. */
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getRequiredUserId();
    const { id } = await params;
    const body = await _req.json();
    const enabledForScraping = body.enabled_for_scraping;
    if (typeof enabledForScraping !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled_for_scraping must be a boolean' },
        { status: 400 },
      );
    }
    const db = getDb();
    const existing = await getBlessedSourceById(db, id);
    if (!existing) {
      return NextResponse.json({ error: 'Blessed source not found' }, { status: 404 });
    }
    const updated = await setBlessedSourceEnabledForScraping(db, id, enabledForScraping);
    return NextResponse.json(updated);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update blessed source' },
      { status: 500 },
    );
  }
}
