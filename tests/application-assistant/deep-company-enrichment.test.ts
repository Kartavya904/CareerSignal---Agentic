/**
 * Tests for Deep Company Research Agent and company enrichment DB helpers.
 * - normalizeCompanyName, needsCompanyRefresh (no DB required)
 * - Coverage / staleness behavior
 */
import { describe, it, expect } from 'vitest';
import { normalizeCompanyName, needsCompanyRefresh, type CompanyRow } from '@careersignal/db';

describe('normalizeCompanyName', () => {
  it('lowercases and strips non-alphanumerics', () => {
    expect(normalizeCompanyName('GE Aerospace')).toBe('geaerospace');
    expect(normalizeCompanyName('Foo Bar Inc.')).toBe('foobarinc');
  });

  it('handles empty and whitespace', () => {
    expect(normalizeCompanyName('')).toBe('');
    expect(normalizeCompanyName('  Acme  ')).toBe('acme');
  });

  it('produces stable normalized form for matching', () => {
    expect(normalizeCompanyName('Benchling')).toBe(normalizeCompanyName('BENCHLING'));
    expect(normalizeCompanyName('GE Aerospace')).toBe(normalizeCompanyName('G.E. Aerospace'));
  });
});

describe('needsCompanyRefresh', () => {
  const now = new Date();
  const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

  function row(overrides: Partial<CompanyRow> = {}): CompanyRow {
    return {
      id: 'test-id',
      type: 'COMPANY',
      name: 'Test Co',
      normalizedName: 'testco',
      url: 'https://testco.com',
      origin: null,
      kind: null,
      isPriorityTarget: false,
      enabledForScraping: false,
      parentCompanyId: null,
      atsType: 'UNKNOWN',
      scrapeStrategy: 'AUTO',
      connectorConfig: null,
      lastFingerprintedAt: null,
      lastScrapedAt: null,
      lastStatus: null,
      lastError: null,
      scrapeIntervalMinutes: null,
      schedulerEnabled: false,
      testBudget: null,
      descriptionText: null,
      enrichmentSources: null,
      enrichmentStatus: 'DONE',
      lastEnrichedAt: tenDaysAgo,
      industries: null,
      hqLocation: null,
      sizeRange: null,
      foundedYear: null,
      fundingStage: null,
      publicCompany: null,
      ticker: null,
      remotePolicy: null,
      sponsorshipSignals: null,
      hiringLocations: null,
      techStackHints: null,
      websiteDomain: null,
      jobCountTotal: 0,
      jobCountOpen: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as CompanyRow;
  }

  it('returns true when enrichment_status is ERROR', () => {
    expect(needsCompanyRefresh(row({ enrichmentStatus: 'ERROR' }))).toBe(true);
  });

  it('returns true when enrichment_status is PENDING or RUNNING', () => {
    expect(needsCompanyRefresh(row({ enrichmentStatus: 'PENDING' }))).toBe(true);
    expect(needsCompanyRefresh(row({ enrichmentStatus: 'RUNNING' }))).toBe(true);
  });

  it('returns true when last_enriched_at is older than 30 days', () => {
    expect(
      needsCompanyRefresh(row({ enrichmentStatus: 'DONE', lastEnrichedAt: thirtyOneDaysAgo })),
    ).toBe(true);
  });

  it('returns true when last_enriched_at is null', () => {
    expect(needsCompanyRefresh(row({ enrichmentStatus: 'DONE', lastEnrichedAt: null }))).toBe(true);
  });

  it('returns false when DONE and last_enriched_at within 30 days', () => {
    expect(needsCompanyRefresh(row({ enrichmentStatus: 'DONE', lastEnrichedAt: tenDaysAgo }))).toBe(
      false,
    );
    expect(needsCompanyRefresh(row({ enrichmentStatus: 'DONE', lastEnrichedAt: now }))).toBe(false);
  });
});
