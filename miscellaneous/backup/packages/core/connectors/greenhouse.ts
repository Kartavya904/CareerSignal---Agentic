/**
 * Greenhouse Job Board API connector. Fetches jobs from boards-api.greenhouse.io,
 * normalizes to canonical job shape, optionally writes evidence JSON.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Connector, ConnectorResult, CanonicalJob } from './types';
import type { AtsType } from '../fingerprint';
import { computeDedupeKey } from '../dedupe';
import type { ConnectorConfig, TestBudget } from './types';

const GREENHOUSE_ATS: AtsType = 'GREENHOUSE';

interface GreenhouseJobRaw {
  id: number;
  title: string;
  absolute_url?: string;
  location?: { name?: string };
  updated_at?: string;
  content?: string;
  departments?: Array<{ id?: number; name?: string }>;
  offices?: Array<{ name?: string; location?: string }>;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJobRaw[];
  meta?: { total?: number };
}

function normalizeGreenhouseJob(raw: GreenhouseJobRaw): CanonicalJob {
  const applyUrl = raw.absolute_url ?? null;
  const externalId = raw.id != null ? String(raw.id) : null;
  const dedupeKey = computeDedupeKey({
    applyUrl: applyUrl ?? undefined,
    jobUrl: applyUrl ?? undefined,
    externalId: externalId ?? undefined,
    sourcePrefix: 'gh',
  });
  const location =
    raw.location?.name?.trim() ||
    raw.offices?.[0]?.location?.trim() ||
    raw.offices?.[0]?.name?.trim() ||
    null;
  const level = raw.departments?.[0]?.name?.trim() ?? null;
  let postedAt: Date | null = null;
  if (raw.updated_at) {
    const d = new Date(raw.updated_at);
    if (!Number.isNaN(d.getTime())) postedAt = d;
  }
  return {
    title: raw.title?.trim() || 'Untitled',
    location: location ?? null,
    jobUrl: applyUrl ?? null,
    applyUrl: applyUrl ?? null,
    externalId,
    descriptionText: raw.content?.trim() || null,
    descriptionHtml: raw.content?.trim() || null,
    postedAt,
    level,
    status: 'OPEN',
    dedupeKey,
    rawExtract: raw as unknown as Record<string, unknown>,
  };
}

async function fetchGreenhouseBoard(
  boardToken: string,
  _budget?: TestBudget | null,
): Promise<GreenhouseResponse> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Greenhouse API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as GreenhouseResponse;
}

export const greenhouseConnector: Connector = {
  atsType: GREENHOUSE_ATS,

  async fetch(config: ConnectorConfig, budget?: TestBudget | null): Promise<ConnectorResult> {
    const boardToken = config?.boardToken;
    if (typeof boardToken !== 'string' || !boardToken.trim()) {
      return { jobs: [], evidencePath: '', errors: ['Missing boardToken in connector config'] };
    }
    const token = boardToken.trim();
    const errors: string[] = [];
    let rawResponse: GreenhouseResponse;
    try {
      rawResponse = await fetchGreenhouseBoard(token, budget);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { jobs: [], evidencePath: '', errors: [msg] };
    }
    const jobsRaw = rawResponse?.jobs ?? [];
    const jobs: CanonicalJob[] = [];
    for (const j of jobsRaw) {
      try {
        jobs.push(normalizeGreenhouseJob(j));
      } catch (e) {
        errors.push(
          `Normalize job ${(j as { id?: number }).id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    let evidencePath = '';
    // Evidence writing is optional; caller can pass evidenceDir via config or we skip
    const evidenceDir = (config as { evidenceDir?: string }).evidenceDir;
    if (typeof evidenceDir === 'string' && evidenceDir) {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dir = join(evidenceDir, token);
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

/** Normalize a single raw Greenhouse job (exported for tests). */
export function normalizeGreenhouseJobExport(raw: GreenhouseJobRaw): CanonicalJob {
  return normalizeGreenhouseJob(raw);
}

/** Fetch raw response (for tests/fixtures). */
export async function fetchGreenhouseBoardExport(
  boardToken: string,
  budget?: TestBudget | null,
): Promise<GreenhouseResponse> {
  return fetchGreenhouseBoard(boardToken, budget);
}
