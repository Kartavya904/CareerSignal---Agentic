import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb, getUsersWithQueue, getUserById } from '@careersignal/db';

/** GET: list users that have at least one queue row, with counts. Admin only. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const usersWithQueue = await getUsersWithQueue(db);
  const rows = await Promise.all(
    usersWithQueue.map(async (q) => {
      const u = await getUserById(db, q.userId);
      return {
        userId: q.userId,
        email: u?.email ?? null,
        name: u?.name ?? null,
        priority: u?.applicationAnalysisPriority ?? false,
        pending: q.pending,
        running: q.running,
        completed: q.completed,
        failed: q.failed,
        total: q.total,
      };
    }),
  );
  return NextResponse.json({ users: rows });
}
