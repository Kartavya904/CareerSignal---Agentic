import { eq, gt } from 'drizzle-orm';
import type { Db } from './client';
import { adminAgentLogs, adminBrainLogs, scrapeState } from './schema';

const SCRAPE_STATE_ROW_ID = 1;

export interface ScrapeStateRow {
  isRunning: boolean;
  startedAt: Date | null;
}

/** Get current scrape run state from DB (for status after page refresh). */
export async function getScrapeState(db: Db): Promise<ScrapeStateRow> {
  const rows = await db
    .select({
      isRunning: scrapeState.isRunning,
      startedAt: scrapeState.startedAt,
    })
    .from(scrapeState)
    .where(eq(scrapeState.id, SCRAPE_STATE_ROW_ID))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { isRunning: false, startedAt: null };
  }
  return {
    isRunning: row.isRunning,
    startedAt: row.startedAt ?? null,
  };
}

/** Set scrape running state in DB. Call when loop starts (true) or stops (false). */
export async function setScrapeRunning(db: Db, running: boolean): Promise<void> {
  const now = new Date();
  await db
    .insert(scrapeState)
    .values({
      id: SCRAPE_STATE_ROW_ID,
      isRunning: running,
      startedAt: running ? now : null,
    })
    .onConflictDoUpdate({
      target: scrapeState.id,
      set: {
        isRunning: running,
        startedAt: running ? now : null,
      },
    });
}

/** Delete all admin agent and brain logs. Call when starting a new scrape. */
export async function clearAdminLogs(db: Db): Promise<void> {
  await db.delete(adminAgentLogs);
  await db.delete(adminBrainLogs);
}

/** Insert one agent log row. */
export async function insertAdminAgentLog(
  db: Db,
  entry: { ts: number; agent: string; level: string; message: string; detail?: string | null },
): Promise<void> {
  await db.insert(adminAgentLogs).values({
    ts: new Date(entry.ts),
    agent: entry.agent,
    level: entry.level,
    message: entry.message,
    detail: entry.detail ?? null,
  });
}

/** Insert one brain log row. */
export async function insertAdminBrainLog(
  db: Db,
  entry: {
    ts: number;
    level: string;
    message: string;
    reasoning?: string | null;
    recommendation?: string | null;
    suggestedUrl?: string | null;
    cycleDelaySeconds?: number | null;
  },
): Promise<void> {
  await db.insert(adminBrainLogs).values({
    ts: new Date(entry.ts),
    level: entry.level,
    message: entry.message,
    reasoning: entry.reasoning ?? null,
    recommendation: entry.recommendation ?? null,
    suggestedUrl: entry.suggestedUrl ?? null,
    cycleDelaySeconds: entry.cycleDelaySeconds ?? null,
  });
}

/** Parse numeric id from client-facing id like "log-123" or "brain-456". */
function parseLogId(afterId: string, prefix: string): number | null {
  if (!afterId.startsWith(prefix)) return null;
  const n = parseInt(afterId.slice(prefix.length), 10);
  return Number.isNaN(n) ? null : n;
}

export interface AgentLogEntry {
  id: string;
  ts: number;
  agent: string;
  level: string;
  message: string;
  detail?: string;
}

/** Get agent logs from DB, optionally after a given id (for polling). */
export async function getAdminAgentLogs(db: Db, afterId?: string): Promise<AgentLogEntry[]> {
  const numId = afterId ? parseLogId(afterId, 'log-') : null;
  const rows =
    numId !== null
      ? await db
          .select()
          .from(adminAgentLogs)
          .where(gt(adminAgentLogs.id, numId))
          .orderBy(adminAgentLogs.id)
      : await db.select().from(adminAgentLogs).orderBy(adminAgentLogs.id);
  return rows.map((r) => ({
    id: `log-${r.id}`,
    ts: r.ts.getTime(),
    agent: r.agent,
    level: r.level,
    message: r.message,
    detail: r.detail ?? undefined,
  }));
}

export interface BrainLogEntry {
  id: string;
  ts: number;
  level: string;
  message: string;
  reasoning?: string;
  recommendation?: string;
  suggestedUrl?: string;
  cycleDelaySeconds?: number;
}

/** Get brain logs from DB, optionally after a given id (for polling). */
export async function getAdminBrainLogs(db: Db, afterId?: string): Promise<BrainLogEntry[]> {
  if (afterId) {
    const numId = parseLogId(afterId, 'brain-');
    if (numId !== null) {
      const rows = await db
        .select()
        .from(adminBrainLogs)
        .where(gt(adminBrainLogs.id, numId))
        .orderBy(adminBrainLogs.id);
      return rows.map((r) => ({
        id: `brain-${r.id}`,
        ts: r.ts.getTime(),
        level: r.level,
        message: r.message,
        reasoning: r.reasoning ?? undefined,
        recommendation: r.recommendation ?? undefined,
        suggestedUrl: r.suggestedUrl ?? undefined,
        cycleDelaySeconds: r.cycleDelaySeconds ?? undefined,
      }));
    }
  }
  const rows = await db.select().from(adminBrainLogs).orderBy(adminBrainLogs.id);
  return rows.map((r) => ({
    id: `brain-${r.id}`,
    ts: r.ts.getTime(),
    level: r.level,
    message: r.message,
    reasoning: r.reasoning ?? undefined,
    recommendation: r.recommendation ?? undefined,
    suggestedUrl: r.suggestedUrl ?? undefined,
    cycleDelaySeconds: r.cycleDelaySeconds ?? undefined,
  }));
}
