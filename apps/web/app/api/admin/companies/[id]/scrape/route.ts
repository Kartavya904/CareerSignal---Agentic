import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb, getCompanyById } from '@careersignal/db';
import { runCompanyScrape } from '@/lib/run-company-scrape';

/** Run scrape now. When ats_type=GREENHOUSE, runs Greenhouse connector; otherwise 501. */
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

    const atsType = company.atsType ?? 'UNKNOWN';
    if (atsType !== 'GREENHOUSE') {
      return NextResponse.json(
        { error: 'No connector for this ATS type yet', atsType, id: params.id },
        { status: 501 },
      );
    }

    const result = await runCompanyScrape(params.id);
    return NextResponse.json({
      ok: result.ok,
      jobsFetched: result.jobsFetched,
      jobsUpserted: result.jobsUpserted,
      observationsCreated: result.observationsCreated,
      evidencePath: result.evidencePath,
      errors: result.errors,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Scrape failed' },
      { status: 500 },
    );
  }
}
