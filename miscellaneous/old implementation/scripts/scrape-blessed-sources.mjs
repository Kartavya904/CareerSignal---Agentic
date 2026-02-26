/**
 * Scrape job listings from blessed sources and upsert into job_listings_cache.
 * Only scrapes sources where enabled_for_scraping is true.
 *
 * Run: node scripts/scrape-blessed-sources.mjs [slug]
 * Optional slug: scrape only that source (e.g. wellfound). Otherwise scrapes all enabled.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
config(); // fallback to .env
import { chromium } from 'playwright';
import {
  getDb,
  listBlessedSources,
  upsertJobListingCache,
  setBlessedSourceScraped,
} from '@careersignal/db';
import { extractJobsFromHtml, normalizeJobForCache } from '@careersignal/agents';

async function navigateAndGetHtml(url) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));
    const html = await page.content();
    await browser.close();
    return { success: true, html };
  } catch (err) {
    await browser.close();
    return { success: false, error: err.message };
  }
}

async function main() {
  const slugArg = process.argv[2];
  const db = getDb();
  let sources = await listBlessedSources(db);
  sources = sources.filter((s) => s.enabledForScraping);
  if (slugArg) {
    const slug = slugArg.toLowerCase();
    sources = sources.filter((s) => (s.slug || '').toLowerCase() === slug);
    if (sources.length === 0) {
      console.error(`No blessed source with slug "${slugArg}" found or enabled.`);
      process.exit(1);
    }
  }

  for (const source of sources) {
    console.log(`\nScraping: ${source.name} (${source.url})...`);
    const nav = await navigateAndGetHtml(source.url);
    if (!nav.success) {
      console.error(`  Navigate failed: ${nav.error}`);
      await setBlessedSourceScraped(db, source.id, 'FAILED');
      continue;
    }

    const result = await extractJobsFromHtml(nav.html, source.url, {
      slug: source.slug || undefined,
    });
    const listings = result.listings;
    console.log(`  Extracted ${listings.length} raw listings (strategy: ${result.strategy})`);

    let upserted = 0;
    for (const raw of listings) {
      const row = normalizeJobForCache(raw, source.id);
      await upsertJobListingCache(db, row);
      upserted++;
    }

    const status = listings.length > 0 ? 'SUCCESS' : 'PARTIAL';
    await setBlessedSourceScraped(db, source.id, status);
    console.log(`  Upserted ${upserted} jobs. Status: ${status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
