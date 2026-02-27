# Risk Audit: Application Assistant & Admin

**Purpose:** Document “little things” that could cause trouble later—assumptions, edge cases, and operational risks across the application assistant, admin scraper, and related flows. Use this to prioritize hardening and to avoid surprises.

---

## 1. Paths and process.cwd()

### 1.1 Data roots depend on current working directory

**Where:**

- `apps/web/lib/application-assistant-disk.ts`: `ROOT = path.join(process.cwd(), '..', '..', 'data_application_assistant')`
- `apps/web/lib/source-data.ts`: `DATA_SOURCES_ROOT = path.join(process.cwd(), '..', '..', 'data_sources')`
- `apps/web/lib/user-data.ts`: `DATA_USER_ROOT = path.join(process.cwd(), '..', '..', 'data_user')`

**Risk:** These assume `process.cwd()` is `apps/web` when the app runs. If you start the app from the repo root (e.g. `npm run dev` from root with a root-level script that runs Next from there), `cwd` can be the repo root and `../..` points **outside** the repo. That can lead to wrong or missing folders, or writing to an unexpected place.

**Mitigation:**

- Prefer a single “project root” (e.g. env var `PROJECT_ROOT` or `DATA_ROOT`) and build all data paths from it.
- Or resolve once: e.g. `path.resolve(process.cwd(), 'data_application_assistant')` when you intend “repo root” and document that dev must be run from repo root.

---

### 1.2 Run folder deletion and path traversal

**Where:** `apps/web/lib/application-assistant-disk.ts` — `deleteRunFolder(folderName)` does `path.join(ROOT, folderName)`.

**Risk:** Today `folderName` is always from `getRunFolderName(userName, userId)` (server-controlled). If the DB were ever edited or a bug wrote a value like `../../etc`, joining could escape the intended root.

**Mitigation:** Sanitize before join: reject `folderName` containing `..` or `path.sep`, or resolve and assert the result is under `ROOT`.

---

## 2. Admin and auth

### 2.1 No separate admin role

**Where:** All admin routes (scrape start/stop, blessed sources, logs, etc.) use `getRequiredUserId()`. Any signed-in user can call them.

**Risk:** With multiple users, everyone is effectively “admin”: can start/stop scraper, change blessed sources, see admin logs. Fine for single-user V1; problematic once you have real multi-tenant or external users.

**Mitigation:** Introduce an explicit admin check (e.g. env list `ADMIN_USER_IDS`, or an `isAdmin` flag in DB) and guard admin routes with it.

---

### 2.2 Session secret and DB URL

**Where:**

- `apps/web/lib/session.ts`: `AUTH_SECRET` required (min 16 chars).
- `packages/db` / `lib/db-error.ts`: `DATABASE_URL` for PostgreSQL.

**Risk:** Missing or weak `AUTH_SECRET` weakens session integrity. Wrong or missing `DATABASE_URL` breaks all DB-backed features.

**Mitigation:** Document in README or deploy checklist. Consider failing fast at startup if `AUTH_SECRET` is missing or too short in production.

---

## 3. Application Assistant pipeline

### 3.1 Company research on ATS origins (fixed)

**Where:** `apps/web/lib/application-assistant-runner.ts` — company research step.

**Was:** Using job page origin (e.g. `https://jobs.lever.co`) and appending `/about` led to fetching the ATS’s about page (e.g. Lever) instead of the hiring company.

**Current:** ATS origins are detected and we try a company-derived URL (e.g. `https://jobgether.com/about`) or skip research. Remaining risk: company-name → domain guess can be wrong (e.g. “BDG” → bdg.com) or the company site may not have `/about`. Then we simply don’t get company context; no more “wrong company” research.

---

### 3.2 Company name from URL vs page

**Where:** `agents/src/browser/job-detail-extractor-agent.ts` — Lever/Greenhouse/Workable DOM fallbacks and `companyFromUrlSlug()`.

**Risk:** For ATS pages we often derive company from the URL path (e.g. `jobgether` → “Jobgether”). If the page shows a different name (parent company, DBA, or “Powered by X”), we can store the wrong company name everywhere (match, cover letter, interview prep). Same for other ATS-specific fallbacks.

**Mitigation:** Prefer on-page company when present (e.g. from JSON-LD `hiringOrganization.name` or DOM); use URL slug only when page doesn’t provide a name. Optionally log when we fall back to URL-derived name so you can tune extractors.

---

### 3.3 URL resolver depth and same-origin

**Where:** `apps/web/lib/application-assistant-runner.ts` — `resolveToJobPage()` with `MAX_RESOLVE_DEPTH = 2`.

**Risk:** We only follow links that stay on the same origin as the current URL. If the “real” job is on another domain (e.g. redirect to greenhouse.io from company careers page), we may never resolve and report “not a job” or “listing” instead of following through. Depth limit can also stop before reaching the actual job page on deep sites.

**Mitigation:** Document this as a known limitation. Optionally allow one cross-origin hop for known ATS domains (e.g. greenhouse.io, lever.co) when the current page is a company careers page.

---

### 3.4 Classifier: known non-job domains

**Where:** `agents/src/browser/page-classifier-agent.ts` — `KNOWN_NON_JOB_DOMAINS` (google.com, youtube.com, wikipedia.org, openai.com, github.com).

**Risk:** If a job board or company careers page is hosted on a subdomain we didn’t consider (e.g. jobs.github.com is actually jobs), we might mark it irrelevant. Currently the list is small and conservative; adding more domains without checking can cause false “irrelevant” on real job pages.

**Mitigation:** When adding domains, prefer allowlists for known job subdomains (e.g. jobs.\*.com) or path-based rules rather than blocking whole domains that might host jobs somewhere.

---

### 3.5 Scraper vs Application Assistant mutual exclusion

**Where:**

- Application assistant start: blocks if `getScraperStatus().running`.
- Scraper start: blocks if `getAssistantStatus().running`.

**Risk:** State is in-memory. If the process restarts while the scraper or assistant is “running”, state resets and the other flow can start. DB can still think an analysis is in progress. No cross-process lock.

**Mitigation:** For production, consider persisting “scraper running” / “assistant running” in DB (or a small lock table) so after restart you don’t run both, and so you can detect stuck runs.

---

## 4. Scrape loop and admin scraper

### 4.1 In-memory scraper state

**Where:** `apps/web/lib/scraper-state.ts` — running, stopRequested, visibleMode, etc.

**Risk:** Restart or crash clears state. DB’s `scrapeRunning` is updated on start/stop, but if the process dies mid-run, you can end up with `scrapeRunning: true` in DB and no actual scraper. UI might show “Running” until the next start attempt.

**Mitigation:** On startup, either reset `scrapeRunning` to false or run a “reconcile” that checks if a scraper process is actually active. Optionally expose a “Reset scraper state” in admin for recovery.

---

### 4.2 Login / captcha wait and timeouts

**Where:** `apps/web/lib/scrape-loop.ts` — 5-minute timeout for login wall and captcha solve; relies on admin to click “Solved” in UI.

**Risk:** If the admin forgets to click or the tab is closed, the loop waits 5 minutes then fails. Long-running visible browser can also be closed by mistake; then the loop errors and scraper state can be left inconsistent.

**Mitigation:** Log clearly when waiting for human. Consider a “Cancel wait” button that rejects the wait promise so the loop can move on or retry.

---

### 4.3 Brain and planner depend on LLM

**Where:** `apps/web/lib/brain-agent.ts`, `apps/web/lib/scrape-planner.ts` — decisions and next actions depend on LLM output.

**Risk:** LLM timeout, malformed JSON, or off-prompt output can lead to wrong decisions (e.g. “CAPTCHA” when it’s just slow, or “LOGIN_WALL” when it’s a 404). That can trigger unnecessary human steps or wrong retries.

**Mitigation:** Validate and default: e.g. if Brain returns an unknown action, fall back to “retry” or “skip”. Add timeouts and retries for LLM calls; log raw responses when falling back.

---

## 5. LLM and JSON parsing

### 5.1 Widespread JSON.parse on LLM output

**Where:** Many agents: `job-detail-extractor-agent`, `page-classifier-agent`, `company-research-agent`, `cover-letter-agent`, `resume-parser` section extractors, etc. They do `JSON.parse(response)` (or similar) on LLM output.

**Risk:** Model can return markdown code fences, extra text, or invalid JSON. That throws and can break the whole step (e.g. extraction fails, no job detail, pipeline stops or returns “Unknown”).

**Mitigation:** Prefer a shared helper that strips markdown and applies simple fixups (e.g. `packages/llm`’s `parseWithRetry` / `extractJson`) and returns a safe default or structured error. Where possible, use `completeJson` or a schema so the model is constrained. Catch parse errors, log the raw response, and either retry once or fall back to a safe default instead of failing the whole pipeline.

---

## 6. Tests and fixtures

### 6.1 Live URL test corpus path

**Where:** `tests/application-assistant/url-corpus.ts` — tries `join(__dirname, 'fixtures', FIXTURE_NAME)` then `join(process.cwd(), 'tests', 'application-assistant', 'fixtures', FIXTURE_NAME)`.

**Risk:** If tests are run from a different root (e.g. from `apps/web` or in a bundled test run where `__dirname` is different), the CSV might not be found and `getUrlCases()` returns `[]`. Then live URL tests are effectively skipped and you might not notice.

**Mitigation:** Fail fast when `RUN_LIVE_URL_TESTS=1` and corpus is empty (e.g. throw or skip with a clear warning). Document that live URL tests must be run from repo root (or the path you standardize on).

---

### 6.2 Results log path

**Where:** `tests/application-assistant/live-url-smoke.test.ts` — `writeResultsLog()` writes under `process.cwd() + 'tests/application-assistant/'` (or similar).

**Risk:** Same as 1.1: if cwd is not repo root, files are written in an unexpected directory and might be missed or committed by mistake (they’re gitignored, but still).

**Mitigation:** Resolve path from a known root (e.g. `path.join(process.cwd(), 'tests', 'application-assistant')` and document “run from repo root”) or use an env var for test output dir.

---

## 7. Timeouts and robustness

### 7.1 Fixed timeouts in pipeline

**Where:**

- Application assistant: 30s initial load, 5s networkidle, 15s company about page, 20s resolver candidate.
- Scrape loop: 30s page load, 15s selectors, 5 min login/captcha.

**Risk:** Slow or flaky sites (e.g. heavy SPAs, slow networks) can hit timeouts and be classified as error/expired or cause “page not loaded” extraction. No backoff or per-URL tuning.

**Mitigation:** Consider slightly higher timeouts for “company research” and “resolver” steps, or make them configurable. Optionally retry once on timeout before marking failure.

---

### 7.2 Browser and process lifecycle

**Where:** Application assistant launches a visible browser and runs the full pipeline in one process. Scraper runs a long-lived loop with its own browser(s).

**Risk:** Browser crash or “page closed” can leave the analysis in “running” in DB. User sees a stuck run. No automatic cleanup of stale “in progress” analyses after a timeout.

**Mitigation:** Heartbeat already updates `analysis` row every 30s; you could add a job or startup job that marks analyses as “error” or “abandoned” if `currentStep` is set and `updatedAt` is older than e.g. 10 minutes. Optionally show “Run may have been interrupted” in UI when status is running but last log is old.

---

## 8. Quick reference: high-impact items

| Area              | Risk                                     | Priority   |
| ----------------- | ---------------------------------------- | ---------- |
| Paths / cwd       | Data roots wrong if cwd ≠ apps/web       | High       |
| Admin auth        | Any signed-in user is admin              | Medium     |
| Company research  | Already fixed (ATS); name guess can fail | Done / Low |
| Company name      | URL-derived name can differ from page    | Medium     |
| LLM JSON parse    | One bad response can break a step        | Medium     |
| Scraper state     | In-memory; lost on restart               | Medium     |
| Run folder delete | Theoretically path traversal             | Low        |
| Test paths        | Corpus/results path if cwd wrong         | Low        |

---

**Next steps (suggested):**

1. Standardize data and test paths (single root or env) and document “run from repo root” where relevant.
2. Add admin guard (e.g. `ADMIN_USER_IDS` or DB flag) before adding more users.
3. Centralize LLM JSON parsing with strip/fixup and safe defaults.
4. Persist or reconcile scraper/assistant “running” state across restarts.
5. Optional: stale analysis cleanup and “Cancel wait” for login/captcha.
