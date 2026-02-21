import { NextResponse } from 'next/server';
import { getDb, getPreferencesByUserId, upsertPreferences } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { preferencesPutBodySchema } from '@careersignal/schemas';
import type { TargetLocationRow } from '@careersignal/db';

export const dynamic = 'force-dynamic';

function rowToJson(row: Awaited<ReturnType<typeof getPreferencesByUserId>>) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.userId,
    work_authorization: row.workAuthorization,
    target_locations: row.targetLocations as TargetLocationRow[],
    remote_preference: row.remotePreference,
    target_seniority: row.targetSeniority,
    target_roles: row.targetRoles,
    skills: row.skills,
    industries: row.industries,
    employment_types: row.employmentTypes,
    salary_min: row.salaryMin != null ? Number(row.salaryMin) : null,
    salary_max: row.salaryMax != null ? Number(row.salaryMax) : null,
    salary_currency: row.salaryCurrency,
    strict_filter_level: row.strictFilterLevel,
    max_contacts_per_job: row.maxContactsPerJob,
    outreach_tone: row.outreachTone,
    synced_from_profile_at: row.syncedFromProfileAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const row = await getPreferencesByUserId(db, userId);
    return NextResponse.json(rowToJson(row), {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load preferences' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = preferencesPutBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const userId = await getRequiredUserId();
    const db = getDb();
    const data = parsed.data;
    if (!data.employment_types?.length) {
      return NextResponse.json(
        { error: 'At least one employment type is required.' },
        { status: 400 },
      );
    }
    const row = await upsertPreferences(db, userId, {
      workAuthorization: data.work_authorization,
      targetLocations: data.target_locations as TargetLocationRow[],
      remotePreference: data.remote_preference,
      targetSeniority: data.target_seniority,
      targetRoles: data.target_roles,
      skills: data.skills,
      industries: data.industries,
      employmentTypes: data.employment_types,
      salaryMin: data.salary_min ?? undefined,
      salaryMax: data.salary_max ?? undefined,
      salaryCurrency: data.salary_currency ?? undefined,
      strictFilterLevel: data.strict_filter_level,
      maxContactsPerJob: data.max_contacts_per_job,
      outreachTone: data.outreach_tone ?? undefined,
    });
    return NextResponse.json(rowToJson(row));
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save preferences' },
      { status: 500 },
    );
  }
}
