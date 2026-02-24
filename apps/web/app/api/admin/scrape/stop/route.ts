import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { clearAgentLogs } from '@/lib/agent-logs';
import { clearBrainLogs } from '@/lib/brain-logs';
import { requestScraperStop } from '@/lib/scraper-state';
import { clearAdminLogs, getDb, setScrapeRunning } from '@careersignal/db';

/** Admin: request scraper to stop. Updates DB immediately, clears logs, loop exits at next check. */
export async function POST() {
  try {
    await getRequiredUserId();
    requestScraperStop();
    const db = getDb();
    await setScrapeRunning(db, false);
    await clearAdminLogs(db);
    clearAgentLogs();
    clearBrainLogs();
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
