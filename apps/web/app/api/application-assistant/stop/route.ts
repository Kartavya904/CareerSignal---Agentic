import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getRunningAnalysisForUser } from '@careersignal/db';
import {
  getAssistantAbortController,
  clearAssistantAbortController,
  clearAssistantRunning,
} from '@/lib/application-assistant-state';
import { cancelLoginWait } from '@/lib/login-wall-state';
import { cancelCaptchaSolve } from '@/lib/captcha-state';
import { transitionAssistantStep } from '@/lib/application-assistant-planner';

export async function POST() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const row = await getRunningAnalysisForUser(db, userId);
    if (!row) {
      return NextResponse.json({ ok: false, message: 'Not running' });
    }
    const analysisId = row.id;

    // Hard stop: abort the pipeline's controller so it exits at next check
    const controller = getAssistantAbortController(analysisId);
    if (controller) {
      controller.abort();
      clearAssistantAbortController(analysisId);
    }

    // Unblock if stuck waiting on login or captcha
    cancelLoginWait(new Error('Stopped by user'));
    cancelCaptchaSolve(new Error('Stopped by user'));

    // Mark run as error immediately so UI updates and status poll sees "not running"
    await transitionAssistantStep(db, analysisId, 'error', { runStatusOverride: 'error' });
    clearAssistantRunning();

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
