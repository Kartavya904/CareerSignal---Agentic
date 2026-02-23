import { describe, it, expect, vi } from 'vitest';
import { classifyPage, type PageType, ALL_PAGE_TYPES } from '@careersignal/agents';

vi.mock('@careersignal/llm', () => ({
  complete: vi.fn().mockResolvedValue('{"type":"irrelevant","confidence":0.5}'),
}));

describe('page-classifier-agent', () => {
  describe('classifyPage — heuristic path', () => {
    it('classifies a listing page with many job links', async () => {
      const html = `
        <html><body>
          <h1>Startup Jobs</h1>
          <a href="/jobs/1001-engineer">Engineer</a>
          <a href="/jobs/1002-designer">Designer</a>
          <a href="/jobs/1003-pm">PM</a>
          <a href="/jobs/1004-analyst">Analyst</a>
          <a href="/jobs/1005-devops">DevOps</a>
          <a href="/jobs/1006-qa">QA</a>
        </body></html>
      `;
      const result = await classifyPage(html, 'https://wellfound.com/jobs', { useLlm: false });
      expect(result.type).toBe('listing');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.method).toBe('heuristic');
    });

    it('classifies a job detail page', async () => {
      const html = `
        <html><body>
          <h1>Senior Software Engineer</h1>
          <p>Job Description: We are looking for a talented...</p>
          <p>Requirements: 5+ years of experience...</p>
          <button>Apply Now</button>
        </body></html>
      `;
      const result = await classifyPage(
        html,
        'https://wellfound.com/jobs/3898377-senior-software-engineer',
        { useLlm: false },
      );
      expect(result.type).toBe('detail');
      expect(result.method).toBe('heuristic');
    });

    it('classifies a login wall page', async () => {
      const html = `
        <html><body>
          <h1>Sign In</h1>
          <p>Please sign in to continue viewing jobs.</p>
          <form>
            <input type="email" placeholder="Email">
            <input type="password" placeholder="Password">
            <button>Log In</button>
          </form>
        </body></html>
      `;
      const result = await classifyPage(html, 'https://wellfound.com/login', { useLlm: false });
      expect(result.type).toBe('login_wall');
    });

    it('classifies a captcha challenge page', async () => {
      const html = `
        <html><body>
          <div>Please verify you are human</div>
          <div>Complete the captcha to continue</div>
        </body></html>
      `;
      const result = await classifyPage(html, 'https://wellfound.com/verify', { useLlm: false });
      expect(result.type).toBe('captcha_challenge');
    });

    it('classifies an error page (404)', async () => {
      const html = `
        <html><body>
          <h1>Page Not Found</h1>
          <p>The page you are looking for does not exist. 404</p>
        </body></html>
      `;
      const result = await classifyPage(html, 'https://wellfound.com/nonexistent', {
        useLlm: false,
        statusCode: 404,
      });
      expect(result.type).toBe('error');
    });

    it('classifies an expired job page', async () => {
      const html = `
        <html><body>
          <h1>Software Engineer at Acme</h1>
          <p>This job is no longer available. The position has been filled.</p>
        </body></html>
      `;
      const result = await classifyPage(html, 'https://wellfound.com/jobs/old', { useLlm: false });
      expect(result.type).toBe('expired');
    });

    it('classifies a company careers page', async () => {
      const html = `
        <html><body>
          <h1>Acme Corp</h1>
          <p>Open positions at Acme Corp</p>
          <a href="/company/acme/jobs">View Jobs</a>
          <p>See all jobs at this company</p>
        </body></html>
      `;
      const result = await classifyPage(html, 'https://wellfound.com/company/acme', {
        useLlm: false,
      });
      expect(result.type).toBe('company_careers');
    });

    it('classifies an external ATS page', async () => {
      const html = '<html><body><div>Apply on Greenhouse</div></body></html>';
      const result = await classifyPage(html, 'https://boards.greenhouse.io/company/jobs/123', {
        useLlm: false,
      });
      expect(result.type).toBe('external_apply');
    });

    it('classifies a pagination page', async () => {
      const html = `
        <html><body>
          <a href="/jobs/1001-a">Job A</a>
          <a href="/jobs/1002-b">Job B</a>
          <a>Next Page</a>
        </body></html>
      `;
      const result = await classifyPage(html, 'https://wellfound.com/jobs?page=3', {
        useLlm: false,
      });
      expect(['pagination', 'listing']).toContain(result.type);
    });

    it('classifies irrelevant pages (blog, about)', async () => {
      const html = `
        <html><body>
          <h1>About Us</h1>
          <p>We are a company that builds great products.</p>
          <p>Founded in 2020, we have grown to 100 employees.</p>
        </body></html>
      `;
      const result = await classifyPage(html, 'https://wellfound.com/about', { useLlm: false });
      expect(result.type).toBe('irrelevant');
    });

    it('returns signals array with classification reasons', async () => {
      const html = `<html><body>
        <a href="/jobs/1-a">A</a><a href="/jobs/2-b">B</a>
        <a href="/jobs/3-c">C</a><a href="/jobs/4-d">D</a>
        <a href="/jobs/5-e">E</a>
      </body></html>`;
      const result = await classifyPage(html, 'https://wellfound.com/jobs', { useLlm: false });
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('ALL_PAGE_TYPES contains all expected types', () => {
      const expected: PageType[] = [
        'listing',
        'detail',
        'category_listing',
        'company_careers',
        'pagination',
        'search_landing',
        'login_wall',
        'captcha_challenge',
        'error',
        'expired',
        'external_apply',
        'irrelevant',
        'duplicate_canonical',
      ];
      for (const t of expected) {
        expect(ALL_PAGE_TYPES).toContain(t);
      }
    });

    it('handles empty HTML gracefully', async () => {
      const result = await classifyPage('', 'https://wellfound.com', { useLlm: false });
      expect(ALL_PAGE_TYPES).toContain(result.type);
    });
  });
});
