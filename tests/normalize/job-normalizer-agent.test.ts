import { describe, it, expect } from 'vitest';
import { normalizeJobForCache, type JobCacheRow } from '@careersignal/agents';
import type { RawJobListing } from '@careersignal/agents';

describe('job-normalizer-agent', () => {
  const makeRawListing = (overrides?: Partial<RawJobListing>): RawJobListing => ({
    title: 'Senior Software Engineer',
    company: 'Acme Corp',
    location: 'San Francisco, CA',
    url: 'https://wellfound.com/jobs/123-swe',
    salary: '$120k – $180k',
    postedDate: '2 days ago',
    extractedFrom: 'https://wellfound.com/jobs',
    confidence: 0.85,
    ...overrides,
  });

  describe('normalizeJobForCache', () => {
    it('produces a valid JobCacheRow shape', () => {
      const row = normalizeJobForCache(makeRawListing(), 'source-1');
      expect(row).toHaveProperty('blessedSourceId', 'source-1');
      expect(row).toHaveProperty('title');
      expect(row).toHaveProperty('companyName');
      expect(row).toHaveProperty('sourceUrl');
      expect(row).toHaveProperty('dedupeKey');
    });

    it('canonicalizes job title', () => {
      const row = normalizeJobForCache(makeRawListing({ title: 'senior swe' }), 'source-1');
      expect(row.title).toContain('Software Engineer');
    });

    it('trims company name', () => {
      const row = normalizeJobForCache(makeRawListing({ company: '  Acme Corp  ' }), 'source-1');
      expect(row.companyName).toBe('Acme Corp');
    });

    it('defaults company to "Unknown Company" when missing', () => {
      const row = normalizeJobForCache(makeRawListing({ company: undefined }), 'source-1');
      expect(row.companyName).toBe('Unknown Company');
    });

    it('uses url as sourceUrl', () => {
      const row = normalizeJobForCache(makeRawListing(), 'source-1');
      expect(row.sourceUrl).toBe('https://wellfound.com/jobs/123-swe');
    });

    it('falls back to extractedFrom when url is missing', () => {
      const row = normalizeJobForCache(makeRawListing({ url: undefined }), 'source-1');
      expect(row.sourceUrl).toBe('https://wellfound.com/jobs');
    });

    it('generates a non-empty dedupeKey', () => {
      const row = normalizeJobForCache(makeRawListing(), 'source-1');
      expect(row.dedupeKey).toBeTruthy();
      expect(row.dedupeKey.length).toBeGreaterThan(0);
    });

    it('generates same dedupeKey for same title+company', () => {
      const row1 = normalizeJobForCache(makeRawListing(), 'source-1');
      const row2 = normalizeJobForCache(makeRawListing(), 'source-1');
      expect(row1.dedupeKey).toBe(row2.dedupeKey);
    });

    it('generates different dedupeKey for different title', () => {
      const row1 = normalizeJobForCache(makeRawListing(), 'source-1');
      const row2 = normalizeJobForCache(makeRawListing({ title: 'Frontend Engineer' }), 'source-1');
      expect(row1.dedupeKey).not.toBe(row2.dedupeKey);
    });

    it('canonicalizes location', () => {
      const row = normalizeJobForCache(
        makeRawListing({ location: 'San Francisco, CA' }),
        'source-1',
      );
      expect(row.location).toBeDefined();
      expect(row.location!.length).toBeGreaterThan(0);
    });

    it('sets location to null when not provided', () => {
      const row = normalizeJobForCache(makeRawListing({ location: undefined }), 'source-1');
      expect(row.location).toBeNull();
    });

    it('parses salary range', () => {
      const row = normalizeJobForCache(
        makeRawListing({ salary: '$120,000 – $180,000' }),
        'source-1',
      );
      expect(row.salaryMin).toBeDefined();
      expect(row.salaryMax).toBeDefined();
      if (row.salaryMin && row.salaryMax) {
        expect(Number(row.salaryMin)).toBeLessThanOrEqual(Number(row.salaryMax));
      }
    });

    it('handles missing salary gracefully', () => {
      const row = normalizeJobForCache(makeRawListing({ salary: undefined }), 'source-1');
      expect(row.salaryMin).toBeNull();
      expect(row.salaryMax).toBeNull();
    });

    it('sets postedDate from raw listing', () => {
      const row = normalizeJobForCache(makeRawListing(), 'source-1');
      expect(row.postedDate).toBe('2 days ago');
    });

    it('sets confidence from raw listing', () => {
      const row = normalizeJobForCache(makeRawListing(), 'source-1');
      expect(row.confidence).toBe(0.85);
    });

    it('sets applyUrl from raw url', () => {
      const row = normalizeJobForCache(makeRawListing(), 'source-1');
      expect(row.applyUrl).toBe('https://wellfound.com/jobs/123-swe');
    });

    it('stores rawExtract', () => {
      const row = normalizeJobForCache(makeRawListing(), 'source-1');
      expect(row.rawExtract).toBeDefined();
      expect(row.rawExtract).toHaveProperty('title');
    });

    it('truncates long title to 512 chars', () => {
      const longTitle = 'A'.repeat(600);
      const row = normalizeJobForCache(makeRawListing({ title: longTitle }), 'source-1');
      expect(row.title.length).toBeLessThanOrEqual(512);
    });

    it('truncates long company name to 255 chars', () => {
      const longCompany = 'B'.repeat(300);
      const row = normalizeJobForCache(makeRawListing({ company: longCompany }), 'source-1');
      expect(row.companyName.length).toBeLessThanOrEqual(255);
    });
  });
});
