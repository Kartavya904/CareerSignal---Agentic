/**
 * In-memory session activity store for Planner visibility.
 * V1: per-user ring buffer (last N events). Lost on restart.
 */

export interface ActivityEntry {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

const MAX_EVENTS_PER_USER = 50;
const store = new Map<string, ActivityEntry[]>();

function getOrCreate(userId: string): ActivityEntry[] {
  let list = store.get(userId);
  if (!list) {
    list = [];
    store.set(userId, list);
  }
  return list;
}

export function appendActivity(userId: string, entry: ActivityEntry): void {
  const list = getOrCreate(userId);
  list.push(entry);
  if (list.length > MAX_EVENTS_PER_USER) {
    list.splice(0, list.length - MAX_EVENTS_PER_USER);
  }
}

export function getRecentActivity(userId: string, limit = 20): ActivityEntry[] {
  const list = store.get(userId) ?? [];
  return list.slice(-limit);
}

export function isPauseRequested(userId: string, activeRunId: string | null): boolean {
  if (!activeRunId) return false;
  const recent = getRecentActivity(userId, 5);
  const lastNav = recent.filter((e) => e.type === 'route_change').pop();
  if (!lastNav || !lastNav.payload?.pathname) return false;
  const path = String(lastNav.payload.pathname);
  return path !== '/runs';
}
