import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { userProfileInsights as userProfileInsightsTable } from './schema';

export interface ProfileInsightsRow {
  id: string;
  userId: string;
  totalYearsExperience: number;
  seniority: string;
  keywordDepth: number;
  strengthScore: number;
  overallScore: number;
  resumeRating: string | null;
  computedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getProfileInsightsByUserId(
  db: Db,
  userId: string,
): Promise<ProfileInsightsRow | null> {
  const [row] = await db
    .select()
    .from(userProfileInsightsTable)
    .where(eq(userProfileInsightsTable.userId, userId))
    .limit(1);
  return (row as ProfileInsightsRow | undefined) ?? null;
}

export async function upsertProfileInsights(
  db: Db,
  userId: string,
  data: {
    totalYearsExperience: number;
    seniority: string;
    keywordDepth: number;
    strengthScore: number;
    overallScore: number;
    resumeRating: string | null;
  },
): Promise<ProfileInsightsRow> {
  const now = new Date();
  const [row] = await db
    .insert(userProfileInsightsTable)
    .values({
      userId,
      totalYearsExperience: data.totalYearsExperience,
      seniority: data.seniority,
      keywordDepth: data.keywordDepth,
      strengthScore: data.strengthScore,
      overallScore: data.overallScore,
      resumeRating: data.resumeRating,
      computedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userProfileInsightsTable.userId,
      set: {
        totalYearsExperience: data.totalYearsExperience,
        seniority: data.seniority,
        keywordDepth: data.keywordDepth,
        strengthScore: data.strengthScore,
        overallScore: data.overallScore,
        resumeRating: data.resumeRating,
        computedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return row as ProfileInsightsRow;
}
