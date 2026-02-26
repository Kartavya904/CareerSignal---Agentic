/**
 * Connector interface and canonical job shape. Connectors return jobs + evidence path;
 * the caller (e.g. API route) persists to job_listings and job_observations.
 */

import type { AtsType } from '../fingerprint';

export type JobRemoteType = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
export type JobStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

/** Canonical job shape produced by connectors (before companyId is set). */
export interface CanonicalJob {
  title: string;
  location?: string | null;
  remoteType?: JobRemoteType | null;
  employmentType?: string | null;
  level?: string | null;
  jobUrl?: string | null;
  applyUrl?: string | null;
  externalId?: string | null;
  descriptionText?: string | null;
  descriptionHtml?: string | null;
  postedAt?: Date | null;
  status?: JobStatus | null;
  dedupeKey: string;
  rawExtract?: Record<string, unknown> | null;
}

export interface ConnectorResult {
  jobs: CanonicalJob[];
  evidencePath: string;
  errors: string[];
}

export type TestBudget = {
  max_pages?: number;
  max_jobs?: number;
  timeout_ms?: number;
};

/** Connector-specific config (e.g. { boardToken } for Greenhouse, { companySlug } for Lever). */
export type ConnectorConfig = Record<string, unknown>;

export interface Connector {
  readonly atsType: AtsType;
  fetch(config: ConnectorConfig, budget?: TestBudget | null): Promise<ConnectorResult>;
}
