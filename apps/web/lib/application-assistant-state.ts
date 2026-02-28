/**
 * In-memory state for the Application Assistant single-URL analysis flow.
 * Tracks running state, step progress, and page-scoped logs (separate from Admin).
 *
 * Stop button: we store an AbortController per analysisId so the stop route can
 * call abort() and the pipeline runner can react immediately (check signal at
 * step boundaries and pass to fetch).
 */

const abortControllersByAnalysisId = new Map<string, AbortController>();

export type AssistantStep =
  | 'idle'
  | 'scraping'
  | 'extracting'
  | 'matching'
  | 'writing'
  | 'done'
  | 'error';

export interface AssistantLogEntry {
  id: string;
  ts: number;
  agent: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  detail?: string;
}

const MAX_LOGS = 500;

let running = false;
let sessionId: string | null = null;
let currentStep: AssistantStep = 'idle';
let analysisId: string | null = null;
let waitingForLogin = false;
let waitingForCaptcha = false;
const logs: AssistantLogEntry[] = [];
let nextLogId = 1;

export function getAssistantStatus() {
  return {
    running,
    sessionId,
    currentStep,
    analysisId,
    waitingForLogin,
    waitingForCaptcha,
  };
}

export function setAssistantRunning(sid: string): void {
  running = true;
  sessionId = sid;
  currentStep = 'scraping';
  analysisId = null;
  waitingForLogin = false;
  waitingForCaptcha = false;
  logs.length = 0;
  nextLogId = 1;
}

export function clearAssistantRunning(): void {
  running = false;
  sessionId = null;
  waitingForLogin = false;
  waitingForCaptcha = false;
}

/** Register the AbortController for a run so stop can abort it. */
export function setAssistantAbortController(analysisId: string, controller: AbortController): void {
  abortControllersByAnalysisId.set(analysisId, controller);
}

/** Get the controller for a run (used by stop route). */
export function getAssistantAbortController(analysisId: string): AbortController | undefined {
  return abortControllersByAnalysisId.get(analysisId);
}

/** Remove controller after run ends or after stop. */
export function clearAssistantAbortController(analysisId: string): void {
  abortControllersByAnalysisId.delete(analysisId);
}

export function setAssistantStep(step: AssistantStep): void {
  currentStep = step;
}

export function setAssistantAnalysisId(id: string): void {
  analysisId = id;
}

export function setAssistantWaitingForLogin(v: boolean): void {
  waitingForLogin = v;
}

export function setAssistantWaitingForCaptcha(v: boolean): void {
  waitingForCaptcha = v;
}

export function assistantLog(
  agent: string,
  message: string,
  options?: { level?: AssistantLogEntry['level']; detail?: string },
): AssistantLogEntry {
  const entry: AssistantLogEntry = {
    id: `aa-log-${nextLogId++}`,
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

export function getAssistantLogs(afterId?: string): AssistantLogEntry[] {
  if (!afterId) return [...logs];
  const idx = logs.findIndex((l) => l.id === afterId);
  if (idx < 0) return [...logs];
  return logs.slice(idx + 1);
}

export function clearAssistantLogs(): void {
  logs.length = 0;
  nextLogId = 1;
}
