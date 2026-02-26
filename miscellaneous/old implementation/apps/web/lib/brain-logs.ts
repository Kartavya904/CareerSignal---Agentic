/**
 * Brain agent log buffer for Admin Brain Terminal.
 * Stores high-level reasoning, decisions, and recommendations.
 * Also persists to DB (fire-and-forget) so logs survive page refresh.
 */

import { getDb, insertAdminBrainLog } from '@careersignal/db';

export type BrainLogLevel = 'ok' | 'warn' | 'error' | 'insight';

export interface BrainLogEntry {
  id: string;
  ts: number;
  level: BrainLogLevel;
  message: string;
  reasoning?: string;
  recommendation?: string;
  suggestedUrl?: string;
  cycleDelaySeconds?: number;
}

const MAX_LOGS = 200;
const logs: BrainLogEntry[] = [];
let nextId = 1;

export function brainLog(
  message: string,
  options?: {
    level?: BrainLogLevel;
    reasoning?: string;
    recommendation?: string;
    suggestedUrl?: string;
    cycleDelaySeconds?: number;
  },
) {
  const entry: BrainLogEntry = {
    id: `brain-${nextId++}`,
    ts: Date.now(),
    level: options?.level ?? 'ok',
    message,
    reasoning: options?.reasoning,
    recommendation: options?.recommendation,
    suggestedUrl: options?.suggestedUrl,
    cycleDelaySeconds: options?.cycleDelaySeconds,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  void insertAdminBrainLog(getDb(), {
    ts: entry.ts,
    level: entry.level,
    message: entry.message,
    reasoning: entry.reasoning ?? null,
    recommendation: entry.recommendation ?? null,
    suggestedUrl: entry.suggestedUrl ?? null,
    cycleDelaySeconds: entry.cycleDelaySeconds ?? null,
  }).catch(() => {});
  return entry;
}

export function getBrainLogs(afterId?: string): BrainLogEntry[] {
  if (!afterId) return [...logs];
  const idx = logs.findIndex((l) => l.id === afterId);
  if (idx < 0) return [...logs];
  return logs.slice(idx + 1);
}

export function clearBrainLogs(): void {
  logs.length = 0;
}
