import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { appendActivity } from '@/lib/session-activity';

const activityBodySchema = {
  type: (v: unknown) => typeof v === 'string' && v.length > 0,
  payload: (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v),
  timestamp: (v: unknown) => typeof v === 'string',
};

export async function POST(request: Request) {
  try {
    const userId = await getRequiredUserId();
    const body = await request.json().catch(() => ({}));
    const type = body?.type ?? '';
    const payload = typeof body?.payload === 'object' && body?.payload !== null ? body.payload : {};
    const timestamp =
      typeof body?.timestamp === 'string' ? body.timestamp : new Date().toISOString();

    if (!activityBodySchema.type(type)) {
      return NextResponse.json({ error: 'Invalid or missing type' }, { status: 400 });
    }

    appendActivity(userId, { type, payload: payload as Record<string, unknown>, timestamp });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to record activity' },
      { status: 500 },
    );
  }
}
