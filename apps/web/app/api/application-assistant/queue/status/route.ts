import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getQueueCountsByUser, getQueueProgressForUser } from '@careersignal/db';
import { isQueueWorkerRunningForUser } from '@/lib/application-analysis-queue-worker';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const running = isQueueWorkerRunningForUser(userId);
    const counts = await getQueueCountsByUser(db, userId);
    const progress = await getQueueProgressForUser(db, userId);
    return NextResponse.json({
      running,
      current: progress?.current ?? 0,
      total: progress?.total ?? 0,
      pending: counts.pending,
      completed: counts.completed,
      failed: counts.failed,
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[application-assistant/queue/status]', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
