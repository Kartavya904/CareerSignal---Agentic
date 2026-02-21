import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { userMetadata as userMetadataTable } from './schema';

export interface UserMetadataRow {
  id: string;
  userId: string;
  resumeUploadedAt: Date | null;
  resumeParsedAt: Date | null;
  insightsGeneratedAt: Date | null;
  profileUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getUserMetadataByUserId(
  db: Db,
  userId: string,
): Promise<UserMetadataRow | null> {
  const [row] = await db
    .select()
    .from(userMetadataTable)
    .where(eq(userMetadataTable.userId, userId))
    .limit(1);
  return (row as UserMetadataRow | undefined) ?? null;
}

/** Update only the given timestamp fields; creates row if missing. */
export async function updateUserMetadata(
  db: Db,
  userId: string,
  data: {
    resumeUploadedAt?: Date | null;
    resumeParsedAt?: Date | null;
    insightsGeneratedAt?: Date | null;
    profileUpdatedAt?: Date | null;
  },
): Promise<UserMetadataRow | null> {
  const existing = await getUserMetadataByUserId(db, userId);
  const now = new Date();
  const set: {
    resumeUploadedAt?: Date | null;
    resumeParsedAt?: Date | null;
    insightsGeneratedAt?: Date | null;
    profileUpdatedAt?: Date | null;
    updatedAt: Date;
  } = { updatedAt: now };
  if (data.resumeUploadedAt !== undefined) set.resumeUploadedAt = data.resumeUploadedAt;
  if (data.resumeParsedAt !== undefined) set.resumeParsedAt = data.resumeParsedAt;
  if (data.insightsGeneratedAt !== undefined) set.insightsGeneratedAt = data.insightsGeneratedAt;
  if (data.profileUpdatedAt !== undefined) set.profileUpdatedAt = data.profileUpdatedAt;

  const [row] = await db
    .update(userMetadataTable)
    .set(set)
    .where(eq(userMetadataTable.userId, userId))
    .returning();
  if (row) return row as UserMetadataRow;
  if (existing) return existing;
  const [inserted] = await db
    .insert(userMetadataTable)
    .values({
      userId,
      resumeUploadedAt: data.resumeUploadedAt ?? null,
      resumeParsedAt: data.resumeParsedAt ?? null,
      insightsGeneratedAt: data.insightsGeneratedAt ?? null,
      profileUpdatedAt: data.profileUpdatedAt ?? null,
      updatedAt: now,
    })
    .returning();
  return (inserted as UserMetadataRow) ?? null;
}
