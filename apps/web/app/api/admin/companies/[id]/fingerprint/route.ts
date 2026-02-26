import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb, getCompanyById, updateCompany } from '@careersignal/db';
import { fingerprintFromUrl } from '@careersignal/core';

/** Run ATS fingerprinting for a company; updates ats_type, scrape_strategy, connector_config, last_fingerprinted_at. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUser();
    if (!user || !user.admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const company = await getCompanyById(db, params.id);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const result = fingerprintFromUrl(company.url);

    const updated = await updateCompany(db, params.id, {
      atsType: result.atsType,
      scrapeStrategy: result.scrapeStrategy,
      connectorConfig: result.connectorConfig,
      lastFingerprintedAt: new Date(),
    });

    return NextResponse.json({
      ...updated,
      fingerprint: result,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Fingerprinting failed' },
      { status: 500 },
    );
  }
}
