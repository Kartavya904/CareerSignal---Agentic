/**
 * Orchestrator context accumulated across workflow steps.
 * Each step reads from context and can write back via return value.
 */
import type { Db } from '@careersignal/db';

export interface RunContext {
  userId: string;
  runId: string;
  db: Db;
  sourceIds: string[];
  profile?: unknown;
  validatedSources?: { sourceId: string; url: string; isValid: boolean }[];
  rawListings?: unknown[];
  normalizedJobs?: unknown[];
  dedupedJobs?: unknown[];
  scoredJobs?: unknown[];
  topJobs?: unknown[];
  preferences?: unknown;
}

export type StepExecutor = (
  inputs: Record<string, unknown>,
  context: RunContext,
) => Promise<Record<string, unknown>>;
