import { NextResponse } from 'next/server';
import {
  getDb,
  listBlessedSources,
  seedBlessedSourcesTable,
  BLESSED_SOURCES,
  countJobListingsByBlessedSource,
} from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';

/** Returns the list of default sources users can add. Reads from blessed_sources; seeds if empty. */
export async function GET() {
  try {
    await getRequiredUserId();
    const db = getDb();
    let sources = await listBlessedSources(db);
    if (sources.length === 0) {
      await seedBlessedSourcesTable();
      sources = await listBlessedSources(db);
    }
    const list =
      sources.length > 0
        ? await Promise.all(
            sources.map(async (s) => {
              const jobCount = await countJobListingsByBlessedSource(db, s.id);
              return {
                id: s.id,
                name: s.name,
                url: s.url,
                type: s.type,
                slug: s.slug ?? undefined,
                job_count: jobCount,
              };
            }),
          )
        : BLESSED_SOURCES.map((s) => ({
            id: undefined,
            name: s.name,
            url: s.url,
            type: s.type,
            slug: undefined,
            job_count: 0,
          }));
    return NextResponse.json(list);
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
