# Backup: Previous scope (API-first job scraping pipeline)

This folder contains code from the **previous project scope** (bulk scraping, company catalog, ATS connectors, fingerprinting, job_listings cache). It was moved here when the scope pivoted to **Application Assistant only** (user-provided job URL → extract, match, contact, drafts).

**Do not delete** — kept for reference or potential reuse.

## Contents

- **packages/core/** — `connectors/` (Greenhouse, Lever, Ashby, etc.), `fingerprint.ts`, `dedupe.ts`
- **packages/db/** — `companies.ts`, `job-listings.ts`, `job-observations.ts` (helpers; schema tables remain in main codebase)
- **apps/web/app/admin/** — `CatalogByKind.tsx`, `FingerprintAllButton.tsx`, `BudgetConfigDialog.tsx`, `companies/` (catalog + jobs), `admin-testing-page.tsx` (Testing & Logs)
- **apps/web/app/api/admin/** — `companies/` routes (list, get, scrape, fingerprint, enrich, scraping, jobs), `testing/start` route
- **apps/web/lib/** — `run-company-scrape.ts`, `budgeted-crawler.ts`, `scraper-state.ts`, `source-data.ts`
- **tests/** — `fingerprint.test.ts`, `connectors/greenhouse.test.ts`
- **scripts/** — `clear-jobs.ts`, `clear-companies-and-jobs.ts`, `import-sources-from-csv.ts` (removed from repo root; only here in backup)
- **api-first_job_scraping_pipeline_367290a5.plan.md** — previous Cursor plan
- **docs/** — `BLESSED-SOURCES-MIGRATION.md`, `RISK-AUDIT-APPLICATION-ASSISTANT-AND-ADMIN.md` (reference only)

## Current scope (after pivot)

- **Profile** — resume, basics
- **Preferences** — locations, seniority, filters
- **Application Assistant** — paste job URL → analysis, match, cover letters, prep (single-job, user-initiated only)
- **Admin** — still exists; UI simplified (no Companies/Testing tabs)
- No bulk scraping, no company career-page crawls, no ATS connector pipelines.
