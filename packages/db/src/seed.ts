import { getDb } from './client';
import { users } from './schema';

/** Ensures default user exists; returns user id. */
export async function ensureDefaultUser(): Promise<string> {
  const db = getDb();
  const [existing] = await db.select().from(users).limit(1);
  if (existing) return existing.id;
  const [user] = await db.insert(users).values({}).returning();
  if (!user) throw new Error('Failed to create default user');
  return user.id;
}
