import { NextResponse } from 'next/server';
import { getDb, listSources } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';

/** Returns job listings for a source. Canonical job cache will be wired in Phase 8+; for now returns empty. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getRequiredUserId();
    const { id: sourceId } = await params;
    const db = getDb();

    const sources = await listSources(db, userId);
    const source = sources.find((s) => s.id === sourceId);
    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json([]);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list jobs' },
      { status: 500 },
    );
  }
}
