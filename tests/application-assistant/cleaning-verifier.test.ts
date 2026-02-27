import { describe, it, expect } from 'vitest';
import { cleanHtml, verifyCleaning } from '@careersignal/agents';

describe('cleaning verifier agent', () => {
  it('reports high coverage and no lost signals for a good cleaning', () => {
    const raw = `
      <html>
        <head><title>Senior Engineer - Foo</title></head>
        <body>
          <h1>Senior Backend Engineer</h1>
          <h2>Responsibilities</h2>
          <ul>
            <li>Build APIs</li>
            <li>Scale systems</li>
          </ul>
          <h2>Requirements</h2>
          <p>5+ years experience, Go or Rust.</p>
          <script>console.log('noise')</script>
        </body>
      </html>
    `;
    const { html: cleaned } = cleanHtml(raw);
    const result = verifyCleaning(raw, cleaned);
    expect(result.coverageRatio).toBeGreaterThan(0.8);
    expect(result.lostSignals.length).toBe(0);
    expect(result.manualReviewRequired).toBe(false);
  });

  it('flags lost headings and section markers when cleaner drops them', () => {
    const raw = `
      <html>
        <body>
          <h1>Machine Learning Engineer</h1>
          <h2>About the job</h2>
          <p>Work on recommendation systems.</p>
          <h2>Responsibilities</h2>
          <p>Train and deploy models.</p>
        </body>
      </html>
    `;
    // Simulate a bad cleaning that lost headings and section markers
    const cleaned = `
      <html>
        <body>
          <p>Work on recommendation systems.</p>
          <p>Train and deploy models.</p>
        </body>
      </html>
    `;
    const result = verifyCleaning(raw, cleaned);
    expect(result.lostSignals.some((s) => s.includes('Machine Learning Engineer'))).toBe(true);
    expect(result.lostSignals.some((s) => s.includes('about the job'))).toBe(true);
    expect(result.lostSignals.some((s) => s.toLowerCase().includes('responsibilities'))).toBe(true);
    expect(result.manualReviewRequired).toBe(true);
  });
});
