import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
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

/** User hard-stop: request the queue worker to exit after the current URL. */
export async function POST() {
  try {
    const userId = await getRequiredUserId();
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
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[application-assistant/queue/stop]', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
