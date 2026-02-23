import { describe, it, expect, vi } from 'vitest';
import { extractJobsFromHtml, discoverWellfoundUrls } from '@careersignal/agents';

vi.mock('@careersignal/llm', () => ({
  complete: vi.fn().mockResolvedValue('[]'),
}));

const WELLFOUND_LISTING_HTML = `
<html>
<head><title>Startup Jobs - Wellfound</title></head>
<body>
  <div>
    <a href="/company/backpack-8"><img alt="Backpack company logo" /></a>
    <a href="/jobs/3898377-senior-backend-software-engineer">Senior Backend Software Engineer</a>
    <span>Backpack<!-- --> • </span>
    <span class="text-gray-700">Remote • $120k – $180k • 2 days ago</span>
  </div>
  <div>
    <a href="/company/techco-5"><img alt="TechCo company logo" /></a>
    <a href="/jobs/4000001-frontend-engineer">Frontend Engineer</a>
    <span>TechCo<!-- --> • </span>
    <span class="text-gray-700">San Francisco, CA • $100k – $150k • 1 day ago</span>
  </div>
  <div>
    <a href="/company/acme-42"><img alt="Acme company logo" /></a>
    <a href="/jobs/5000002-data-scientist">Data Scientist</a>
    <span>Acme<!-- --> • </span>
    <span class="text-gray-700">New York, NY • No Equity • 3 days ago</span>
  </div>
  <div>
    <a href="/company/startup-99/jobs"><span>5<!-- -->open positions</span></a>
  </div>
</body>
</html>
`;

const JSON_LD_HTML = `
<html>
<head>
<script type="application/ld+json">
{
  "@type": "JobPosting",
  "title": "Full Stack Developer",
  "hiringOrganization": { "name": "BigCorp" },
  "jobLocation": { "address": { "addressLocality": "Seattle" } },
  "url": "https://bigcorp.com/jobs/123",
  "datePosted": "2026-02-20",
  "baseSalary": { "currency": "USD", "value": { "minValue": 100000, "maxValue": 150000 } }
}
</script>
</head>
<body><h1>Full Stack Developer</h1></body>
</html>
`;

describe('dom-extractor-agent', () => {
  describe('extractJobsFromHtml — Wellfound strategy', () => {
    it('extracts job listings from Wellfound HTML', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      expect(result.strategy).toBe('site_specific');
      expect(result.listings.length).toBeGreaterThanOrEqual(3);
    });

    it('extracts job URL correctly', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      const firstJob = result.listings.find((l) => l.url.includes('3898377'));
      expect(firstJob).toBeDefined();
      expect(firstJob!.url).toBe(
        'https://wellfound.com/jobs/3898377-senior-backend-software-engineer',
      );
    });

    it('extracts job title from anchor text', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      const job = result.listings.find((l) => l.url.includes('3898377'));
      expect(job!.title).toBe('Senior Backend Software Engineer');
    });

    it('extracts company name', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      const job = result.listings.find((l) => l.url.includes('3898377'));
      expect(job!.company).toBe('Backpack');
    });

    it('extracts salary when present', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      const job = result.listings.find((l) => l.url.includes('3898377'));
      expect(job!.salary).toBeDefined();
      expect(job!.salary).toContain('$120k');
    });

    it('extracts location when present', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      const job = result.listings.find((l) => l.url.includes('4000001'));
      expect(job!.location).toBeDefined();
      expect(typeof job!.location).toBe('string');
      expect(job!.location!.length).toBeGreaterThan(0);
    });

    it('extracts company jobs card (open positions)', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      const companyJob = result.listings.find((l) => l.url.includes('/company/startup-99/jobs'));
      expect(companyJob).toBeDefined();
      expect(companyJob!.title).toContain('open positions');
    });

    it('sets extractedFrom correctly', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      for (const listing of result.listings) {
        expect(listing.extractedFrom).toBe('https://wellfound.com/jobs');
      }
    });

    it('sets confidence level', async () => {
      const result = await extractJobsFromHtml(
        WELLFOUND_LISTING_HTML,
        'https://wellfound.com/jobs',
        { slug: 'wellfound' },
      );
      for (const listing of result.listings) {
        expect(listing.confidence).toBeGreaterThan(0);
        expect(listing.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('deduplicates listings by URL', async () => {
      const dupHtml =
        WELLFOUND_LISTING_HTML +
        '<a href="/jobs/3898377-senior-backend-software-engineer">Duplicate</a>';
      const result = await extractJobsFromHtml(dupHtml, 'https://wellfound.com/jobs', {
        slug: 'wellfound',
      });
      const backpackJobs = result.listings.filter((l) => l.url.includes('3898377'));
      expect(backpackJobs).toHaveLength(1);
    });
  });

  describe('extractJobsFromHtml — JSON-LD strategy', () => {
    it('extracts jobs from JSON-LD markup', async () => {
      const result = await extractJobsFromHtml(JSON_LD_HTML, 'https://bigcorp.com/jobs/123');
      expect(result.strategy).toBe('json_ld');
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].title).toBe('Full Stack Developer');
      expect(result.listings[0].company).toBe('BigCorp');
      expect(result.listings[0].location).toBe('Seattle');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('extractJobsFromHtml — empty HTML', () => {
    it('returns empty array for empty HTML', async () => {
      const result = await extractJobsFromHtml('<html><body></body></html>', 'https://example.com');
      expect(result.listings).toHaveLength(0);
    });
  });

  describe('discoverWellfoundUrls', () => {
    it('discovers company/jobs URLs', () => {
      const urls = discoverWellfoundUrls(WELLFOUND_LISTING_HTML);
      const companyJobUrls = urls.filter((u) => u.type === 'company_jobs');
      expect(companyJobUrls.length).toBeGreaterThan(0);
    });

    it('discovers job detail URLs', () => {
      const urls = discoverWellfoundUrls(WELLFOUND_LISTING_HTML);
      const detailUrls = urls.filter((u) => u.type === 'job_detail');
      expect(detailUrls.length).toBeGreaterThanOrEqual(3);
    });

    it('deduplicates discovered URLs', () => {
      const dupHtml =
        WELLFOUND_LISTING_HTML + '<a href="/jobs/3898377-senior-backend-software-engineer">Dup</a>';
      const urls = discoverWellfoundUrls(dupHtml);
      const backpack = urls.filter((u) => u.url.includes('3898377'));
      expect(backpack).toHaveLength(1);
    });

    it('returns empty for non-Wellfound HTML', () => {
      const urls = discoverWellfoundUrls('<html><body>No jobs here</body></html>');
      expect(urls).toHaveLength(0);
    });
  });
});
