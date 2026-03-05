/**
 * Admin-only: import companies from a list of names.
 * POST body: { companyNames: string[] }
 * Adds companies sequentially. Skips empty names.
 * Already-researched companies (enrichment_status DONE or RUNNING) are skipped and not updated.
 * New or updatable rows get origin 'CSV_IMPORT', enrichment_status PENDING, and placeholder url.
 * Response includes added, total, and skipped counts.
 */
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  getDb,
  upsertCompanyEnrichment,
  normalizeCompanyName,
  findCompanyByNormalizedName,
} from '@careersignal/db';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { companyNames?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body. Expected { companyNames: string[] }' },
      { status: 400 },
    );
  }

  const raw = body.companyNames;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: 'companyNames must be an array of strings' },
      { status: 400 },
    );
  }

  const companyNames = raw
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter((n) => n.length > 0);

  if (companyNames.length === 0) {
    return NextResponse.json({ error: 'No valid company names provided' }, { status: 400 });
  }

  const db = getDb();
  const added: { name: string; id: string }[] = [];
  let skipped = 0;

  for (const name of companyNames) {
    const existing = await findCompanyByNormalizedName(db, name);
    if (
      existing &&
      (existing.enrichmentStatus === 'DONE' || existing.enrichmentStatus === 'RUNNING')
    ) {
      skipped++;
      continue;
    }
    const normalized = normalizeCompanyName(name);
    const placeholderUrl = `https://${normalized || 'unknown'}.placeholder`;
    const upserted = await upsertCompanyEnrichment(db, {
      name,
      normalizedName: normalized,
      url: placeholderUrl,
      origin: 'CSV_IMPORT',
      enrichmentStatus: 'PENDING',
    });
    added.push({ name: upserted.name, id: upserted.id });
  }

  return NextResponse.json({
    ok: true,
    total: companyNames.length,
    added: added.length,
    skipped,
    companies: added,
  });
}
