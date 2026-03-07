import { NextResponse } from 'next/server';
import { getDb, getPreferencesByUserId, upsertPreferences } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { preferencesPutBodySchema } from '@careersignal/schemas';
import type { TargetLocationRow } from '@careersignal/db';

export const dynamic = 'force-dynamic';

function rowToJson(row: Awaited<ReturnType<typeof getPreferencesByUserId>>) {
  if (!row) return null;
  const workAuths = (row as { workAuthorizations?: string[] }).workAuthorizations;
  return {
    id: row.id,
    user_id: row.userId,
    work_authorizations:
      Array.isArray(workAuths) && workAuths.length > 0 ? workAuths : [row.workAuthorization],
    target_locations: row.targetLocations as TargetLocationRow[],
    willing_to_relocate: row.willingToRelocate,
    has_car: row.hasCar,
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
    email_updates_enabled: row.emailUpdatesEnabled,
    email_min_match_score: row.emailMinMatchScore != null ? Number(row.emailMinMatchScore) : null,
    outreach_tone: row.outreachTone,
    cover_letter_tone: (row as { coverLetterTone?: string[] }).coverLetterTone ?? [],
    cover_letter_length: (row as { coverLetterLength?: string }).coverLetterLength ?? 'DEFAULT',
    cover_letter_word_choice:
      (row as { coverLetterWordChoice?: string[] }).coverLetterWordChoice ?? [],
    cover_letter_notes: (row as { coverLetterNotes?: string | null }).coverLetterNotes ?? null,
    cold_linkedin_tone: (row as { coldLinkedinTone?: string[] }).coldLinkedinTone ?? [],
    cold_linkedin_length: (row as { coldLinkedinLength?: string }).coldLinkedinLength ?? 'SHORT',
    cold_linkedin_notes: (row as { coldLinkedinNotes?: string | null }).coldLinkedinNotes ?? null,
    cold_email_tone: (row as { coldEmailTone?: string[] }).coldEmailTone ?? [],
    cold_email_length: (row as { coldEmailLength?: string }).coldEmailLength ?? 'SHORT',
    cold_email_notes: (row as { coldEmailNotes?: string | null }).coldEmailNotes ?? null,
    target_contact_roles: (row as { targetContactRoles?: string[] }).targetContactRoles ?? [
      'HIRING_MANAGER',
      'ENG_MANAGER',
      'TEAM_LEAD',
      'TECH_RECRUITER',
      'CAMPUS_RECRUITER',
      'FOUNDER',
    ],
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
    if (!data.work_authorizations?.length) {
      return NextResponse.json(
        { error: 'At least one work authorization is required.' },
        { status: 400 },
      );
    }
    const row = await upsertPreferences(db, userId, {
      workAuthorizations: data.work_authorizations,
      targetLocations: data.target_locations as TargetLocationRow[],
      willingToRelocate: data.willing_to_relocate,
      hasCar: data.has_car,
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
      emailUpdatesEnabled: data.email_updates_enabled,
      emailMinMatchScore: data.email_min_match_score ?? null,
      outreachTone: data.outreach_tone ?? undefined,
      coverLetterTone: data.cover_letter_tone,
      coverLetterLength: data.cover_letter_length,
      coverLetterWordChoice: data.cover_letter_word_choice,
      coverLetterNotes: data.cover_letter_notes ?? undefined,
      coldLinkedinTone: data.cold_linkedin_tone,
      coldLinkedinLength: data.cold_linkedin_length,
      coldLinkedinNotes: data.cold_linkedin_notes ?? undefined,
      coldEmailTone: data.cold_email_tone,
      coldEmailLength: data.cold_email_length,
      coldEmailNotes: data.cold_email_notes ?? undefined,
      targetContactRoles: data.target_contact_roles,
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
