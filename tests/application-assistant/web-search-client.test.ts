import { describe, it, expect } from 'vitest';
import { chromium } from 'playwright';
import { extractDuckDuckGoResultsFromPage } from '../../agents/src/match/web-search-client.js';

describe('DuckDuckGo HTML extraction', () => {
  it('decodes DDG /l/?uddg redirect links and skips internal links', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        `
        <html>
          <head>
            <base href="https://html.duckduckgo.com/html/?q=test" />
          </head>
          <body>
            <div class="result">
              <a class="result__a" href="/l/?uddg=https%3A%2F%2Fnews.airbnb.com%2Fabout-us">Airbnb About Us</a>
              <div class="result__snippet">Press page</div>
            </div>
            <div class="result">
              <a class="result__a" href="https://duckduckgo.com/?q=airbnb">DDG internal</a>
              <div class="result__snippet">Should be skipped</div>
            </div>
            <div class="result">
              <a class="result__a" href="https://en.wikipedia.org/wiki/Airbnb">Airbnb - Wikipedia</a>
            </div>
          </body>
        </html>
        `,
        { waitUntil: 'domcontentloaded', url: 'https://html.duckduckgo.com/html/?q=test' },
      );

      const results = await extractDuckDuckGoResultsFromPage(page);
      const urls = results.map((r) => r.url);

      expect(urls).toContain('https://news.airbnb.com/about-us');
      expect(urls).toContain('https://en.wikipedia.org/wiki/Airbnb');
      expect(urls.some((u) => u.includes('duckduckgo.com'))).toBe(false);
      expect(results.length).toBeGreaterThanOrEqual(2);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
