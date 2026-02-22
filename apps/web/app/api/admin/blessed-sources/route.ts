import { NextResponse } from 'next/server';
import { getDb, listBlessedSources, seedBlessedSourcesTable } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';

/** Admin-only: list all blessed sources. Single-user V1: any signed-in user is admin. Seeds if empty. */
export async function GET() {
  try {
    await getRequiredUserId();
    const db = getDb();
    let sources = await listBlessedSources(db);
    if (sources.length === 0) {
      await seedBlessedSourcesTable();
      sources = await listBlessedSources(db);
    }
    return NextResponse.json(sources);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list blessed sources' },
      { status: 500 },
    );
  }
}
