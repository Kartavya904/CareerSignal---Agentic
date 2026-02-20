import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { users } from './schema';
import { seedBlessedSources } from './seed';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name?: string | null;
}

/** If exactly one user exists with no email (legacy), return that user id so we can attach the new account. */
async function getLegacyUserIdIfSingle(db: Db): Promise<string | null> {
  const all = await db.select({ id: users.id, email: users.email }).from(users);
  if (all.length !== 1) return null;
  const u = all[0];
  if (!u) return null;
  return u.email == null ? u.id : null;
}

/** Create a new user (sign up) and seed blessed sources. If a single legacy user exists (no email), attach account to it. */
export async function createUserWithAccount(
  db: Db,
  input: CreateUserInput,
): Promise<{ id: string; email: string; name: string | null }> {
  const legacyId = await getLegacyUserIdIfSingle(db);
  if (legacyId) {
    const [updated] = await db
      .update(users)
      .set({
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, legacyId))
      .returning({ id: users.id, email: users.email, name: users.name });
    if (!updated) throw new Error('Failed to update legacy user');
    await seedBlessedSources(updated.id);
    return {
      id: updated.id,
      email: updated.email ?? input.email,
      name: updated.name ?? null,
    };
  }
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name ?? null,
    })
    .returning({ id: users.id, email: users.email, name: users.name });
  if (!user) throw new Error('Failed to create user');
  await seedBlessedSources(user.id);
  return {
    id: user.id,
    email: user.email ?? input.email,
    name: user.name ?? null,
  };
}

/** Get user by email (for sign in). */
export async function getUserByEmail(
  db: Db,
  email: string,
): Promise<
  { id: string; email: string | null; passwordHash: string | null; name: string | null } | undefined
> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      name: users.name,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row;
}

/** Get user by id (for session). */
export async function getUserById(
  db: Db,
  id: string,
): Promise<{ id: string; email: string | null; name: string | null } | undefined> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row;
}

/** Check if any user exists (e.g. to show signup vs signin). */
export async function hasAnyUser(db: Db): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return !!row;
}
