/**
 * Lever public postings API connector.
 * Fetches jobs from api.lever.co/v0/postings/{account}?mode=json and normalizes them.
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

const LEVER_ATS: AtsType = 'LEVER';

interface LeverCategories {
  location?: string;
  team?: string;
  commitment?: string;
  department?: string;
  level?: string;
}

interface LeverJobRaw {
  id: string;
  text: string;
  createdAt?: number;
  updatedAt?: number;
  hostedUrl?: string;
  applyUrl?: string;
  categories?: LeverCategories;
  descriptionPlain?: string;
  description?: string;
}

type LeverResponse = LeverJobRaw[];

function normalizeLeverJob(raw: LeverJobRaw): CanonicalJob {
  const applyUrl = raw.applyUrl ?? raw.hostedUrl ?? null;
  const jobUrl = raw.hostedUrl ?? raw.applyUrl ?? null;
  const externalId = raw.id ?? null;

  const dedupeKey = computeDedupeKey({
    applyUrl: applyUrl ?? undefined,
    jobUrl: jobUrl ?? undefined,
    externalId: externalId ?? undefined,
    sourcePrefix: 'lever',
  });

  const categories = raw.categories ?? {};
  const location = categories.location?.trim() || null;
  const employmentType = categories.commitment?.trim() || null;
  const level = categories.team?.trim() || categories.level?.trim() || null;

  let postedAt: Date | null = null;
  if (raw.createdAt) {
    const d = new Date(raw.createdAt);
    if (!Number.isNaN(d.getTime())) postedAt = d;
  }

  return {
    title: raw.text?.trim() || 'Untitled',
    location,
    jobUrl,
    applyUrl,
    externalId,
    descriptionText: raw.descriptionPlain?.trim() || raw.description?.trim() || null,
    descriptionHtml: raw.description?.trim() || null,
    postedAt,
    employmentType,
    level,
    status: 'OPEN',
    dedupeKey,
    rawExtract: raw as unknown as Record<string, unknown>,
  };
}

async function fetchLeverPostings(
  account: string,
  _budget?: TestBudget | null,
): Promise<LeverResponse> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(account)}?mode=json`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Lever API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as LeverResponse;
}

export const leverConnector: Connector = {
  atsType: LEVER_ATS,

  async fetch(config: ConnectorConfig, budget?: TestBudget | null): Promise<ConnectorResult> {
    const account =
      (config as { companySlug?: string; account?: string }).companySlug ??
      (config as { account?: string }).account;
    if (typeof account !== 'string' || !account.trim()) {
      return {
        jobs: [],
        evidencePath: '',
        errors: ['Missing companySlug/account in connector config'],
      };
    }
    const slug = account.trim();
    const errors: string[] = [];
    let rawResponse: LeverResponse;
    try {
      rawResponse = await fetchLeverPostings(slug, budget);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { jobs: [], evidencePath: '', errors: [msg] };
    }

    const jobs: CanonicalJob[] = [];
    for (const j of rawResponse) {
      try {
        jobs.push(normalizeLeverJob(j));
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
        const dir = join(evidenceDir, slug);
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

export function normalizeLeverJobExport(raw: LeverJobRaw): CanonicalJob {
  return normalizeLeverJob(raw);
}
