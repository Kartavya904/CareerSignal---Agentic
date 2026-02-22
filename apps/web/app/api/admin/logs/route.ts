import { NextResponse } from 'next/server';
import { getAgentLogs } from '@/lib/agent-logs';
import { getRequiredUserId } from '@/lib/auth';

/** Admin: get recent agent logs (poll for terminal). */
export async function GET(req: Request) {
  try {
    await getRequiredUserId();
    const { searchParams } = new URL(req.url);
    const afterId = searchParams.get('after') ?? undefined;
    const logs = getAgentLogs(afterId);
    return NextResponse.json({ logs });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get logs' }, { status: 500 });
  }
}
