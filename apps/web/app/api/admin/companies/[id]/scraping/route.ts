import { NextResponse } from 'next/server';
import { getDb, updateCompany } from '@careersignal/db';
import { getSessionUser } from '@/lib/auth';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUser();
    if (!user || !user.admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
    const enabled = body?.enabled;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const db = getDb();
    const row = await updateCompany(db, params.id, { enabledForScraping: enabled });

    if (!row) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update company' },
      { status: 500 },
    );
  }
}
