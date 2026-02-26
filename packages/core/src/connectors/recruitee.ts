/**
 * Recruitee public offers API connector.
 * Uses https://{subdomain}.recruitee.com/api/offers/ (JSON) to fetch published jobs.
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

const RECRUITEE_ATS: AtsType = 'RECRUITEE';

interface RecruiteeOfferRaw {
  id: number;
  title: string;
  slug?: string;
  careers_url?: string;
  apply_url?: string;
  description?: string;
  requirements?: string;
  city?: string;
  country_code?: string;
  remote?: boolean;
  created_at?: string;
  updated_at?: string;
  status?: string;
}

interface RecruiteeResponse {
  offers?: RecruiteeOfferRaw[];
}

function normalizeRecruiteeJob(raw: RecruiteeOfferRaw, subdomain: string): CanonicalJob {
  const jobUrl = raw.careers_url ?? raw.apply_url ?? null;
  const applyUrl = raw.apply_url ?? raw.careers_url ?? null;
  const externalId = raw.id != null ? String(raw.id) : null;

  const dedupeKey = computeDedupeKey({
    applyUrl: applyUrl ?? undefined,
    jobUrl: jobUrl ?? undefined,
    externalId: externalId ?? undefined,
    sourcePrefix: 'recruitee',
  });

  let postedAt: Date | null = null;
  if (raw.created_at) {
    const d = new Date(raw.created_at);
    if (!Number.isNaN(d.getTime())) postedAt = d;
  }

  const locationPieces = [];
  if (raw.city) locationPieces.push(raw.city);
  if (raw.country_code) locationPieces.push(raw.country_code);
  const location = locationPieces.length ? locationPieces.join(', ') : null;

  const remoteType = raw.remote ? 'REMOTE' : null;

  return {
    title: raw.title?.trim() || 'Untitled',
    location,
    jobUrl,
    applyUrl,
    externalId,
    descriptionText: raw.description?.trim() || raw.requirements?.trim() || null,
    descriptionHtml: raw.description?.trim() || null,
    postedAt,
    remoteType,
    status: raw.status === 'closed' ? 'CLOSED' : 'OPEN',
    dedupeKey,
    rawExtract: { ...raw, subdomain } as unknown as Record<string, unknown>,
  };
}

async function fetchRecruiteeOffers(
  subdomain: string,
  _budget?: TestBudget | null,
): Promise<RecruiteeResponse> {
  const url = `https://${subdomain}.recruitee.com/api/offers/`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Recruitee API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as RecruiteeResponse;
}

export const recruiteeConnector: Connector = {
  atsType: RECRUITEE_ATS,

  async fetch(config: ConnectorConfig, budget?: TestBudget | null): Promise<ConnectorResult> {
    const subdomain = (config as { subdomain?: string }).subdomain;
    if (typeof subdomain !== 'string' || !subdomain.trim()) {
      return { jobs: [], evidencePath: '', errors: ['Missing subdomain in connector config'] };
    }
    const slug = subdomain.trim();
    const errors: string[] = [];
    let rawResponse: RecruiteeResponse;
    try {
      rawResponse = await fetchRecruiteeOffers(slug, budget);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { jobs: [], evidencePath: '', errors: [msg] };
    }

    const offers = rawResponse.offers ?? [];
    const jobs: CanonicalJob[] = [];
    for (const o of offers) {
      try {
        jobs.push(normalizeRecruiteeJob(o, slug));
      } catch (e) {
        errors.push(
          `Normalize job ${(o as { id?: number }).id}: ${e instanceof Error ? e.message : String(e)}`,
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
