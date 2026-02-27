# Blessed Sources (Default Sources) — Migration & Rationale

## What changed

The default blessed sources used by the **admin scraper** (Planner → Brain → visit/capture/extract) were replaced with sites that are less likely to hit **login walls**, **CAPTCHA**, or **bot blocking**. Your previous set (LinkedIn, Indeed, Glassdoor, Dice, ZipRecruiter, SimplyHired, Built In, Levels.fyi, Wellfound, HN) caused most runs to stall on login/captcha or fail.

The new list is defined in `packages/db/src/seed.ts` as `BLESSED_SOURCES`. Seed runs only when `blessed_sources` is **empty**.

---

## New default sources (ranked: easiest to scrape → more effort)

| Rank | Source                       | URL                                 | Why                                                                                             |
| ---- | ---------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1    | **We Work Remotely**         | https://weworkremotely.com/         | Simple HTML, no login, high remote-job volume, clear listing → detail links on same domain.     |
| 2    | **Remote OK**                | https://remoteok.com/               | Listing-first, relatively open to scraping, good remote volume.                                 |
| 3    | **Stack Overflow Jobs**      | https://stackoverflow.com/jobs      | Tech-focused, often exposes structured data (e.g. JSON-LD), same-domain crawl.                  |
| 4    | **Wellfound (AngelList)**    | https://wellfound.com/jobs          | Kept from previous set (you had PARTIAL success). Dedicated extractor in codebase; same-domain. |
| 5    | **Jobicy**                   | https://jobicy.com/                 | Remote-job aggregator, simple layout, minimal protection.                                       |
| 6    | **Authentic Jobs**           | https://authenticjobs.com/          | Smaller volume, historically scraper-friendly, design/tech jobs.                                |
| 7    | **Product Hunt Jobs**        | https://www.producthunt.com/jobs    | Startup jobs, single domain.                                                                    |
| 8    | **Work at a Startup (YC)**   | https://www.workatastartup.com/jobs | YC companies, listing page exists; may need JS wait.                                            |
| 9    | **The Muse**                 | https://www.themuse.com/jobs        | General job board, same-domain listing/detail.                                                  |
| 10   | **Hacker News Who's Hiring** | https://news.ycombinator.com        | Kept; no login/captcha. Structure is thread-based; extraction may need LLM/fallback.            |

---

## Why not ATS “connectors” (Lever, Greenhouse, etc.)?

- Your crawler is **same-domain**: from one seed URL it only follows links whose host matches the seed (see `filterLinks` in `agents/src/browser/link-filter-agent.ts`). So one “source” = one domain.
- ATS job boards are **per-company**: e.g. `jobs.lever.co/companyA`, `jobs.greenhouse.io/companyB`. There is no single “all Lever jobs” or “all Greenhouse jobs” page on one domain that lists thousands of jobs. So adding `https://jobs.lever.co` as a source would only give that one page; you’d need hundreds of company-specific seeds to get volume.
- Links from aggregators (e.g. Wellfound) to external ATS URLs are **excluded** by design (`isExternalApplyUrl`), so the frontier doesn’t leave the source domain. That’s intentional to keep the crawl bounded and avoid mixing many ATS domains in one source.

So “ATS connectors” don’t map well to your current one-URL-per-source, same-domain crawl model. The new list uses **aggregator/board** domains that host both listing and detail pages on the same site.

---

## Applying the new defaults to an existing DB

### Option A: Run the migration (recommended)

From repo root or `packages/db`:

```bash
npm run db:migrate --workspace=@careersignal/db
```

The migration **`packages/db/drizzle/0007_replace_blessed_sources.sql`** deletes all rows in `blessed_sources` (cache rows cascade-delete) and inserts the 10 new default sources. No need to open Admin or re-seed.

### Option B: Manual SQL then re-seed

Seed runs only when **no** row exists in `blessed_sources`. To switch manually:

1. **Clear blessed sources** (and their job cache, which is tied by FK; cascade will remove cache rows):

   ```sql
   DELETE FROM blessed_sources;
   ```

   If your schema uses `ON DELETE CASCADE` on `job_listings_cache.blessed_source_id`, cache rows are removed automatically. Otherwise delete from `job_listings_cache` first.

2. **Trigger re-seed**: Open the **Admin** page and load the default sources (e.g. the list that calls `GET /api/admin/blessed-sources`). The API sees an empty table and calls `seedBlessedSourcesTable()`, which inserts the new 10 rows.

3. **Re-add to user sources if needed**: If your app adds “default sources” to each user from `blessed_sources`, run that flow again for existing users (e.g. “Add default sources” or your equivalent), or rely on your existing logic that syncs from `blessed_sources`.

---

## Keeping or re-adding old sources

- **Wellfound** and **Hacker News** are in the new list.
- If you want to **keep** an old source (e.g. Dice or SimplyHired) for occasional manual use, don’t delete it: only remove the ones you want to replace. Seed won’t run if **any** row exists, so you’d then insert the new sources manually (or add a one-off script that inserts only the new entries).
- To **revert** to the previous list, restore the old `BLESSED_SOURCES` (and slugs) in `packages/db/src/seed.ts`, then run the same `DELETE FROM blessed_sources` and reload admin so seed runs with the old list.

---

## Summary

- **New defaults**: 10 sources chosen for scrape-friendliness and same-domain crawl; ranked above by ease and yield.
- **ATS as “one URL” sources**: Not a fit for the current design; aggregator/board domains are.
- **Apply to existing DB**: Run `npm run db:migrate --workspace=@careersignal/db` (migration `0007_replace_blessed_sources`), or `DELETE FROM blessed_sources` then reload admin to trigger seed.
