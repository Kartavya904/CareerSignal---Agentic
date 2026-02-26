import { NextResponse } from 'next/server';
import { signalLoggedIn, isWaitingForLoginSolve } from '@/lib/login-wall-state';
import { getRequiredUserId } from '@/lib/auth';

/** [ARCHIVED] Admin: signal that the user has logged in. Scrape loop archived. */
export async function POST() {
  try {
    await getRequiredUserId();
    if (!isWaitingForLoginSolve()) {
      return NextResponse.json({ ok: false, error: 'No login solve in progress' }, { status: 400 });
    }
    const html = await signalLoggedIn();
    return NextResponse.json({ ok: true, htmlLength: html.length });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
