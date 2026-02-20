/**
 * Detect PostgreSQL connection/auth errors and return a user-friendly message.
 * Code 28P01 = password authentication failed.
 */
export function isDatabaseConnectionError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: string; message?: string };
  return (
    err.code === '28P01' ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    (typeof err.message === 'string' &&
      (err.message.includes('password authentication failed') ||
        err.message.includes('connection refused') ||
        err.message.includes('connect ECONNREFUSED')))
  );
}

export const DATABASE_ERROR_MESSAGE =
  'Database connection failed. Check that PostgreSQL is running and DATABASE_URL in .env.local is correct (e.g. postgresql://USER:PASSWORD@localhost:5432/careersignal).';
