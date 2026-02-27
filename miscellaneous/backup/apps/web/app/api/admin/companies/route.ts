import { NextResponse } from 'next/server';
import { getDb, listCompanies } from '@careersignal/db';
import { getSessionUser } from '@/lib/auth';

/** Admin-only: list all rows from the companies table (for testing / catalog view). */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || !user.admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = getDb();
    const rows = await listCompanies(db);
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list companies' },
      { status: 500 },
    );
  }
}
