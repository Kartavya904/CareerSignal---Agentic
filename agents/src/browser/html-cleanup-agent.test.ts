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

  it('handles CSS-heavy single-page app markup while preserving job content', () => {
    const raw = `
      <html>
        <head>
          <style>.foo { color: red; }</style>
          <link rel="stylesheet" href="/app.css" />
          <title>Senior ML Engineer - Acme</title>
        </head>
        <body>
          <div id="__next">
            <header class="nav" style="position:fixed">
              <button onclick="open()">Menu</button>
              <span>Acme Careers</span>
            </header>
            <main>
              <h1 class="job-title">Senior Machine Learning Engineer</h1>
              <div class="company" style="font-weight:bold">Acme Corp</div>
              <section>
                <h2>Responsibilities</h2>
                <ul>
                  <li>Build models</li>
                  <li>Ship features</li>
                </ul>
              </section>
              <section>
                <h2>Requirements</h2>
                <p>5+ years experience, Python, ML.</p>
              </section>
            </main>
            <footer>
              <a href="/privacy">Privacy</a>
            </footer>
          </div>
          <script src="/bundle.js"></script>
        </body>
      </html>
    `;
    const { html } = cleanHtml(raw);
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/rel="[^"]*stylesheet/i);
    expect(html).toContain('Senior Machine Learning Engineer');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Responsibilities');
    expect(html).toContain('Requirements');
    expect(html).toContain('Build models');
    expect(html).toContain('5+ years experience');
  });

  it('handles weird nested spans and inline styles without losing text order', () => {
    const raw = `
      <html>
        <body>
          <div style="background:red">
            <span style="font-size:32px">
              Software <span style="color:blue">Engineer</span>
            </span>
            <p>
              <span>Location:</span>
              <span style="font-weight:bold">Remote</span>
            </p>
            <p>
              <span>About the job:</span>
              <span>Work on deeply nested layouts.</span>
            </p>
          </div>
        </body>
      </html>
    `;
    const { html } = cleanHtml(raw);
    expect(html).not.toMatch(/\sclass="[^"]+"/);
    expect(html).not.toMatch(/\sstyle="[^"]+"/);
    expect(html).toContain('Software Engineer');
    expect(html).toMatch(/Location:\s*Remote/);
    expect(html).toContain('About the job:');
    expect(html).toContain('Work on deeply nested layouts.');
  });
});
