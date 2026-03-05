/**
 * Admin-only: list CSV-import companies that are not yet researched (PENDING, ERROR, RUNNING).
 * GET /api/admin/companies/unresearched
 * Response: { companyNames: string[], count: number }
 */
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb, listUnresearchedCsvImportCompanies } from '@careersignal/db';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const rows = await listUnresearchedCsvImportCompanies(db);
  const companyNames = rows.map((r) => r.name);

  return NextResponse.json({
    companyNames,
    count: companyNames.length,
  });
}
