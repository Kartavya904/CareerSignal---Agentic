import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  runQueueWorker,
  getQueueWorkerRunningUserId,
} from '@/lib/application-analysis-queue-worker';

/** POST: start (or resume) processing the queue for the given user. Admin only. */
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

  const runningFor = getQueueWorkerRunningUserId();
  if (runningFor != null && runningFor !== userId) {
    return NextResponse.json(
      { error: 'Queue worker is already running for another user' },
      { status: 409 },
    );
  }
  if (runningFor === userId) {
    return NextResponse.json({ ok: true, message: 'Already running for this user' });
  }

  runQueueWorker(userId);
  return NextResponse.json({ ok: true });
}
