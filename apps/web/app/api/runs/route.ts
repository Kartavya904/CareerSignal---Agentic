import { NextResponse } from 'next/server';
import { getDb, listRuns, createRun } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { runInputSchema } from '@careersignal/schemas';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const runs = await listRuns(db, userId);
    return NextResponse.json(runs);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list runs' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = runInputSchema.safeParse(body);
    const input: { source_ids?: string[] } = parsed.success ? parsed.data : {};
    const userId = await getRequiredUserId();
    const db = getDb();
    const run = await createRun(db, {
      userId,
      sourceIds: input.source_ids,
    });
    return NextResponse.json(run);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create run' },
      { status: 500 },
    );
  }
}
