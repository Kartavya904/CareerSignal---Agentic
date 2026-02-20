import { NextResponse } from 'next/server';
import { getDb, createUserWithAccount, getUserByEmail } from '@careersignal/db';
import { signupInputSchema } from '@careersignal/schemas';
import { hashPassword } from '@/lib/password';
import { buildSessionCookie } from '@/lib/auth';
import { isDatabaseConnectionError, DATABASE_ERROR_MESSAGE } from '@/lib/db-error';
import { getUserDataDir } from '@/lib/user-data';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = signupInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { email, password, name } = parsed.data;

    const db = getDb();
    const existing = await getUserByEmail(db, email);
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await createUserWithAccount(db, { email, passwordHash, name: name ?? null });

    // Create user's data directory
    await getUserDataDir(email);

    const cookie = buildSessionCookie(user.id);
    const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
    res.cookies.set(
      cookie.name,
      cookie.value,
      cookie.options as Parameters<NextResponse['cookies']['set']>[2],
    );
    return res;
  } catch (e) {
    console.error(e);
    if (isDatabaseConnectionError(e)) {
      return NextResponse.json({ error: DATABASE_ERROR_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sign up failed' },
      { status: 500 },
    );
  }
}
