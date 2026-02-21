# CareerSignal (Agentic) — Project Plan Next (Running)

**Purpose:** This is the **running next plan** for what to build next. It is updated as work progresses. It aligns with `project_scope.md` and `plan.md` and references the same agents, schemas, and workflows.

**Current focus:** Default/blessed sources backed by a database, and **continuous back-end scraping** of job postings from those sources so jobs are **cached in the database** for easier access and to avoid running full scraping on every user scan.

**Where to start:** Begin with **Phase 1**: add the `blessed_sources` table and migration, then `job_listings_cache`, then seed the 10 blessed sources and point the defaults API at the DB. After that, implement scraping for **one** blessed source (Phase 2), then scheduling (Phase 3), then wiring scans to the cache (Phase 4).

---

## 1. Goal Summary

| Goal                             | Description                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Seed default sources from DB** | Move blessed/default sources from code into a **system-wide table** so they are the single source of truth and can be extended or tuned without code changes.                       |
| **Cache job postings in DB**     | Back-end **continuously scrapes** job listings from blessed sources and stores them in a **job cache table**. Scans and UI then read from this cache instead of scraping on demand. |
| **One source at a time**         | Implement scraping and caching **per blessed source** (e.g. Wellfound first, then Indeed, etc.) so we conquer complexity incrementally.                                             |

**Out of scope for this plan:** User-facing ranking, scoring, contact discovery, outreach, blueprint, tracker — those remain as in the main V1 scope and will consume the cached jobs later.

---

## 2. Current State (Relevant to This Plan)

- **Blessed sources:** Defined in code only: `packages/db/src/seed.ts` → `BLESSED_SOURCES` (10 entries). Exposed via `GET /api/sources/defaults` for the Sources page. **Not** auto-seeded into the user’s `sources` table; user adds by choice.
- **User sources:** `packages/db` table `sources` (user-scoped: `user_id`, name, url, type, enabled, is_blessed, last_scanned_at, status, etc.). No link to a “master” blessed definition yet.
- **Jobs:** Table `jobs` exists in `packages/db/src/schema.ts` with `run_id`, `source_id` (user’s source), `user_id`, and full canonical fields (title, company_name, source_url, location, remote_type, seniority, raw_extract, dedupe_key, match_score, etc.). Jobs are today **run-scoped** (created when a scan run executes). There is **no** shared cache of jobs by source.
- **Scraping:** No browser-based extraction yet. No Playwright, no DOM Extractor, no Pagination agent (see `project_scope_completion.md` § 1.3, 1.4).

---

## 3. Naming and Data Model (Decisions)

### 3.1 Table Names

| Concept                                      | Recommended name     | Rationale                                                                                                          |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Master list of default/blessed sources**   | `blessed_sources`    | Matches scope (“blessed default boards”) and existing `is_blessed` on user sources. System-wide (no `user_id`).    |
| **Cached job postings from blessed sources** | `job_listings_cache` | Clearly a cache; distinct from user/run-scoped `jobs`. Holds raw-normalized listings keyed by `blessed_source_id`. |

Alternatives considered:

- **default_sources** — fine; “blessed” is already in the codebase and scope.
- **cached_jobs** — could be confused with `jobs`; “listings_cache” makes the “pre-scored, pre-run” nature clear.

### 3.2 `blessed_sources` Table (System-Wide)

Stores the **definitions** of the 10 (or more) blessed sources. One row per source; no `user_id`.

| Column                     | Type                 | Purpose                                                                                           |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `id`                       | uuid PK              | Stable reference for `job_listings_cache` and for linking user `sources` to a blessed definition. |
| `name`                     | varchar(255)         | Display name (e.g. "LinkedIn Jobs", "Wellfound (AngelList)").                                     |
| `url`                      | text                 | Base/canonical URL for the source.                                                                |
| `type`                     | enum                 | Same as scope: COMPANY, AGGREGATOR, COMMUNITY, CUSTOM.                                            |
| `slug`                     | varchar(64) optional | Optional stable key (e.g. `linkedin_jobs`, `wellfound`) for code and APIs.                        |
| `enabled_for_scraping`     | boolean              | Allow turning off scraping per source without deleting (rate limits, ToS, etc.).                  |
| `scrape_interval_minutes`  | integer optional     | Target interval between full scrapes (e.g. 60, 1440).                                             |
| `last_scraped_at`          | timestamp            | Last time we successfully ran a scrape for this source.                                           |
| `last_scrape_status`       | enum optional        | SUCCESS, FAILED, PARTIAL.                                                                         |
| `created_at`, `updated_at` | timestamp            | Audit.                                                                                            |

**Scope alignment:** Same names/URLs as in `project_scope.md` § 1.2 Blessed Default Sources (10). Types: mostly AGGREGATOR; Hacker News = COMMUNITY.

### 3.3 `job_listings_cache` Table (Cache of Scraped Listings)

Stores **normalized job listings** scraped from blessed sources. No `run_id`, no `user_id`. Used as the **source of truth** for “what jobs are currently on this board” until we run a user scan (which can copy/filter from cache into `jobs` and apply scoring).

| Column                                        | Type                      | Purpose                                                      |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| `id`                                          | uuid PK                   |                                                              |
| `blessed_source_id`                           | uuid FK → blessed_sources | Which source this listing came from.                         |
| `title`                                       | varchar(512)              | Required (scope).                                            |
| `company_name`                                | varchar(255)              | Required (scope).                                            |
| `source_url`                                  | text                      | Required (scope) — link to the job on the source.            |
| `location`                                    | varchar(255)              |                                                              |
| `remote_type`                                 | varchar(32)               | REMOTE, HYBRID, ONSITE, UNKNOWN.                             |
| `seniority`                                   | enum                      | Per scope seniority enum.                                    |
| `employment_type`                             | enum                      | FULL_TIME, PART_TIME, etc.                                   |
| `visa_sponsorship`                            | varchar(16)               | YES, NO, UNKNOWN.                                            |
| `description`                                 | text                      |                                                              |
| `requirements`                                | jsonb (string[])          |                                                              |
| `posted_date`                                 | date                      |                                                              |
| `salary_min`, `salary_max`, `salary_currency` | decimal/varchar           |                                                              |
| `department`, `team`                          | varchar(255)              |                                                              |
| `apply_url`                                   | text                      |                                                              |
| `raw_extract`                                 | jsonb                     | Original scraped payload (evidence, replay).                 |
| `evidence_refs`                               | jsonb (string[])          | Artifact paths (e.g. `artifacts/runs/…`).                    |
| `confidence`                                  | decimal(3,2)              | Extraction confidence 0–1.                                   |
| `dedupe_key`                                  | varchar(64)               | Fuzzy hash(title + company) for dedupe (scope § 1.4).        |
| `first_seen_at`                               | timestamp                 | When we first saw this listing in cache.                     |
| `last_seen_at`                                | timestamp                 | Last time this listing appeared in a scrape (for freshness). |
| `created_at`, `updated_at`                    | timestamp                 |                                                              |

**No** `match_score`, `score_breakdown`, `strict_filter_pass` here — those are per-user and per-run; they go in `jobs` when we run a scan.

**Deduplication:** Within a blessed source, upsert by `dedupe_key` (and optionally `source_url`): if we see the same job again, update `last_seen_at` and any changed fields; if new, insert. Cross-source dedupe can be done later when merging into `jobs`.

### 3.4 Linking User Sources to Blessed Sources (Optional but Recommended)

To know “this user’s source is the same as this blessed source” (so we can serve cache for their scan):

- Add **optional** `blessed_source_id` (uuid FK → blessed_sources) to the existing `sources` table. When user adds a source from the “Add default sources” UI, set this to the corresponding `blessed_sources.id`. Then when we run a scan for that user source, we can read from `job_listings_cache` where `blessed_source_id = source.blessed_source_id` instead of scraping again.

---

## 4. Phased Implementation Plan

### Phase 1: Database and Seeding (Do First)

**Objective:** Blessed sources live in the DB and are the single source of truth; Sources page can seed from them.

| Step | Task                                           | Details                                                                                                                                                                                                                                |
| ---- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Add `blessed_sources` table                    | Drizzle schema in `packages/db/src/schema.ts`; create migration.                                                                                                                                                                       |
| 1.2  | Seed `blessed_sources`                         | Migration or seed script that inserts the 10 from `project_scope.md` (same names/URLs/types as current `BLESSED_SOURCES`). Set `enabled_for_scraping: true` and a default `scrape_interval_minutes` (e.g. 1440 = daily) if you add it. |
| 1.3  | Add `job_listings_cache` table                 | Schema + migration; FK to `blessed_sources`. Index on `(blessed_source_id, dedupe_key)` for upserts; index on `blessed_source_id, last_seen_at` for “current” listings.                                                                |
| 1.4  | Optional: add `blessed_source_id` to `sources` | Migration: add nullable `blessed_source_id` to user `sources`; update `addSource` and “Add default source” API to set it when adding a blessed source.                                                                                 |
| 1.5  | Default sources API from DB                    | Change `GET /api/sources/defaults` to read from `blessed_sources` instead of (or in addition to) `BLESSED_SOURCES` in code. Keep backward compatibility: if table empty, fall back to seed constant.                                   |
| 1.6  | Optional: “Seed my sources” from blessed       | If desired: button or one-time behavior to insert into user `sources` one row per `blessed_sources` (with `blessed_source_id` set). Idempotent by `blessed_source_id` so we don’t duplicate.                                           |

**Exit criteria:** Blessed sources are in DB; defaults API returns them; UI unchanged or improved (e.g. “Add default sources” still works, optionally with “Seed all” from DB). No scraping yet.

---

### Phase 2: Scraping Pipeline for One Blessed Source

**Objective:** End-to-end scrape for **one** blessed source: navigate → extract → normalize → upsert into `job_listings_cache`. Pick the **easiest** site first (e.g. Wellfound, or a simple company careers page) to validate the pipeline before tackling LinkedIn/Indeed.

**Agents to implement (per scope and plan):**

| Agent                          | Role                                                                                                            | Build order |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------- |
| **Browser Navigator Agent**    | Playwright driver; navigates to source URL; captures HTML (and optionally screenshots).                         | 1           |
| **Pagination/Discovery Agent** | Finds “next” / “load more” / filters; returns list of page URLs or triggers load.                               | 2           |
| **DOM Extractor Agent**        | Extracts job cards/links and metadata from HTML (selectors, heuristics, or site-specific recipe).               | 3           |
| **Job Normalizer Agent**       | Maps raw extract to canonical schema (title, company_name, source_url, location, etc.); generates `dedupe_key`. | 4           |

**Implementation steps:**

| Step | Task                             | Details                                                                                                                                                                                                                                                   |
| ---- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | Playwright + Browser Navigator   | Add Playwright (or use existing if present). Agent: input = (blessed_source_id or url), output = HTML (and optional screenshot paths). Store artifacts under `artifacts/blessed/{blessed_source_id}/{timestamp}/` per scope § 1.3.                        |
| 2.2  | DOM Extractor (one source)       | Site-specific or heuristic selectors for **one** blessed source. Input: HTML (or page object). Output: list of raw job objects (title, company, link, snippet, etc.). Start with a minimal set of fields.                                                 |
| 2.3  | Pagination (if needed)           | For that source, implement “next page” or “load more” so we get multiple pages of listings. May be simple (e.g. page=2) or click-based.                                                                                                                   |
| 2.4  | Job Normalizer                   | Input: raw extract. Output: one row per job in canonical shape (title, company_name, source_url, location, remote_type, seniority, employment_type, description, raw_extract, dedupe_key, confidence). Use scope § 1.4 Job schema; no match_score here.   |
| 2.5  | Upsert into `job_listings_cache` | For each normalized job: upsert by `(blessed_source_id, dedupe_key)`. Set `first_seen_at` on insert, `last_seen_at` on every scrape. Optionally mark listings that no longer appear as stale (e.g. don’t delete; use `last_seen_at` to filter “current”). |
| 2.6  | Update `blessed_sources`         | Set `last_scraped_at`, `last_scrape_status` (SUCCESS/FAILED) after each run.                                                                                                                                                                              |
| 2.7  | Run once manually                | Trigger one scrape for the chosen source; verify rows in `job_listings_cache` and artifact files.                                                                                                                                                         |

**Exit criteria:** One blessed source can be scraped end-to-end; cache table is populated; artifacts stored; no continuous loop yet.

---

### Phase 3: Background / Continuous Scraping

**Objective:** Run the scraping pipeline **on a schedule** (e.g. every N minutes per source) so the cache stays updated without user action.

| Step | Task                               | Details                                                                                                                                                                  |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1  | Scheduler or cron                  | Simple: DB-backed job queue (e.g. “scrape_blessed_source” job per source, run every `scrape_interval_minutes`) or OS cron calling a script. No Temporal required for V1. |
| 3.2  | Rate limiting and pacing           | Per scope § 1.2 and Policies: respect domains; configurable delay between requests; no CAPTCHA bypass. Store rate-limit state per domain (or per blessed_source_id).     |
| 3.3  | Failure handling                   | On scrape failure: set `last_scrape_status = FAILED`; log error; retry with backoff. Do not block other sources.                                                         |
| 3.4  | One source at a time (then expand) | Run Phase 2 pipeline for the **next** blessed source (different DOM/selectors). Repeat until all 10 are covered (can be slow; prioritize high-value or easy ones).       |

**Exit criteria:** At least one source is scraped on a schedule; cache is periodically updated; no user action required for cache refresh.

---

### Phase 4: Wire User Sources and Scans to Cache

**Objective:** When a user has added a blessed source (user `sources` row with `blessed_source_id` set), a “scan” uses **cached** listings for that source instead of scraping on demand.

| Step | Task                     | Details                                                                                                                                                                                                                                                    |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | Scan reads from cache    | For each enabled user source that has `blessed_source_id`: load jobs from `job_listings_cache` where `blessed_source_id = X` and `last_seen_at` within last N days (configurable). Copy into `jobs` with `run_id`, `user_id`, `source_id` (user’s source). |
| 4.2  | Scoring (later)          | Run Rule Scorer + LLM Ranker on those jobs (existing scope); fill `match_score`, `strict_filter_pass`, etc. Top-K and UI remain as in scope.                                                                                                               |
| 4.3  | “0 jobs” on Sources page | Today default source boxes show “0 jobs”. Once cache exists, show count from `job_listings_cache` for that blessed source (e.g. “142 jobs” instead of “0 jobs”).                                                                                           |

**Exit criteria:** User adding a blessed source and starting a scan sees jobs from cache (and eventually scored); Sources page can show cached job counts.

---

## 5. Agents and Files (Reference)

### 5.1 Agents from plan.md / project_scope.md

- **Source Validator Agent** (scope § 1.2): Validates URL reachability. Can run **before** first scrape for a blessed source and set `last_validated_at` on user sources when they add one. Lower priority than Navigator/Extractor/Normalizer for “cache first”.
- **Browser Navigator Agent** (scope § 1.3): Playwright; navigates and captures. **Build in Phase 2.**
- **DOM Extractor Agent** (scope § 1.3): Extracts job cards from HTML. **Build in Phase 2**, per-source.
- **Pagination/Discovery Agent** (scope § 1.3): Next page / load more. **Build in Phase 2** when needed.
- **Job Normalizer Agent** (scope § 1.4): Raw → canonical Job schema; dedupe_key. **Build in Phase 2.**
- **Entity Resolution Agent** (scope § 1.4): Cross-run/source dedupe. Can come **after** we have multiple sources in cache.

### 5.2 Suggested File Layout

| Area                  | Files / location                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| DB                    | `packages/db/src/schema.ts` — add `blessed_sources`, `job_listings_cache`; optional `sources.blessed_source_id`.                              |
| Migrations            | `packages/db/drizzle/` — new migration(s).                                                                                                    |
| Seed                  | `packages/db/src/seed.ts` — keep `BLESSED_SOURCES` as fallback; add `seedBlessedSourcesTable()` that inserts into `blessed_sources` if empty. |
| Defaults API          | `apps/web/app/api/sources/defaults/route.ts` — read from `blessed_sources` with fallback to constant.                                         |
| Browser agent         | `agents/src/browser/` or `packages/…/browser/` — Navigator, DOM Extractor, Pagination (per plan/scope structure).                             |
| Normalizer            | `agents/src/normalize/` or same package — Job Normalizer.                                                                                     |
| Scraper orchestration | New module or script: “run scrape for blessed_source_id X”; calls Navigator → Extractor → Pagination → Normalizer → upsert cache.             |
| Scheduler             | Script or queue consumer: “every N min, enqueue scrape jobs for each blessed_sources row where enabled_for_scraping”.                         |

---

## 6. Differences from Original Scope (Intentional)

| Scope wording                                                             | This plan                                                                                                                | Reason                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| “Crawl timing: **On add** — browser agent crawls when user adds [source]” | We **also** run **continuous** background scraping for blessed sources and **cache** results. User scan then uses cache. | Reduces repeated scraping; faster scans; single place to respect rate limits. |
| Jobs “populate in **user’s** database                                     | Cached jobs are in **shared** `job_listings_cache`; we **copy** into user-scoped `jobs` when they run a scan.            | Keeps one canonical cache; user data stays run-scoped for scoring and UI.     |
| “At least 10” blessed sources                                             | Same 10; table allows adding more later without code change.                                                             | Aligns with scope; extensible.                                                |

---

## 7. Risks and Mitigations

| Risk                 | Mitigation                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limits / blocks | Per-domain pacing; configurable delays; `scrape_interval_minutes` per source; respect robots.txt and scope Policies.                              |
| ToS / anti-bot       | No CAPTCHA bypass; detect blockers and back off; prefer official/public behavior (scope § Policies).                                              |
| DOM breakage         | Site-specific selectors will break; add `last_scrape_status = FAILED` and alerts; V2 Self-Healing Source (scope) can later suggest new selectors. |
| Storage growth       | `job_listings_cache`: periodic prune of rows with `last_seen_at` older than e.g. 90 days; or soft-delete.                                         |

---

## 8. Success Criteria for This Plan

- **Phase 1:** Blessed sources table exists and is seeded; defaults API uses it; optional “seed my sources” from blessed list.
- **Phase 2:** At least one blessed source is scraped end-to-end; listings appear in `job_listings_cache` with correct schema and artifacts.
- **Phase 3:** That source (and eventually others) is scraped on a schedule without user action.
- **Phase 4:** User scan for a blessed source uses cache; Sources page can show cached job counts.

---

## 9. Checklist (Copy and Tick as You Go)

**Phase 1**

- [ ] Add `blessed_sources` to schema + migration
- [ ] Add `job_listings_cache` to schema + migration
- [ ] Seed `blessed_sources` with 10 entries (migration or seed script)
- [ ] Optional: add `blessed_source_id` to `sources` + migration
- [ ] GET /api/sources/defaults reads from `blessed_sources` (fallback to constant)
- [ ] Optional: “Seed my sources” from blessed list (idempotent)

**Phase 2**

- [ ] Playwright + Browser Navigator agent (one blessed source)
- [ ] DOM Extractor for that source (minimal fields)
- [ ] Pagination for that source (if applicable)
- [ ] Job Normalizer (canonical schema + dedupe_key)
- [ ] Upsert into `job_listings_cache` + update `blessed_sources.last_scraped_at`
- [ ] Manual run and verify cache + artifacts

**Phase 3**

- [ ] Scheduler/cron for periodic scrape
- [ ] Rate limiting and failure handling
- [ ] Add second (and more) blessed sources to pipeline

**Phase 4**

- [ ] Scan uses cache when user source has `blessed_source_id`
- [ ] Sources page shows cached job count per default source

---

_Document is the running “project plan next”; update it as phases complete or scope shifts._
