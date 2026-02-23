import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { validateSource } from '@careersignal/agents';

describe('source-validator-agent', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns valid for 200 status with job content', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '<html><body>careers jobs openings apply now</body></html>',
    });

    const result = await validateSource('src-1', 'https://wellfound.com/jobs');
    expect(result.isValid).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.hasJobListings).toBe(true);
  });

  it('returns invalid for 404 status', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      text: async () => '<html><body>404 - page not found</body></html>',
    });

    const result = await validateSource('src-1', 'https://wellfound.com/nonexistent');
    expect(result.isValid).toBe(false);
  });

  it('detects captcha blocker', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '<html><body>Please complete the captcha to continue.</body></html>',
    });

    const result = await validateSource('src-1', 'https://example.com/blocked');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('captcha');
  });

  it('detects login required blocker', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () =>
        '<html><body>Please sign in to view this content. login required</body></html>',
    });

    const result = await validateSource('src-1', 'https://example.com/protected');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('login');
  });

  it('detects access denied blocker', async () => {
    mockFetch.mockResolvedValue({
      status: 403,
      text: async () => '<html><body>403 Forbidden - access denied</body></html>',
    });

    const result = await validateSource('src-1', 'https://example.com/forbidden');
    expect(result.isValid).toBe(false);
  });

  it('detects job content indicators', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () =>
        '<html><body>Browse our job-listing opportunities and apply now</body></html>',
    });

    const result = await validateSource('src-1', 'https://example.com/jobs');
    expect(result.isValid).toBe(true);
    expect(result.hasJobListings).toBe(true);
  });

  it('detects no job content', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '<html><body>This is a blog about cooking recipes.</body></html>',
    });

    const result = await validateSource('src-1', 'https://example.com/blog');
    expect(result.isValid).toBe(true);
    expect(result.hasJobListings).toBe(false);
  });

  it('handles fetch timeout/error', async () => {
    mockFetch.mockRejectedValue(new Error('abort'));

    const result = await validateSource('src-1', 'https://unreachable.com');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('timeout');
  });

  it('handles network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await validateSource('src-1', 'https://unreachable.com');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('ECONNREFUSED');
  });

  it('sets validatedAt timestamp', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '<html><body>jobs</body></html>',
    });

    const result = await validateSource('src-1', 'https://example.com');
    expect(result.validatedAt).toBeDefined();
    expect(new Date(result.validatedAt).getTime()).not.toBeNaN();
  });

  it('sets sourceId on result', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '<html><body>jobs</body></html>',
    });

    const result = await validateSource('my-source-123', 'https://example.com');
    expect(result.sourceId).toBe('my-source-123');
  });
});
