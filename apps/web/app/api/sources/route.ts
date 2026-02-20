import { NextResponse } from 'next/server';
import { getDb, listSources, addSource } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { sourceInputSchema } from '@careersignal/schemas';

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const sources = await listSources(db, userId);
    return NextResponse.json(sources);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list sources' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = sourceInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const userId = await getRequiredUserId();
    const db = getDb();
    const source = await addSource(db, userId, {
      name: parsed.data.name,
      url: parsed.data.url,
      type: parsed.data.type,
      isBlessed: parsed.data.is_blessed,
    });
    return NextResponse.json(source);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to add source' },
      { status: 500 },
    );
  }
}
