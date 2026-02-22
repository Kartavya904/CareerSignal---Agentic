/**
 * In-memory agent log buffer for Admin terminal.
 * Stores recent logs with timestamps and agent names.
 */

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
  return entry;
}

export function getAgentLogs(afterId?: string): AgentLogEntry[] {
  if (!afterId) return [...logs];
  const idx = logs.findIndex((l) => l.id === afterId);
  if (idx < 0) return [...logs];
  return logs.slice(idx + 1);
}

export function clearAgentLogs(): void {
  logs.length = 0;
}
