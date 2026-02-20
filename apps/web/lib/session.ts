import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'careersignal_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SECRET must be set and at least 16 characters (e.g. in .env.local). Generate with: openssl rand -base64 24',
    );
  }
  return secret;
}

/** Create a signed session token for the given userId. */
export function createSessionToken(userId: string): string {
  const secret = getSecret();
  const payload = JSON.stringify({ userId, iat: Date.now() });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}

/** Verify token and return userId or null if invalid. */
export function verifySessionToken(token: string): string | null {
  try {
    const secret = getSecret();
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;
    const expected = createHmac('sha256', secret).update(payloadB64).digest('hex');
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
    ) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof payload?.userId !== 'string') return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE_SEC = MAX_AGE_SEC;
