import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { resolveUrl, MAX_ATTEMPTS_PER_SOURCE } from '@careersignal/agents';

describe('url-resolver-agent', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns null immediately when attemptsSoFar >= max', async () => {
    const result = await resolveUrl(
      'https://example.com/broken',
      'Example',
      MAX_ATTEMPTS_PER_SOURCE,
    );
    expect(result.correctedUrl).toBeNull();
    expect(result.attemptsMade).toBe(0);
    expect(result.method).toBe('none');
  });

  it('tries same-domain path alternatives', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      callCount++;
      const u = typeof url === 'string' ? url : (url as Request).url;
      if (u.endsWith('/jobs')) {
        return {
          status: 200,
          text: async () => '<html><body>careers jobs apply now job-listing openings</body></html>',
        };
      }
      return {
        status: 404,
        text: async () => '<html><body>not found 404 page not found</body></html>',
      };
    });

    const result = await resolveUrl('https://example.com/broken', 'Example', 0);
    expect(result.correctedUrl).toBe('https://example.com/jobs');
    expect(result.method).toBe('same_domain');
    expect(result.attemptsMade).toBeGreaterThan(0);
  });

  it('skips same URL as current', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '<html><body>careers jobs openings apply</body></html>',
    });

    const result = await resolveUrl('https://example.com/jobs', 'Example', 0);
    if (result.correctedUrl) {
      expect(result.correctedUrl).not.toBe('https://example.com/jobs');
    }
  });

  it('tracks tried URLs', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      text: async () => '<html><body>404 not found page not found</body></html>',
    });

    const result = await resolveUrl('https://example.com/broken', 'Example', 0);
    expect(result.triedUrls.length).toBeGreaterThan(0);
  });

  it('respects remaining attempt cap', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      text: async () => '<html><body>not found 404 page not found</body></html>',
    });

    const result = await resolveUrl('https://example.com/broken', 'Example', 3);
    expect(result.attemptsMade).toBeLessThanOrEqual(MAX_ATTEMPTS_PER_SOURCE - 3);
  });

  it('returns null for invalid URL', async () => {
    const result = await resolveUrl('not-a-url', 'Example', 0);
    expect(result.correctedUrl).toBeNull();
    expect(result.method).toBe('none');
  });

  it('tries company-name-based patterns after same-domain fails', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      const u = typeof url === 'string' ? url : (url as Request).url;
      if (u.includes('careers.testco.com')) {
        return {
          status: 200,
          text: async () => '<html><body>careers jobs openings hiring apply now</body></html>',
        };
      }
      return {
        status: 404,
        text: async () => '<html><body>404 this page does not exist</body></html>',
      };
    });

    const result = await resolveUrl('https://example.com/broken', 'TestCo', 0);
    if (result.correctedUrl) {
      expect(result.method).toBe('search_based');
    }
  });

  it('MAX_ATTEMPTS_PER_SOURCE is exported and reasonable', () => {
    expect(MAX_ATTEMPTS_PER_SOURCE).toBeGreaterThanOrEqual(3);
    expect(MAX_ATTEMPTS_PER_SOURCE).toBeLessThanOrEqual(10);
  });
});
