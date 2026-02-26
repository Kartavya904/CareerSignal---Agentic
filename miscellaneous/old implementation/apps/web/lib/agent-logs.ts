/**
 * In-memory agent log buffer for Admin terminal.
 * Stores recent logs with timestamps and agent names.
 * Also persists to DB (fire-and-forget) so logs survive page refresh.
 */

import { getDb, insertAdminAgentLog } from '@careersignal/db';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface AgentLogEntry {
  id: string;
  ts: number;
  agent: string;
  level: LogLevel;
  message: string;
  detail?: string;
}

const MAX_LOGS = 500;
const logs: AgentLogEntry[] = [];
let nextId = 1;

export function agentLog(
  agent: string,
  message: string,
  options?: { level?: LogLevel; detail?: string },
) {
  const entry: AgentLogEntry = {
    id: `log-${nextId++}`,
    ts: Date.now(),
    agent,
    level: options?.level ?? 'info',
    message,
    detail: options?.detail,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  void insertAdminAgentLog(getDb(), {
    ts: entry.ts,
    agent: entry.agent,
    level: entry.level,
    message: entry.message,
    detail: entry.detail ?? null,
  }).catch(() => {});
  return entry;
}

export function getAgentLogs(afterId?: string): AgentLogEntry[] {
  if (!afterId) return [...logs];
  const idx = logs.findIndex((l) => l.id === afterId);
  if (idx < 0) return [...logs];
  return logs.slice(idx + 1);
}

/** Get last N logs for Brain context (formatted snippet). */
export function getRecentLogsSnippet(maxEntries = 15): string {
  const recent = logs.slice(-maxEntries);
  return recent.map((l) => `[${l.agent}] ${l.message}`).join('\n');
}

export function clearAgentLogs(): void {
  logs.length = 0;
}
