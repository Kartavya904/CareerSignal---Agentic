import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { agentLog, clearAgentLogs } from '@/lib/agent-logs';
import { clearBrainLogs } from '@/lib/brain-logs';
import { clearAdminLogs, getDb, listBlessedSources, setScrapeRunning } from '@careersignal/db';
import {
  getScraperStatus,
  setScraperActive,
  setStopRequested,
  setVisibleMode,
} from '@/lib/scraper-state';
import { runScrapeLoop } from '@/lib/scrape-loop';

/** Admin: start continuous scraper. Returns immediately; loop runs in background until Stop. */
export async function POST(req: Request) {
  try {
    await getRequiredUserId();

    const { running } = getScraperStatus();
    if (running) {
      return NextResponse.json({ ok: false, message: 'Already running' });
    }

    const db = getDb();
    const sources = (await listBlessedSources(db)).filter((s) => s.enabledForScraping);

    if (sources.length === 0) {
      agentLog('Scraper', 'No enabled sources. Enable at least one in Admin.', { level: 'warn' });
      return NextResponse.json({ ok: false, message: 'No enabled sources' });
    }

    // New run: clear previous logs (memory + DB) and mark running in DB
    clearAgentLogs();
    clearBrainLogs();
    await clearAdminLogs(db);
    await setScrapeRunning(db, true);

    setScraperActive(true);
    setStopRequested(false);
    try {
      const body = await req.json().catch(() => ({}));
      setVisibleMode(Boolean(body?.visible));
    } catch {
      setVisibleMode(false);
    }
    agentLog('Scraper', `Starting continuous scrape for ${sources.length} source(s)...`, {
      level: 'info',
    });

    runScrapeLoop().catch(async (err) => {
      agentLog('Scraper', `Loop error: ${err instanceof Error ? err.message : String(err)}`, {
        level: 'error',
      });
      setScraperActive(false);
      await setScrapeRunning(getDb(), false);
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    setScraperActive(false);
    try {
      await setScrapeRunning(getDb(), false);
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : String(e);
    agentLog('Scraper', `Start failed: ${msg}`, { level: 'error' });
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
