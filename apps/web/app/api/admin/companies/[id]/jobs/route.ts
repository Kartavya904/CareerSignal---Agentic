import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb, listJobListings, getCompanyById } from '@careersignal/db';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
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

    const jobs = await listJobListings(db, {
      companyId: params.id,
      limit: 200,
    });

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
      },
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        location: j.location,
        status: j.status,
        postedAt: j.postedAt,
        lastSeenAt: j.lastSeenAt,
        jobUrl: j.jobUrl,
        applyUrl: j.applyUrl,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load jobs' },
      { status: 500 },
    );
  }
}
