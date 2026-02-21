export interface ProgressEntry {
  id: number;
  event: 'log' | 'step' | 'complete' | 'error';
  data: Record<string, unknown>;
  ts: number;
}

interface Job {
  entries: ProgressEntry[];
  done: boolean;
}

type JobStore = Map<string, Job>;

const GLOBAL_KEY = '__careersignal_parse_jobs__' as const;

function getStore(): JobStore {
  const g = globalThis as unknown as Record<string, JobStore | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map();
  }
  return g[GLOBAL_KEY]!;
}

export function createJob(userId: string): void {
  getStore().set(userId, { entries: [], done: false });
}

export function pushEntry(
  userId: string,
  event: ProgressEntry['event'],
  data: Record<string, unknown>,
): void {
  const job = getStore().get(userId);
  if (!job || job.done) return;
  job.entries.push({ id: job.entries.length, event, data, ts: Date.now() });
}

export function markDone(userId: string): void {
  const job = getStore().get(userId);
  if (job) job.done = true;
}

export function getProgress(
  userId: string,
  after = -1,
): { entries: ProgressEntry[]; done: boolean } | null {
  const job = getStore().get(userId);
  if (!job) return null;
  return {
    entries: job.entries.filter((e) => e.id > after),
    done: job.done,
  };
}

export function clearJob(userId: string): void {
  getStore().delete(userId);
}

export interface JobStatus {
  active: boolean;
  done: boolean;
  entryCount: number;
  step: { step: number; total: number; name: string } | null;
}

export function getStatus(userId: string): JobStatus | null {
  const job = getStore().get(userId);
  if (!job) return null;
  const lastStep = [...job.entries].reverse().find((e) => e.event === 'step');
  return {
    active: !job.done,
    done: job.done,
    entryCount: job.entries.length,
    step: lastStep ? (lastStep.data as JobStatus['step']) : null,
  };
}
