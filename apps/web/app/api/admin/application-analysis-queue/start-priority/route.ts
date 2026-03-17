import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  runPriorityQueueWorker,
  getQueueWorkerRunningUserId,
} from '@/lib/application-analysis-queue-worker';

/** POST: start processing the queue for all priority users in cyclic order. Admin only. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const runningFor = getQueueWorkerRunningUserId();
  if (runningFor != null) {
    return NextResponse.json({ error: 'Queue worker is already running' }, { status: 409 });
  }

  runPriorityQueueWorker();
  return NextResponse.json({ ok: true });
}
