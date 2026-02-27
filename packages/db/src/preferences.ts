import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { userPreferences as userPreferencesTable } from './schema';
import type { TargetLocationRow } from './schema';

export type { TargetLocationRow };

const STRICT_LEVELS = ['STRICT', 'SEMI_STRICT', 'OFF'] as const;
const MAX_CONTACTS_VALUES = [1, 2, 3, 5] as const;

export type StrictFilterLevel = (typeof STRICT_LEVELS)[number];
export type MaxContactsPerJob = (typeof MAX_CONTACTS_VALUES)[number];

export interface UserPreferencesRow {
  id: string;
  userId: string;
  workAuthorization: string;
  targetLocations: TargetLocationRow[];
  willingToRelocate: boolean;
  hasCar: boolean;
  remotePreference: string;
  targetSeniority: string[];
  targetRoles: string[];
  skills: string[];
  industries: string[];
  employmentTypes: string[];
  salaryMin: string | null;
  salaryMax: string | null;
  salaryCurrency: string | null;
  strictFilterLevel: StrictFilterLevel;
  maxContactsPerJob: number;
  outreachTone: string | null;
  syncedFromProfileAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertPreferencesInput {
  workAuthorization: string;
  targetLocations: TargetLocationRow[];
  willingToRelocate?: boolean;
  hasCar?: boolean;
  remotePreference?: string;
  targetSeniority?: string[];
  targetRoles?: string[];
  skills?: string[];
  industries?: string[];
  employmentTypes?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  strictFilterLevel?: StrictFilterLevel;
  maxContactsPerJob?: MaxContactsPerJob;
  outreachTone?: string | null;
  syncedFromProfileAt?: Date | null;
}

/** Validate: if city is set, state must be set (no country+city only). */
export function validateTargetLocations(locs: TargetLocationRow[]): {
  valid: boolean;
  error?: string;
} {
  for (const loc of locs) {
    if (loc.city && !loc.state) {
      return { valid: false, error: 'City requires state (no country+city without state).' };
    }
    if (!loc.country?.trim()) {
      return { valid: false, error: 'Each location must have a country.' };
    }
  }
  return { valid: true };
}

export async function getPreferencesByUserId(
  db: Db,
  userId: string,
): Promise<UserPreferencesRow | null> {
  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);
  return (row as UserPreferencesRow) ?? null;
}

export async function upsertPreferences(
  db: Db,
  userId: string,
  data: UpsertPreferencesInput,
): Promise<UserPreferencesRow> {
  const { valid, error } = validateTargetLocations(data.targetLocations);
  if (!valid) throw new Error(error);

  const maxContacts = data.maxContactsPerJob ?? 2;
  if (!MAX_CONTACTS_VALUES.includes(maxContacts as MaxContactsPerJob)) {
    throw new Error('maxContactsPerJob must be 1, 2, 3, or 5');
  }

  type WorkAuth = 'US_CITIZEN' | 'GREEN_CARD' | 'H1B' | 'OPT' | 'EAD' | 'OTHER';
  type RemotePref = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY';

  const [row] = await db
    .insert(userPreferencesTable)
    .values({
      userId,
      workAuthorization: data.workAuthorization as WorkAuth,
      targetLocations: data.targetLocations,
      willingToRelocate: data.willingToRelocate ?? false,
      hasCar: data.hasCar ?? false,
      remotePreference: (data.remotePreference as RemotePref) ?? 'ANY',
      targetSeniority: data.targetSeniority ?? [],
      targetRoles: data.targetRoles ?? [],
      skills: data.skills ?? [],
      industries: data.industries ?? [],
      employmentTypes: data.employmentTypes ?? [],
      salaryMin: data.salaryMin != null ? String(data.salaryMin) : null,
      salaryMax: data.salaryMax != null ? String(data.salaryMax) : null,
      salaryCurrency: data.salaryCurrency ?? null,
      strictFilterLevel: (data.strictFilterLevel ?? 'STRICT') as 'STRICT' | 'SEMI_STRICT' | 'OFF',
      maxContactsPerJob: maxContacts,
      outreachTone: data.outreachTone ?? 'PROFESSIONAL_CONCISE',
      syncedFromProfileAt: data.syncedFromProfileAt ?? null,
    })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: {
        workAuthorization: data.workAuthorization as WorkAuth,
        targetLocations: data.targetLocations,
        willingToRelocate: data.willingToRelocate ?? false,
        hasCar: data.hasCar ?? false,
        remotePreference: (data.remotePreference as RemotePref) ?? 'ANY',
        targetSeniority: data.targetSeniority ?? [],
        targetRoles: data.targetRoles ?? [],
        skills: data.skills ?? [],
        industries: data.industries ?? [],
        employmentTypes: data.employmentTypes ?? [],
        salaryMin: data.salaryMin != null ? String(data.salaryMin) : null,
        salaryMax: data.salaryMax != null ? String(data.salaryMax) : null,
        salaryCurrency: data.salaryCurrency ?? null,
        strictFilterLevel: (data.strictFilterLevel ?? 'STRICT') as 'STRICT' | 'SEMI_STRICT' | 'OFF',
        maxContactsPerJob: maxContacts,
        outreachTone: data.outreachTone ?? 'PROFESSIONAL_CONCISE',
        syncedFromProfileAt: data.syncedFromProfileAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row as UserPreferencesRow;
}
