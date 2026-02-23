import { describe, it, expect } from 'vitest';
import { cleanHtml } from '@careersignal/agents';

describe('html-cleanup-agent', () => {
  const sampleHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Jobs at Wellfound</title>
  <meta charset="utf-8">
  <meta property="og:url" content="https://wellfound.com/jobs">
  <meta property="og:title" content="Jobs">
  <meta name="description" content="Find startup jobs">
  <meta name="viewport" content="width=device-width">
  <link rel="canonical" href="https://wellfound.com/jobs">
  <link rel="stylesheet" href="/styles.css">
  <link rel="icon" href="/favicon.ico">
  <script src="/bundle.js"></script>
  <style>.foo { color: red; }</style>
</head>
<body>
  <nav class="main-nav" role="navigation" aria-label="Main">
    <a href="/jobs">Jobs</a>
    <a href="/companies">Companies</a>
    <button onclick="toggle()">Menu</button>
    <input type="text" placeholder="Search...">
  </nav>
  <main data-testid="job-list" style="padding: 20px;">
    <h1>Startup Jobs</h1>
    <div class="job-card" data-job-id="123">
      <a href="/jobs/3898377-senior-backend-software-engineer">Senior Backend Software Engineer</a>
      <span>Backpack<!-- --> • </span>
      <a href="/company/backpack-8">Backpack</a>
      <span class="text-gray-700">Remote • $120k – $180k • 2 days ago</span>
    </div>
    <div class="job-card" data-job-id="456">
      <a href="/jobs/4000001-frontend-engineer">Frontend Engineer</a>
      <span>TechCo<!-- --> • </span>
      <a href="/company/techco-5">TechCo</a>
    </div>
    <img src="/logo.png" alt="Company logo">
    <svg><path d="M0 0"/></svg>
    <form action="/search"><input type="text"></form>
  </main>
  <script>console.log('analytics');</script>
  <!-- Google Analytics -->
  <noscript>Enable JS</noscript>
</body>
</html>`;

  it('reduces HTML size significantly', () => {
    const result = cleanHtml(sampleHtml);
    expect(result.cleanedSize).toBeLessThan(result.originalSize * 0.7);
  });

  it('removes script tags', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toContain('analytics');
    expect(html).not.toContain('bundle.js');
  });

  it('removes style tags and stylesheet links', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toContain('.foo');
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
  });

  it('removes button, input, form, img, svg, noscript elements', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).not.toMatch(/<button[\s>]/i);
    expect(html).not.toMatch(/<input[\s>]/i);
    expect(html).not.toMatch(/<form[\s>]/i);
    expect(html).not.toMatch(/<img[\s>]/i);
    expect(html).not.toMatch(/<svg[\s>]/i);
    expect(html).not.toMatch(/<noscript[\s>]/i);
  });

  it('preserves canonical link', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('wellfound.com/jobs');
  });

  it('preserves og:url and og:title meta tags', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).toContain('og:url');
    expect(html).toContain('og:title');
  });

  it('preserves description meta tag', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).toContain('description');
    expect(html).toContain('Find startup jobs');
  });

  it('removes viewport and other non-essential meta', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).not.toContain('viewport');
  });

  it('removes icon link tags', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).not.toContain('favicon');
  });

  it('preserves all anchor hrefs', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).toContain('href="/jobs"');
    expect(html).toContain('href="/jobs/3898377-senior-backend-software-engineer"');
    expect(html).toContain('href="/company/backpack-8"');
    expect(html).toContain('href="/jobs/4000001-frontend-engineer"');
    expect(html).toContain('href="/company/techco-5"');
  });

  it('preserves job titles and company names in text', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).toContain('Senior Backend Software Engineer');
    expect(html).toContain('Backpack');
    expect(html).toContain('Frontend Engineer');
    expect(html).toContain('TechCo');
  });

  it('preserves title tag', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).toMatch(/<title[^>]*>[\s\S]*?<\/title>/);
    expect(html).toContain('Wellfound');
  });

  it('strips class, style, data-*, role, aria-* attributes', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).not.toMatch(/\sclass="/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/\sdata-/);
    expect(html).not.toMatch(/\srole="/);
    expect(html).not.toMatch(/\saria-/);
  });

  it('removes HTML comments', () => {
    const { html } = cleanHtml(sampleHtml);
    expect(html).not.toContain('Google Analytics');
  });

  it('reports elements removed', () => {
    const result = cleanHtml(sampleHtml);
    expect(result.elementsRemoved).toBeGreaterThan(0);
  });

  it('is safe to clean twice (no content loss)', () => {
    const first = cleanHtml(sampleHtml);
    const second = cleanHtml(first.html);
    expect(second.cleanedSize).toBeLessThanOrEqual(first.cleanedSize);
    expect(second.html).toContain('Senior Backend Software Engineer');
    expect(second.html).toContain('href="/jobs/3898377');
    expect(second.html).not.toMatch(/<script[\s>]/i);
  });

  it('handles empty HTML', () => {
    const result = cleanHtml('');
    expect(result.html).toBe('');
    expect(result.originalSize).toBe(0);
    expect(result.cleanedSize).toBe(0);
  });

  it('handles minimal HTML', () => {
    const { html } = cleanHtml('<p>Hello</p>');
    expect(html).toContain('Hello');
  });
});
