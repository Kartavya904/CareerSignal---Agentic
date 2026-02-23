import { describe, it, expect } from 'vitest';
import {
  filterLinks,
  extractLinksFromHtml,
  normalizeUrl,
  isExternalApplyUrl,
} from '@careersignal/agents';

describe('link-filter-agent', () => {
  describe('normalizeUrl', () => {
    it('strips fragment', () => {
      expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
    });

    it('sorts query params', () => {
      expect(normalizeUrl('https://example.com?b=2&a=1')).toBe('https://example.com/?a=1&b=2');
    });

    it('removes trailing slash', () => {
      expect(normalizeUrl('https://example.com/jobs/')).toBe('https://example.com/jobs');
    });

    it('keeps root slash', () => {
      const result = normalizeUrl('https://example.com/');
      expect(result).toBe('https://example.com/');
    });

    it('returns input for invalid URLs', () => {
      expect(normalizeUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('isExternalApplyUrl', () => {
    it('detects Greenhouse URLs', () => {
      expect(isExternalApplyUrl('https://boards.greenhouse.io/company/jobs/123')).toBe(true);
    });

    it('detects Lever URLs', () => {
      expect(isExternalApplyUrl('https://jobs.lever.co/company/123')).toBe(true);
    });

    it('detects Workday URLs', () => {
      expect(isExternalApplyUrl('https://company.myworkdayjobs.com/en-US/123')).toBe(true);
    });

    it('returns false for non-ATS URLs', () => {
      expect(isExternalApplyUrl('https://wellfound.com/jobs')).toBe(false);
    });
  });

  describe('filterLinks', () => {
    const baseOptions = () => ({
      sourceDomain: 'wellfound.com',
      urlSeen: new Set<string>(),
      frontier: [] as Array<{ url: string }>,
      currentDepth: 0,
      maxDepth: 6,
    });

    it('allows same-domain job links', () => {
      const result = filterLinks(
        ['https://wellfound.com/jobs/123-engineer', 'https://wellfound.com/company/acme/jobs'],
        baseOptions(),
      );
      expect(result).toHaveLength(2);
      expect(result[0].depth).toBe(1);
    });

    it('rejects external domain links', () => {
      const result = filterLinks(
        ['https://google.com/search', 'https://linkedin.com/jobs'],
        baseOptions(),
      );
      expect(result).toHaveLength(0);
    });

    it('rejects external ATS links', () => {
      const result = filterLinks(['https://boards.greenhouse.io/acme/jobs/123'], baseOptions());
      expect(result).toHaveLength(0);
    });

    it('rejects blocklisted exact paths', () => {
      const result = filterLinks(
        [
          'https://wellfound.com/login',
          'https://wellfound.com/signup',
          'https://wellfound.com/privacy',
          'https://wellfound.com/terms',
        ],
        baseOptions(),
      );
      expect(result).toHaveLength(0);
    });

    it('allows paths that contain blocklist words as substrings (not exact)', () => {
      const result = filterLinks(['https://wellfound.com/company/login-startup'], baseOptions());
      expect(result).toHaveLength(1);
    });

    it('rejects static asset prefixes', () => {
      const result = filterLinks(
        [
          'https://wellfound.com/api/v1/data',
          'https://wellfound.com/static/bundle.js',
          'https://wellfound.com/_next/data/abc',
        ],
        baseOptions(),
      );
      expect(result).toHaveLength(0);
    });

    it('rejects file extensions that are not pages', () => {
      const result = filterLinks(
        [
          'https://wellfound.com/logo.png',
          'https://wellfound.com/styles.css',
          'https://wellfound.com/data.json',
        ],
        baseOptions(),
      );
      expect(result).toHaveLength(0);
    });

    it('deduplicates against urlSeen', () => {
      const opts = baseOptions();
      opts.urlSeen.add(normalizeUrl('https://wellfound.com/jobs/123-engineer'));
      const result = filterLinks(['https://wellfound.com/jobs/123-engineer'], opts);
      expect(result).toHaveLength(0);
    });

    it('deduplicates against frontier', () => {
      const opts = baseOptions();
      opts.frontier = [{ url: 'https://wellfound.com/jobs/123-engineer' }];
      const result = filterLinks(['https://wellfound.com/jobs/123-engineer'], opts);
      expect(result).toHaveLength(0);
    });

    it('respects depth cap (returns empty when nextDepth > maxDepth)', () => {
      const opts = baseOptions();
      opts.currentDepth = 6;
      opts.maxDepth = 6;
      const result = filterLinks(['https://wellfound.com/jobs/123-engineer'], opts);
      expect(result).toHaveLength(0);
    });

    it('allows links at maxDepth-1 (nextDepth == maxDepth)', () => {
      const opts = baseOptions();
      opts.currentDepth = 5;
      opts.maxDepth = 6;
      const result = filterLinks(['https://wellfound.com/jobs/123-engineer'], opts);
      expect(result).toHaveLength(1);
      expect(result[0].depth).toBe(6);
    });

    it('assigns correct depth to filtered links', () => {
      const opts = baseOptions();
      opts.currentDepth = 3;
      const result = filterLinks(['https://wellfound.com/jobs/999-test'], opts);
      expect(result[0].depth).toBe(4);
    });

    it('handles multiple candidates with mixed validity', () => {
      const result = filterLinks(
        [
          'https://wellfound.com/jobs/1-valid',
          'https://external.com/bad',
          'https://wellfound.com/login',
          'https://wellfound.com/company/acme',
          'https://wellfound.com/logo.png',
        ],
        baseOptions(),
      );
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.url)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/jobs/1-valid'),
          expect.stringContaining('/company/acme'),
        ]),
      );
    });
  });

  describe('extractLinksFromHtml', () => {
    it('extracts href values from anchor tags', () => {
      const html = `
        <a href="/jobs/123-engineer">Engineer</a>
        <a href="/company/acme">Acme</a>
        <a href="https://external.com">External</a>
      `;
      const links = extractLinksFromHtml(html, 'https://wellfound.com');
      expect(links).toHaveLength(3);
      expect(links).toContain('https://wellfound.com/jobs/123-engineer');
      expect(links).toContain('https://wellfound.com/company/acme');
      expect(links).toContain('https://external.com/');
    });

    it('resolves relative URLs using base URL', () => {
      const html = '<a href="/jobs/456-test">Test</a>';
      const links = extractLinksFromHtml(html, 'https://wellfound.com/page');
      expect(links[0]).toBe('https://wellfound.com/jobs/456-test');
    });

    it('skips javascript:, mailto:, tel: hrefs', () => {
      const html = `
        <a href="javascript:void(0)">Click</a>
        <a href="mailto:test@test.com">Email</a>
        <a href="tel:+1234567890">Call</a>
      `;
      const links = extractLinksFromHtml(html, 'https://example.com');
      expect(links).toHaveLength(0);
    });

    it('skips href="#" fragments', () => {
      const html = '<a href="#">Top</a>';
      const links = extractLinksFromHtml(html, 'https://example.com');
      expect(links).toHaveLength(0);
    });

    it('deduplicates identical resolved URLs', () => {
      const html = `
        <a href="/jobs/123">Link 1</a>
        <a href="/jobs/123">Link 2</a>
      `;
      const links = extractLinksFromHtml(html, 'https://example.com');
      expect(links).toHaveLength(1);
    });

    it('handles empty HTML', () => {
      const links = extractLinksFromHtml('', 'https://example.com');
      expect(links).toHaveLength(0);
    });
  });
});
