import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { agentLog } from '@/lib/agent-logs';
import {
  getDb,
  listBlessedSources,
  upsertJobListingCache,
  setBlessedSourceScraped,
} from '@careersignal/db';
import { extractJobsFromHtml, normalizeJobForCache } from '@careersignal/agents';
import { chromium } from 'playwright';

/** Admin: run scraper in-process so logs appear in terminal. */
export async function POST() {
  try {
    await getRequiredUserId();

    const db = getDb();
    const sources = (await listBlessedSources(db)).filter((s) => s.enabledForScraping);

    if (sources.length === 0) {
      agentLog('Scraper', 'No enabled sources. Enable at least one in Admin.', { level: 'warn' });
      return NextResponse.json({ ok: true, message: 'No enabled sources' });
    }

    agentLog('Scraper', `Starting scrape for ${sources.length} source(s)...`, { level: 'info' });

    for (const source of sources) {
      agentLog('Navigator', `Opening ${source.name} (${source.url})`, { level: 'info' });
      let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
      try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        agentLog('Navigator', `Navigating to ${source.url}`, { level: 'info' });
        await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        agentLog('Navigator', 'Waiting 3s for content…', { level: 'info' });
        await new Promise((r) => setTimeout(r, 3000));
        const html = await page.content();
        agentLog('Navigator', `Captured HTML (${html.length} chars)`, { level: 'info' });
        await browser.close();
        browser = null;

        agentLog('DOM Extractor', `Extracting jobs from ${source.name}`, { level: 'info' });
        const result = await extractJobsFromHtml(html, source.url, {
          slug: source.slug ?? undefined,
        });
        agentLog(
          'DOM Extractor',
          `Found ${result.listings.length} raw listings (strategy: ${result.strategy})`,
          { level: result.listings.length > 0 ? 'success' : 'warn' },
        );

        agentLog('Normalizer', `Normalizing ${result.listings.length} jobs for cache`, {
          level: 'info',
        });
        let upserted = 0;
        for (const raw of result.listings) {
          const row = normalizeJobForCache(raw, source.id);
          await upsertJobListingCache(db, row);
          upserted++;
        }

        agentLog('Normalizer', `Upserted ${upserted} jobs to job_listings_cache`, {
          level: 'success',
        });
        const status = result.listings.length > 0 ? 'SUCCESS' : 'PARTIAL';
        await setBlessedSourceScraped(db, source.id, status);
        agentLog('Scraper', `${source.name}: ${status}`, { level: 'success' });
      } catch (err) {
        if (browser) await browser.close();
        const msg = err instanceof Error ? err.message : String(err);
        agentLog('Scraper', `${source.name} failed: ${msg}`, {
          level: 'error',
          detail: String(err),
        });
        await setBlessedSourceScraped(db, source.id, 'FAILED');
      }
    }

    agentLog('Scraper', 'Scrape run complete.', { level: 'success' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    agentLog('Scraper', `Scrape failed: ${msg}`, { level: 'error' });
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
