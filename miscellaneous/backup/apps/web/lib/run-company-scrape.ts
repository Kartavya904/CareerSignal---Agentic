/**
 * Run a scrape for one company using the appropriate connector (e.g. Greenhouse)
 * or the budgeted crawler for RESOURCE/SOURCE rows (H1B boards, etc.).
 * Persists jobs to job_listings, job_observations, updates company counts and last_scraped_at.
 */

import path from 'node:path';
import { getDb } from '@careersignal/db';
import { getCompanyById, updateCompany, refreshCompanyJobCounts } from '@careersignal/db';
import { upsertJobListingByDedupeKey, type InsertJobListingInput } from '@careersignal/db';
import { upsertJobObservation } from '@careersignal/db';
import { getConnector } from '@careersignal/core';
import type { CanonicalJob } from '@careersignal/core';
import { runBudgetedCrawl } from '@/lib/budgeted-crawler';

export interface RunScrapeResult {
  ok: boolean;
  jobsFetched: number;
  jobsUpserted: number;
  observationsCreated: number;
  evidencePath: string;
  errors: string[];
}

export async function runCompanyScrape(companyId: string): Promise<RunScrapeResult> {
  const db = getDb();
  const errors: string[] = [];
  const result: RunScrapeResult = {
    ok: false,
    jobsFetched: 0,
    jobsUpserted: 0,
    observationsCreated: 0,
    evidencePath: '',
    errors: [],
  };

  const company = await getCompanyById(db, companyId);
  if (!company) {
    result.errors.push('Company not found');
    return result;
  }

  const entityType = company.type;
  const isCrawlSource = entityType === 'RESOURCE' || entityType === 'SOURCE';

  if (isCrawlSource) {
    const url = company.url?.trim();
    if (!url) {
      result.errors.push('RESOURCE/SOURCE company has no URL');
      await updateCompany(db, companyId, {
        lastScrapedAt: new Date(),
        lastStatus: 'ERROR',
        lastError: 'No URL configured',
      });
      return result;
    }
    const evidenceDir = path.join(process.cwd(), 'data', 'evidence', 'crawl');
    let crawlResult: Awaited<ReturnType<typeof runBudgetedCrawl>>;
    try {
      crawlResult = await runBudgetedCrawl(
        {
          sourceUrl: url,
          sourceId: companyId,
          sourceName: company.name ?? 'Unknown',
          evidenceDir,
          slug: company.normalizedName ?? companyId,
        },
        company.testBudget ?? undefined,
      );
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
      await updateCompany(db, companyId, {
        lastScrapedAt: new Date(),
        lastStatus: 'ERROR',
        lastError: result.errors[0] ?? 'Crawl failed',
      });
      return result;
    }
    result.jobsFetched = crawlResult.jobs.length;
    result.evidencePath = crawlResult.evidencePath ?? '';
    result.errors = crawlResult.errors ?? [];
    const evidencePaths = result.evidencePath ? [result.evidencePath] : undefined;
    for (const job of crawlResult.jobs as CanonicalJob[]) {
      const input: InsertJobListingInput = {
        companyId,
        title: job.title,
        location: job.location ?? null,
        remoteType: job.remoteType ?? null,
        employmentType: job.employmentType ?? null,
        level: job.level ?? null,
        jobUrl: job.jobUrl ?? null,
        applyUrl: job.applyUrl ?? null,
        externalId: job.externalId ?? null,
        descriptionText: job.descriptionText ?? null,
        descriptionHtml: job.descriptionHtml ?? null,
        postedAt: job.postedAt ?? null,
        status: job.status ?? 'OPEN',
        dedupeKey: job.dedupeKey,
        rawExtract: job.rawExtract ?? null,
        evidencePaths: evidencePaths ?? null,
      };
      try {
        const { id: jobId, created } = await upsertJobListingByDedupeKey(db, input);
        result.jobsUpserted += 1;
        const obs = await upsertJobObservation(db, {
          jobId,
          sourceId: companyId,
          observedUrl: job.applyUrl ?? job.jobUrl ?? null,
        });
        if (obs) result.observationsCreated += 1;
      } catch (e) {
        errors.push(`Job ${job.dedupeKey}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    result.errors = [...result.errors, ...errors];
    await refreshCompanyJobCounts(db, companyId);
    await updateCompany(db, companyId, {
      lastScrapedAt: new Date(),
      lastStatus: result.errors.length > 0 ? 'ERROR' : 'OK',
      lastError: result.errors.length > 0 ? result.errors.join('; ') : null,
    });
    result.ok = result.errors.length === 0;
    return result;
  }

  const atsType = company.atsType ?? 'UNKNOWN';
  const connector = getConnector(
    atsType as
      | 'GREENHOUSE'
      | 'LEVER'
      | 'ASHBY'
      | 'SMARTRECRUITERS'
      | 'RECRUITEE'
      | 'PERSONIO'
      | 'WORKDAY'
      | 'UNKNOWN',
  );
  if (!connector) {
    result.errors.push(`No connector for ATS type: ${atsType}`);
    return result;
  }

  const config = { ...((company.connectorConfig as Record<string, unknown>) ?? {}) };
  if (atsType === 'GREENHOUSE') {
    const evidenceDir = path.join(process.cwd(), 'data', 'evidence', 'greenhouse');
    (config as { evidenceDir?: string }).evidenceDir = evidenceDir;
  } else if (atsType === 'LEVER') {
    const evidenceDir = path.join(process.cwd(), 'data', 'evidence', 'lever');
    (config as { evidenceDir?: string }).evidenceDir = evidenceDir;
  } else if (atsType === 'ASHBY') {
    const evidenceDir = path.join(process.cwd(), 'data', 'evidence', 'ashby');
    (config as { evidenceDir?: string }).evidenceDir = evidenceDir;
  } else if (atsType === 'RECRUITEE') {
    const evidenceDir = path.join(process.cwd(), 'data', 'evidence', 'recruitee');
    (config as { evidenceDir?: string }).evidenceDir = evidenceDir;
  } else if (atsType === 'SMARTRECRUITERS') {
    const evidenceDir = path.join(process.cwd(), 'data', 'evidence', 'smartrecruiters');
    (config as { evidenceDir?: string }).evidenceDir = evidenceDir;
  } else if (atsType === 'PERSONIO') {
    const evidenceDir = path.join(process.cwd(), 'data', 'evidence', 'personio');
    (config as { evidenceDir?: string }).evidenceDir = evidenceDir;
  } else if (atsType === 'WORKDAY') {
    const evidenceDir = path.join(process.cwd(), 'data', 'evidence', 'workday');
    (config as { evidenceDir?: string }).evidenceDir = evidenceDir;
  }
  const budget = company.testBudget ?? undefined;

  let connectorResult: Awaited<ReturnType<typeof connector.fetch>>;
  try {
    connectorResult = await connector.fetch(config, budget);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    await updateCompany(db, companyId, {
      lastScrapedAt: new Date(),
      lastStatus: 'ERROR',
      lastError: result.errors[0] ?? 'Scrape failed',
    });
    return result;
  }

  result.jobsFetched = connectorResult.jobs.length;
  result.evidencePath = connectorResult.evidencePath ?? '';
  result.errors = connectorResult.errors ?? [];

  const evidencePaths = result.evidencePath ? [result.evidencePath] : undefined;

  for (const job of connectorResult.jobs as CanonicalJob[]) {
    const input: InsertJobListingInput = {
      companyId,
      title: job.title,
      location: job.location ?? null,
      remoteType: job.remoteType ?? null,
      employmentType: job.employmentType ?? null,
      level: job.level ?? null,
      jobUrl: job.jobUrl ?? null,
      applyUrl: job.applyUrl ?? null,
      externalId: job.externalId ?? null,
      descriptionText: job.descriptionText ?? null,
      descriptionHtml: job.descriptionHtml ?? null,
      postedAt: job.postedAt ?? null,
      status: job.status ?? 'OPEN',
      dedupeKey: job.dedupeKey,
      rawExtract: job.rawExtract ?? null,
      evidencePaths: evidencePaths ?? null,
    };
    try {
      const { id: jobId, created } = await upsertJobListingByDedupeKey(db, input);
      result.jobsUpserted += 1;
      const obs = await upsertJobObservation(db, {
        jobId,
        sourceId: companyId,
        observedUrl: job.applyUrl ?? job.jobUrl ?? null,
      });
      if (obs) result.observationsCreated += 1;
    } catch (e) {
      errors.push(`Job ${job.dedupeKey}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  result.errors = [...result.errors, ...errors];

  await refreshCompanyJobCounts(db, companyId);
  await updateCompany(db, companyId, {
    lastScrapedAt: new Date(),
    lastStatus: result.errors.length > 0 ? 'ERROR' : 'OK',
    lastError: result.errors.length > 0 ? result.errors.join('; ') : null,
  });

  result.ok = result.errors.length === 0;
  return result;
}
