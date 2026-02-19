import { ensureDefaultUser } from '@careersignal/db';

let cachedUserId: string | null = null;

/** Single-user V1: get or create the default user id. */
export async function getDefaultUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  cachedUserId = await ensureDefaultUser();
  return cachedUserId;
}
