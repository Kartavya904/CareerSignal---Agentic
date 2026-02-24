import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getScraperStatus } from '@/lib/scraper-state';
import { isWaitingForCaptchaSolve } from '@/lib/captcha-state';
import { isWaitingForLoginSolve } from '@/lib/login-wall-state';
import { getDb, getScrapeState } from '@careersignal/db';

/** Admin: get scraper status (running, stopRequested, waitingForCaptchaSolve, waitingForLogin). Running is read from DB so it persists after page refresh. */
export async function GET() {
  try {
    await getRequiredUserId();
    const mem = getScraperStatus();
    const dbState = await getScrapeState(getDb());
    const waitingForCaptchaSolve = isWaitingForCaptchaSolve();
    const waitingForLogin = isWaitingForLoginSolve();
    return NextResponse.json({
      running: mem.running && dbState.isRunning,
      stopRequested: mem.stopRequested,
      visibleMode: mem.visibleMode,
      waitingForCaptchaSolve,
      waitingForLogin,
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to get status' },
      { status: 500 },
    );
  }
}
