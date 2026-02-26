import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getAdminAgentLogs } from '@careersignal/db';

/** Archived Admin: get recent agent logs (original implementation). */
export async function GET(req: Request) {
  try {
    await getRequiredUserId();
    const { searchParams } = new URL(req.url);
    const afterId = searchParams.get('after') ?? undefined;
    const db = getDb();
    const logs = await getAdminAgentLogs(db, afterId);
    return NextResponse.json({ logs });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get logs' }, { status: 500 });
  }
}
