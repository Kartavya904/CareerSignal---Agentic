import { NextResponse } from 'next/server';
import { getDb, getUserByEmail } from '@careersignal/db';
import { signinInputSchema } from '@careersignal/schemas';
import { verifyPassword } from '@/lib/password';
import { buildSessionCookie } from '@/lib/auth';
import { isDatabaseConnectionError, DATABASE_ERROR_MESSAGE } from '@/lib/db-error';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = signinInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;

    const db = getDb();
    const user = await getUserByEmail(db, email);
    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const cookie = buildSessionCookie(user.id);
    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
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
      { error: e instanceof Error ? e.message : 'Sign in failed' },
      { status: 500 },
    );
  }
}
