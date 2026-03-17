import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb, users } from '@careersignal/db';
import { eq } from 'drizzle-orm';

/** POST: toggle application analysis priority flag for a user. Admin only. */
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
  const priority = body?.priority;
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  if (typeof priority !== 'boolean') {
    return NextResponse.json({ error: 'priority boolean required' }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(users)
    .set({ applicationAnalysisPriority: priority, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
