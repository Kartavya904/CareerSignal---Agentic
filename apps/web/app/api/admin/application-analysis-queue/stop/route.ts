import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { requestQueueStopForUser } from '@/lib/application-analysis-queue-worker';
import { getDb, getRunningAnalysisForUser } from '@careersignal/db';
import {
  getAssistantAbortController,
  clearAssistantAbortController,
  clearAssistantRunning,
} from '@/lib/application-assistant-state';
import { cancelLoginWait } from '@/lib/login-wall-state';
import { cancelCaptchaSolve } from '@/lib/captcha-state';
import { transitionAssistantStep } from '@/lib/application-assistant-planner';

/** POST: hard stop the queue worker for the given user. Admin only. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = body?.userId;
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  requestQueueStopForUser(userId);

  // Also abort any running pipeline for this user so it stops immediately
  const db = getDb();
  const row = await getRunningAnalysisForUser(db, userId);
  if (row) {
    const analysisId = row.id;
    const controller = getAssistantAbortController(analysisId);
    if (controller) {
      controller.abort();
      clearAssistantAbortController(analysisId);
    }
    cancelLoginWait(new Error('Stopped by user'));
    cancelCaptchaSolve(new Error('Stopped by user'));
    await transitionAssistantStep(db, analysisId, 'error', { runStatusOverride: 'error' });
    clearAssistantRunning();
  }

  return NextResponse.json({ ok: true });
}
