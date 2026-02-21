import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getUserMetadataByUserId } from '@careersignal/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const meta = await getUserMetadataByUserId(db, userId);
    return NextResponse.json(
      {
        resumeUploadedAt: meta?.resumeUploadedAt?.toISOString() ?? null,
        resumeParsedAt: meta?.resumeParsedAt?.toISOString() ?? null,
        insightsGeneratedAt: meta?.insightsGeneratedAt?.toISOString() ?? null,
        profileUpdatedAt: meta?.profileUpdatedAt?.toISOString() ?? null,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load metadata' },
      { status: 500 },
    );
  }
}
