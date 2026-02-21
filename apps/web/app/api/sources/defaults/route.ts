import { NextResponse } from 'next/server';
import { BLESSED_SOURCES } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';

/** Returns the list of default sources users can add. Only stored in DB when user adds one. */
export async function GET() {
  try {
    await getRequiredUserId();
    const list = BLESSED_SOURCES.map((s) => ({
      name: s.name,
      url: s.url,
      type: s.type,
    }));
    return NextResponse.json(list);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list defaults' },
      { status: 500 },
    );
  }
}
