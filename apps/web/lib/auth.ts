import { cookies } from 'next/headers';
import { getDb, getUserById } from '@careersignal/db';
import {
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
} from './session';

/** Get the current session user id from the cookie, or null if not signed in. */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Get the current session user (id, email, name) or null. */
export async function getSessionUser(): Promise<{
  id: string;
  email: string | null;
  name: string | null;
} | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = getDb();
  const user = await getUserById(db, userId);
  return user ?? null;
}

/** Get current user id or throw (for API routes that require auth). Caller should return 401 when this throws. */
export async function getRequiredUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    const e = new Error('Unauthorized') as Error & { status?: number };
    (e as { status?: number }).status = 401;
    throw e;
  }
  return userId;
}

/** Set session cookie (call after signup/signin). Returns the token so the route can set the cookie. */
export function buildSessionCookie(userId: string): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  return {
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(userId),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: SESSION_MAX_AGE_SEC,
      path: '/',
    },
  };
}
