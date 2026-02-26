import { NextResponse } from 'next/server';
import { signalCaptchaSolved, isWaitingForCaptchaSolve } from '@/lib/captcha-state';
import { getRequiredUserId } from '@/lib/auth';

/** [ARCHIVED] Admin: signal that captcha was solved. Scrape loop archived. */
export async function POST() {
  try {
    await getRequiredUserId();
    if (!isWaitingForCaptchaSolve()) {
      return NextResponse.json(
        { ok: false, error: 'No captcha solve in progress' },
        { status: 400 },
      );
    }
    const html = await signalCaptchaSolved();
    return NextResponse.json({ ok: true, htmlLength: html.length });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
