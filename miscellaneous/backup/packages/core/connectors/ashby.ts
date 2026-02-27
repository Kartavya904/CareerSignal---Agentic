/**
 * Ashby Job Board API connector.
 * Uses https://api.ashbyhq.com/posting-api/job-board/{boardName}
 * to fetch public job postings and normalize them.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Connector,
  ConnectorResult,
  CanonicalJob,
  ConnectorConfig,
  TestBudget,
} from './types';
import type { AtsType } from '../fingerprint';
import { computeDedupeKey } from '../dedupe';

const ASHBY_ATS: AtsType = 'ASHBY';

interface AshbyJobRaw {
  id: string;
  title: string;
  location?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
}

interface AshbyResponse {
  apiVersion?: string;
  jobs?: AshbyJobRaw[];
}

function normalizeAshbyJob(raw: AshbyJobRaw): CanonicalJob {
  const applyUrl = raw.applyUrl ?? raw.jobUrl ?? null;
  const jobUrl = raw.jobUrl ?? raw.applyUrl ?? null;
  const externalId = raw.id ?? null;

  const dedupeKey = computeDedupeKey({
    applyUrl: applyUrl ?? undefined,
    jobUrl: jobUrl ?? undefined,
    externalId: externalId ?? undefined,
    sourcePrefix: 'ashby',
  });

  let postedAt: Date | null = null;
  if (raw.publishedAt) {
    const d = new Date(raw.publishedAt);
    if (!Number.isNaN(d.getTime())) postedAt = d;
  }

  const remoteType =
    raw.isRemote || raw.workplaceType === 'Remote'
      ? 'REMOTE'
      : raw.workplaceType === 'Hybrid'
        ? 'HYBRID'
        : raw.workplaceType === 'Onsite'
          ? 'ONSITE'
          : null;

  return {
    title: raw.title?.trim() || 'Untitled',
    location: raw.location?.trim() || null,
    jobUrl,
    applyUrl,
    externalId,
    descriptionText: raw.descriptionPlain?.trim() || raw.descriptionHtml?.trim() || null,
    descriptionHtml: raw.descriptionHtml?.trim() || null,
    postedAt,
    employmentType: raw.employmentType?.trim() || null,
    level: raw.team?.trim() || raw.department?.trim() || null,
    remoteType,
    status: 'OPEN',
    dedupeKey,
    rawExtract: raw as unknown as Record<string, unknown>,
  };
}

async function fetchAshbyBoard(
  boardName: string,
  _budget?: TestBudget | null,
): Promise<AshbyResponse> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Ashby API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AshbyResponse;
}

export const ashbyConnector: Connector = {
  atsType: ASHBY_ATS,

  async fetch(config: ConnectorConfig, budget?: TestBudget | null): Promise<ConnectorResult> {
    const boardName =
      (config as { companySlug?: string; boardName?: string }).boardName ??
      (config as { companySlug?: string }).companySlug;

    if (typeof boardName !== 'string' || !boardName.trim()) {
      return {
        jobs: [],
        evidencePath: '',
        errors: ['Missing boardName/companySlug in connector config'],
      };
    }
    const name = boardName.trim();
    const errors: string[] = [];
    let rawResponse: AshbyResponse;
    try {
      rawResponse = await fetchAshbyBoard(name, budget);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { jobs: [], evidencePath: '', errors: [msg] };
    }

    const rawJobs = rawResponse.jobs ?? [];
    const jobs: CanonicalJob[] = [];
    for (const j of rawJobs) {
      try {
        jobs.push(normalizeAshbyJob(j));
      } catch (e) {
        errors.push(
          `Normalize job ${(j as { id?: string }).id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    let evidencePath = '';
    const evidenceDir = (config as { evidenceDir?: string }).evidenceDir;
    if (typeof evidenceDir === 'string' && evidenceDir) {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dir = join(evidenceDir, name);
        await mkdir(dir, { recursive: true });
        const filePath = join(dir, `${timestamp}.json`);
        await writeFile(filePath, JSON.stringify(rawResponse, null, 2), 'utf-8');
        evidencePath = filePath;
      } catch (e) {
        errors.push(`Evidence write: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { jobs, evidencePath, errors };
  },
};

export function normalizeAshbyJobExport(raw: AshbyJobRaw): CanonicalJob {
  return normalizeAshbyJob(raw);
}
