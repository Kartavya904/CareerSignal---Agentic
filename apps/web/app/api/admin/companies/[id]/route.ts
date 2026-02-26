import { NextResponse } from 'next/server';
import { getDb, getCompanyById, updateCompany } from '@careersignal/db';
import { getSessionUser } from '@/lib/auth';

/** Admin-only: PATCH company (e.g. test_budget). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUser();
    if (!user || !user.admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      test_budget?: { max_pages?: number; max_jobs?: number; timeout_ms?: number } | null;
    } | null;

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const db = getDb();
    const existing = await getCompanyById(db, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const updates: Parameters<typeof updateCompany>[2] = {};
    if (body.test_budget !== undefined) {
      updates.testBudget =
        body.test_budget === null
          ? null
          : {
              max_pages: body.test_budget.max_pages,
              max_jobs: body.test_budget.max_jobs,
              timeout_ms: body.test_budget.timeout_ms,
            };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(existing);
    }

    const row = await updateCompany(db, params.id, updates);
    return NextResponse.json(row ?? existing);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update company' },
      { status: 500 },
    );
  }
}
