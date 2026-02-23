import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getAdminBrainLogs } from '@careersignal/db';

/** Admin: get recent brain logs (poll for Brain Terminal). Reads from DB so logs persist after refresh. */
export async function GET(req: Request) {
  try {
    await getRequiredUserId();
    const { searchParams } = new URL(req.url);
    const afterId = searchParams.get('after') ?? undefined;
    const db = getDb();
    const logs = await getAdminBrainLogs(db, afterId);
    return NextResponse.json({ logs });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get brain logs' }, { status: 500 });
  }
}
