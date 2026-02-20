import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { profiles as profilesTable } from './schema';

export async function getProfileByUserId(db: Db, userId: string) {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  return profile ?? null;
}

export async function upsertProfile(
  db: Db,
  userId: string,
  data: {
    name: string;
    location: string;
    workAuthorization: string;
    email?: string | null;
    phone?: string | null;
    seniority?: string | null;
    targetRoles?: string[];
    skills?: string[];
    highlightedSkills?: string[];
    experience?: unknown[];
    education?: unknown[];
    projects?: unknown[];
    certifications?: string[];
    industries?: string[];
    languages?: string[];
    salaryRange?: { min: number; max: number; currency: string } | null;
    employmentType?: string[];
    remotePreference?: string | null;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
    portfolioUrl?: string | null;
    resumeRawText?: string | null;
    resumeFileRef?: string | null;
    resumeParsedAt?: Date | null;
  },
) {
  const [profile] = await db
    .insert(profilesTable)
    .values({
      userId,
      name: data.name,
      location: data.location,
      workAuthorization: data.workAuthorization as
        | 'US_CITIZEN'
        | 'GREEN_CARD'
        | 'H1B'
        | 'OPT'
        | 'EAD'
        | 'OTHER',
      email: data.email ?? null,
      phone: data.phone ?? null,
      seniority: data.seniority as
        | 'INTERN'
        | 'JUNIOR'
        | 'MID'
        | 'SENIOR'
        | 'STAFF'
        | 'PRINCIPAL'
        | 'DIRECTOR'
        | 'VP'
        | 'C_LEVEL'
        | undefined,
      targetRoles: data.targetRoles ?? [],
      skills: data.skills ?? [],
      highlightedSkills: data.highlightedSkills ?? [],
      experience: data.experience ?? [],
      education: data.education ?? [],
      projects: data.projects ?? [],
      certifications: data.certifications ?? [],
      industries: data.industries ?? [],
      languages: data.languages ?? [],
      salaryRange: data.salaryRange ?? null,
      employmentType: data.employmentType ?? [],
      remotePreference: data.remotePreference as 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY' | undefined,
      linkedinUrl: data.linkedinUrl ?? null,
      githubUrl: data.githubUrl ?? null,
      portfolioUrl: data.portfolioUrl ?? null,
      resumeRawText: data.resumeRawText ?? null,
      resumeFileRef: data.resumeFileRef ?? null,
      resumeParsedAt: data.resumeParsedAt ?? null,
    })
    .onConflictDoUpdate({
      target: profilesTable.userId,
      set: {
        name: data.name,
        location: data.location,
        workAuthorization: data.workAuthorization as
          | 'US_CITIZEN'
          | 'GREEN_CARD'
          | 'H1B'
          | 'OPT'
          | 'EAD'
          | 'OTHER',
        email: data.email ?? null,
        phone: data.phone ?? null,
        seniority: data.seniority as
          | 'INTERN'
          | 'JUNIOR'
          | 'MID'
          | 'SENIOR'
          | 'STAFF'
          | 'PRINCIPAL'
          | 'DIRECTOR'
          | 'VP'
          | 'C_LEVEL'
          | undefined,
        targetRoles: data.targetRoles ?? [],
        skills: data.skills ?? [],
        highlightedSkills: data.highlightedSkills ?? [],
        experience: data.experience ?? [],
        education: data.education ?? [],
        projects: data.projects ?? [],
        certifications: data.certifications ?? [],
        industries: data.industries ?? [],
        languages: data.languages ?? [],
        salaryRange: data.salaryRange ?? null,
        employmentType: data.employmentType ?? [],
        remotePreference: data.remotePreference as
          | 'REMOTE'
          | 'HYBRID'
          | 'ONSITE'
          | 'ANY'
          | undefined,
        linkedinUrl: data.linkedinUrl ?? null,
        githubUrl: data.githubUrl ?? null,
        portfolioUrl: data.portfolioUrl ?? null,
        resumeRawText: data.resumeRawText ?? null,
        resumeFileRef: data.resumeFileRef ?? null,
        resumeParsedAt: data.resumeParsedAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return profile;
}
