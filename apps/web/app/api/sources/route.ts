import { NextResponse } from 'next/server';
import { getDb, listSources, addSource } from '@careersignal/db';
import { getDefaultUserId } from '@/lib/user';
import { sourceInputSchema } from '@careersignal/schemas';

export async function GET() {
  try {
    const userId = await getDefaultUserId();
    const db = getDb();
    const sources = await listSources(db, userId);
    return NextResponse.json(sources);
  } catch (e) {
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
    const userId = await getDefaultUserId();
    const db = getDb();
    const source = await addSource(db, userId, {
      name: parsed.data.name,
      url: parsed.data.url,
      type: parsed.data.type,
      isBlessed: parsed.data.is_blessed,
    });
    return NextResponse.json(source);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to add source' },
      { status: 500 },
    );
  }
}
