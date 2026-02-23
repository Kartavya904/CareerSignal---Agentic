/**
 * HTML cleanup agent tests using the real Wellfound listing capture.
 * Ensures cleaned output is minimal while preserving all important links and content.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { cleanHtml } from './html-cleanup-agent';

const RAW_CAPTURE_PATH = path.join(
  process.cwd(),
  'data_sources',
  'wellfound',
  'captures',
  'listing',
  '2026-02-22T20-38-29-623Z.html',
);

describe('html-cleanup-agent', () => {
  const rawHtml = fs.existsSync(RAW_CAPTURE_PATH) ? fs.readFileSync(RAW_CAPTURE_PATH, 'utf-8') : '';

  it('loads real capture fixture', () => {
    expect(rawHtml.length).toBeGreaterThan(10000);
  });

  it('reduces size significantly (at least 50% smaller)', () => {
    if (!rawHtml) return;
    const { html, originalSize, cleanedSize } = cleanHtml(rawHtml);
    expect(cleanedSize).toBeLessThan(originalSize * 0.5);
    expect(html.length).toBe(cleanedSize);
  });

  it('removes script, style, button, img, input from output', () => {
    if (!rawHtml) return;
    const { html } = cleanHtml(rawHtml);
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/<button[\s>]/i);
    expect(html).not.toMatch(/<img[\s>]/i);
    expect(html).not.toMatch(/<input[\s>]/i);
  });

  it('keeps canonical link and title', () => {
    if (!rawHtml) return;
    const { html } = cleanHtml(rawHtml);
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('wellfound.com/jobs');
    expect(html).toMatch(/<title[^>]*>[\s\S]*?<\/title>/);
    expect(html).toContain('Wellfound');
  });

  it('preserves job and company links', () => {
    if (!rawHtml) return;
    const { html } = cleanHtml(rawHtml);
    expect(html).toContain('href="/jobs/3898377-senior-backend-software-engineer"');
    expect(html).toContain('href="/company/backpack-8"');
    expect(html).toContain('Senior Backend Software Engineer');
    expect(html).toContain('Backpack');
    expect(html).toContain('href="/company/');
    expect(html).toContain('href="/jobs/');
  });

  it('has no class attributes (stripped for minimal output)', () => {
    if (!rawHtml) return;
    const { html } = cleanHtml(rawHtml);
    expect(html).not.toMatch(/\sclass="[^"]+"/);
  });

  it('has no stylesheet or icon link tags', () => {
    if (!rawHtml) return;
    const { html } = cleanHtml(rawHtml);
    expect(html).not.toMatch(/<link[^>]+rel="[^"]*stylesheet/i);
    expect(html).not.toMatch(/<link[^>]+rel="[^"]*icon/i);
    expect(html).not.toMatch(/apple-touch-icon/i);
  });
});
