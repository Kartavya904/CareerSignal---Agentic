# CareerSignal (Agentic) — Project Scope Completion

**Purpose:** Tracks implementation status against `project_scope.md`. For each scoped item: completion status, how it was implemented, file/component references, and any differences from the original scope.

**Last updated:** Reflecting current codebase state.

## Scope Rebaseline Note (2026-02-26)

The project scope has been rebaselined to a strict single-URL Application Assistant roadmap.

- Continuous source-cache planning is deprecated and superseded.
- This completion report reflects implementation status prior to the rebaseline and should be interpreted as historical baseline for the rebuild phases.
- Forward progress should be tracked against:
  - `miscellaneous/plan.md`
  - `miscellaneous/project_scope.md`
  - `.cursor/plans/application-assistant-v1-rebuild_daadf184.plan.md`

---

## Version Overview (Implementation Status)

| Version | Scope Theme                      | Implementation Status | Notes                                                                                                                                                                                           |
| ------- | -------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V1**  | MVP — scan, rank, contact, draft | **Partial**           | Profile, preferences, sources, runs (scan trigger) and UI are implemented. Browser extraction, normalization, scoring, contact discovery, outreach, blueprint, tracker are not yet implemented. |
| **V2**  | Seriously agentic                | **Not started**       | —                                                                                                                                                                                               |
| **V3**  | Research-grade + startup-grade   | **Not started**       | —                                                                                                                                                                                               |

---

## Tech Stack (As Implemented)

| Layer         | Scope Choice                     | Implemented        | Notes                                                              |
| ------------- | -------------------------------- | ------------------ | ------------------------------------------------------------------ |
| Web App       | Next.js (TypeScript, App Router) | **Yes**            | `apps/web/` — App Router, server and client components.            |
| Database      | PostgreSQL (local)               | **Yes**            | Drizzle ORM, `packages/db/`, migrations in `packages/db/drizzle/`. |
| LLM Runtime   | Ollama (local)                   | **Yes**            | Used via `packages/llm` (Ollama); agents in `agents/`.             |
| Auth          | Custom, session-based            | **Yes**            | Sign-in/sign-up, session-based auth; single-user focus.            |
| Vector Store  | pgvector                         | **Not in use yet** | No embeddings/vector flow implemented for V1 profile/sources/runs. |
| Orchestration | DB-backed job queue (V1)         | **Partial**        | Runs are stored and polled; no Temporal.                           |
| Object Store  | Local filesystem                 | **Yes**            | User resume and artifacts under user data dir.                     |

---

## Agent Design Philosophy: Hybrid Agents (Code-First, LLM-Assisted)

### Status: **Adhered to where agents exist**

- Implemented agents (Resume Parser, Profile Insights, Bullet Analysis, Skill Analyzer) follow the scope: deterministic logic first, LLM only where needed (e.g. structured extraction, rating, seniority inference). Typed interfaces and Zod validation used. No change from scope.

---

## Target Role Profile (Scoring Calibration Baseline)

### Status: **Not applicable yet**

- Scope defines a baseline profile for calibrating match scoring. Scoring pipeline (Rule Scorer, LLM Ranker) is not implemented, so this baseline is not yet used.

---

## 1.1 Profile Builder + Resume Parsing

### Status: **Completed** (with intentional differences)

### Decisions Locked (As in Scope)

| Decision                  | Scope                      | Implemented                                                 |
| ------------------------- | -------------------------- | ----------------------------------------------------------- |
| Resume formats            | PDF + DOCX only            | **Yes** — upload accepts PDF, DOCX, DOC, TXT.               |
| Language support          | English only               | **Yes** — no i18n.                                          |
| Auto-populate preferences | Yes, button in UI          | **Yes** — "Auto-populate from profile" on Preferences page. |
| Profile schema storage    | Postgres, canonical fields | **Yes** — `packages/db` profile tables and CRUD.            |

### Implementation Details

- **Resume Parser Agent**
  - **Location:** `agents/src/profile/` (resume parsing flow); streaming parse via API.
  - **Behavior:** User uploads PDF/DOCX; file is stored and raw text is extracted and saved to profile (`resume_raw_text`). Parsing is **not** automatic on upload: user must click **Parse** to start the parser agent. Parser runs as a background job: `POST /api/profile/parse-resume/start` starts the job; client polls `GET /api/profile/parse-resume/progress?after=<id>` for streaming logs and completion.
  - **Extraction:** Name, email, phone, location, skills, experience (with bullets), education, etc., aligned with scope. Output is written to DB and returned via parsed-data API; profile form and sections are filled from this.
  - **Difference:** Parsing is **on-demand (Parse button)** rather than triggered automatically on upload. This keeps the parser agent from loading until the user explicitly requests a parse.

- **Profile UI**
  - **Location:** `apps/web/app/profile/page.tsx`.
  - **Behavior:** Single profile page with form (name, email, phone, location, work authorization, LinkedIn/GitHub/portfolio URLs). Editable experience, education, skills, languages, projects (with bullets). Resume block shows: resume parsed/uploaded + last parsed date on one line; filename + last uploaded on second line. Validation: name, location, work authorization required as in scope.
  - **Additional:** AI Insights card (keyword depth, strength score, overall score 0–100, seniority, resume rating) from `GET /api/profile/insights` (with optional `?refresh=1`). Bullet analysis (scores per bullet) and Skill Analyzer (suggested skills) are triggered after a successful parse and can be re-run from the UI.

- **Auto-populate preferences**
  - **Location:** Preferences page button + `GET /api/preferences/autofill-from-profile` (and autofill-roles). Fills target roles, skills, locations, seniority suggestions from profile. **Implemented as in scope.**

- **User metadata and profile “last updated”**
  - **Location:** `packages/db` `user_metadata` (e.g. `resumeUploadedAt`, `resumeParsedAt`, `insightsGeneratedAt`, `profileUpdatedAt`); `apps/web/app/api/profile/metadata`.
  - **Behavior:** Profile page shows last uploaded, last parsed, and insights last updated. If profile last updated is **newer** than insights (e.g. parse or upload after last insights run), the app calls `GET /api/profile/insights?refresh=1` so AI Insights are recomputed.

- **Seniority and experience (AI Insights)**
  - **Location:** `agents/src/profile/profile-insights-agent.ts`.
  - **Behavior:** Total experience is computed from **work experience only** (month-aware). Seniority rules: **&lt; 24 months → Entry** (never Mid); 24–&lt;36 months → Junior; 36–&lt;96 months → Mid; 8+ years or Senior/Staff title → Senior; 15+ or Director/VP/Principal → Senior+. The LLM receives the computed total months/years and these rules and returns seniority (Entry | Junior | Mid | Senior | Senior+); code enforces &lt; 24 months = Entry regardless of LLM. Experience displayed in UI as “X year(s)” / “X year(s) Y months” style.

- **Schema (canonical profile)**
  - Stored in Postgres via Drizzle; profile and related tables match the spirit of the scope schema (name, location, work_authorization, experience, education, skills, resume_raw_text, etc.). `user_profile_insights` stores insight outputs (e.g. total years, seniority, 0–100 scores).

### Out of Scope (V1) — Unchanged

- Multi-language resume parsing, LinkedIn profile import, skills ontology, graph-based profile: not implemented.

---

## 1.2 Sources Registry

### Status: **Completed** (with intentional differences)

### Decisions Locked (As in Scope)

| Decision               | Scope                                  | Implemented                                                                                          |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sources per user       | Unlimited                              | **Yes** — no hard limit.                                                                             |
| Blessed default boards | Yes, at least 10                       | **Yes** — 10 in `packages/db/src/seed.ts` as `BLESSED_SOURCES`.                                      |
| Crawl timing           | On add — browser crawls when user adds | **No** — no browser crawl on add; sources are metadata only. Jobs-from-sources flow not implemented. |
| User control           | Add/remove/disable any source          | **Yes** — add (custom or from defaults), delete (X), enable/disable toggle per source.               |

### Implementation Details

- **Blessed default sources**
  - **Location:** `packages/db/src/seed.ts` — `BLESSED_SOURCES` (LinkedIn Jobs, Indeed, Wellfound, Glassdoor, Dice, ZipRecruiter, SimplyHired, Built In, Levels.fyi Jobs, Hacker News Who's Hiring). Exported for use by API.
  - **Difference:** Default sources are **not** auto-seeded on signup or first run. They exist only as a static list. A source is **stored in the DB only when the user adds it** from the “Add default sources” card. So “blessed” = available to add, not pre-inserted.

- **Add source**
  - **Location:** `apps/web/app/sources/page.tsx`, `POST /api/sources`, `packages/db` `addSource`.
  - **Behavior:** User can add a **custom source** (name + URL) or add from **Add default sources**: a second card lists each default as a small box (name + “0 jobs” in green). Clicking a box POSTs that source (name, url, type, `is_blessed: true`) to the API; once added, the box shows “Added” and is disabled. Boxes are flex-wrapped, centered (`justifyContent: 'center'`), so a single box on a line (e.g. Hacker News) is centered.

- **Enable/disable per source**
  - **Location:** Each source card has a toggle; `PATCH /api/sources/[id]` with `{ enabled: true \| false }`; `packages/db` `setSourceEnabled`. `getEnabledSourceIds` returns only sources where `enabled === true` (used for runs/dashboard).
  - **Behavior:** Toggle is on the same line as the source URL; when off, the card shows “Inactive” (muted); when on, “Active” (yellow). State persisted in DB.

- **Delete source**
  - **Location:** X button (top-right of each card, circular, red on hover); `DELETE /api/sources/[id]`; `packages/db` `deleteSource`. Button positioned with `top: 0; right: 0; transform: translate(50%, -50%)` so its center is at the card’s top-right corner without shifting the Active/Inactive badge.

- **Source schema**
  - **Location:** `packages/db` schema (sources table): id, user_id, name, url, type, enabled, is_blessed, status, etc. Aligned with scope.

- **Dashboard**
  - **Location:** `apps/web/app/dashboard/page.tsx`.
  - **Behavior:** Sources card shows “X/Y enabled” (e.g. “1/2 enabled”) and description “X out of Y enabled”, using `listSources` and counting `enabled` vs total.

### Out of Scope (V1) — Unchanged

- URL auto-correction, self-healing, source reliability scoring: not implemented.
- No browser agent crawl on add; jobs extraction is future work.

---

## 1.2 Blessed Default Sources (10) — As Implemented

- **Location:** `packages/db/src/seed.ts` — `BLESSED_SOURCES` array (10 entries: LinkedIn Jobs, Indeed, Wellfound, Glassdoor, Dice, ZipRecruiter, SimplyHired, Built In, Levels.fyi Jobs, Hacker News Who's Hiring).
- **Exposure:** `GET /api/sources/defaults` returns this list for the “Add default sources” UI. Not seeded into DB on signup; user adds by choice. **Difference:** Scope implied “blessed boards” available; implementation keeps them as a static list and only creates DB rows when user adds a source.

---

## 1.3 Browser-Based Job Extraction (Headless)

### Status: **Not implemented**

- No Playwright/browser integration for job extraction.
- No DOM Extractor, Pagination, or artifact storage for runs yet.
- Runs (scans) exist as workflow runs in DB and UI but do not yet drive browser extraction.

---

## 1.4 Normalization to Unified Job Schema

### Status: **Not implemented**

- Job schema and normalization pipeline (Job Normalizer, Entity Resolution, canonical Job in DB) are not implemented.
- No jobs table or match_score/strict_filter_pass in DB for V1 current state.

---

## 1.5 AI Match Scoring + Strict Preference Filter

### Status: **Not implemented**

- Rule Scorer and LLM Ranker for jobs are not implemented.
- Preferences include strict filter level (STRICT / SEMI_STRICT / OFF) and are stored; they are not yet used in a scoring pipeline.

---

## 1.6 Top-K Ranking per Source/Company

### Status: **Not implemented**

- No top-15 curation or lazy surfacing; no job list to rank.

---

## 1.7 Job Detail UI (Match Explanation + Cover Letter)

### Status: **Not implemented**

- No job detail view or cover letter generation in current build.

---

## 1.8 Contact Discovery from Public Web

### Status: **Not implemented**

- Contact Strategy, People Search, Contact Verifier agents and contact schema not implemented.

---

## 1.9 Outreach Drafting

### Status: **Not implemented**

- Outreach Writer, Personalization, platform-aware limits and drafts not implemented.

---

## 1.10 Application Flow Blueprinting

### Status: **Not implemented**

- Application Blueprint Agent and per-job blueprint UI not implemented.

---

## 1.11 Tracker: Pipeline Stages

### Status: **Not implemented**

- PipelineEntry, PipelineStage, Kanban/list view not implemented.

---

## Preferences (Standalone)

### Status: **Completed**

- **Location:** `apps/web/app/preferences/page.tsx`, `GET/PUT /api/preferences`, `packages/db` preferences CRUD.
- **Behavior:** Full preferences form: work authorization, target locations (country/state/city), remote preference, **target seniority** (block-style clickable options, multi-select), **employment types** (block-style; options include **Internship** before Full-time, then Part-time, Contract, Freelance, Unknown), target roles, skills, industries, salary min/max/currency, strict filter level, max contacts per job, outreach tone. Save persists to DB.
- **Auto-populate:** “Auto-populate from profile” and autofill roles endpoints used as in scope.
- **Difference:** Employment types and target seniority use **block-style buttons** (click to toggle selected) instead of checkboxes; Internship added as first employment type option.

---

## Runs / Results (Scan Trigger + History)

### Status: **Implemented** (trigger + UI only; no extraction yet)

- **Location:** `apps/web/app/runs/page.tsx` (labelled “Results”), `GET/POST /api/runs`, `packages/db` runs list/create.
- **Behavior:** Page title and copy use “Results” and “Scan history”. User can start a scan (POST) and see run history (status, created/started/finished, plan snapshot steps when running). No browser extraction or job pipeline wired yet; runs are placeholders for the future scan workflow.
- **Difference:** User-facing naming is “Results” and “Scan history” instead of “Runs” / “Run history”; nav link is “Results” (href still `/runs`).

---

## Dashboard

### Status: **Completed**

- **Location:** `apps/web/app/dashboard/page.tsx`.
- **Behavior:** Four cards in **2×2 layout**: Profile, Preferences, Sources, Results. Each card: title, short description, status badge, thin progress bar (full when “done”). “Account progress” line: “X of 4 complete”. Sources card: “X/Y enabled” and “X out of Y enabled” (green when any enabled). Links to profile, preferences, sources, runs. Quick start section removed.
- **Difference:** Only two columns for the four cards; no Quick start; Sources shows enabled vs total as requested.

---

## UI / Layout / Global Behavior

### Status: **Completed**

- **Navbar**
  - **Location:** `apps/web/app/layout.tsx`.
  - **Behavior:** Sticky, `top: 0`, `zIndex: 99999`, solid background `#222529`. Nav links: Dashboard, Sources, Results (no Profile/Preferences in main nav). User menu: clicking or hovering the user name opens a dropdown with Profile, Preferences, Sign out; full-height hover strip so dropdown doesn’t disappear when moving to it.
- **Toasts**
  - **Location:** `apps/web/app/components/ToastContext.tsx`.
  - **Behavior:** Toasts rendered at `top: 4rem` so they appear below the navbar.
- **Parsing terminal**
  - **Location:** `apps/web/app/components/ParsingTerminal.tsx`.
  - **Behavior:** Shown when user clicks Parse. Uses `onJobStarted` so parent sets `shouldStartJob` to false after first start (avoids duplicate POST on remount). Polling uses a “visibility wake” sleep so when the user returns to the tab, the next poll runs immediately and progress updates again.

---

## Workflow 1: "Scan & Rank"

### Status: **Not implemented**

- Scope: Profile → Sources → Scan → Extract → Normalize → Score → Top 15. Only Profile, Sources, and “start scan” (run creation) exist; extraction, normalization, scoring, and top-K are not built.

---

## Workflow 2: "Contact Hunt" (Per Job or Batch)

### Status: **Not implemented**

- Contact discovery agents and flow not implemented.

---

## Workflow 3: "Draft Outreach" (Per Job+Contact)

### Status: **Not implemented**

- Outreach Writer and draft generation not implemented.

---

## Workflow 4: "Application Blueprint" (Per Job)

### Status: **Not implemented**

- Application Blueprint Agent and per-job blueprint UI not implemented.

---

## V2 Sections (2.1–2.5)

### Status: **Not started**

- 2.1 Parallel Exploration Swarm, 2.2 ATS Library, 2.3 Self-Healing Source Discovery, 2.4 Multi-Step Contact Enrichment, 2.5 Weekly Digests + Reminders — none implemented.

---

## V3 Sections (3.1–3.6)

### Status: **Not started**

- 3.1 Multi-User Tenancy, 3.2 Graph Memory, 3.3 Outcome-Driven Optimization, 3.4 Offer Simulation + Negotiation, 3.5 Multi-Modal Parsing, 3.6 Agent Marketplace — none implemented.

---

## Human-in-the-Loop

### Status: **Aligned where applicable**

- No auto-send of outreach; no application submit without user action. Approval gates and safety valves (rate limits, run budgets) are scope for when contact/outreach exist — not yet applicable.

---

## Evidence & Reproducibility

### Status: **Partial**

- Parse and insights runs produce logs/state; no full artifact hashing, audit trail, or `artifacts/` directory for job/contact evidence yet. Resume and profile data stored in DB with timestamps.

---

## Policies & Boundaries

### Status: **Not applicable yet**

- No crawler or contact discovery in use; CAPTCHA/ToS and rate limits will apply when browser and contact flows are built.

---

## V1 Agents (From Scope) — Implementation Status

| Agent                                       | Scope Priority | Status       | Notes                                                       |
| ------------------------------------------- | -------------- | ------------ | ----------------------------------------------------------- |
| Resume Parser Agent                         | Critical       | **Done**     | Streaming parse, on-demand via Parse button; fills profile. |
| Preference Builder Agent                    | Critical       | **Done**     | Autofill-from-profile and preferences CRUD.                 |
| Source Validator Agent                      | Critical       | **Not done** | No URL validation or crawl on add.                          |
| Browser Navigator / DOM / Pagination        | Critical       | **Not done** | —                                                           |
| Job Normalizer / Entity Resolution          | Critical       | **Not done** | —                                                           |
| Rule Scorer / LLM Ranker / Top-K Curator    | Critical       | **Not done** | —                                                           |
| Contact Strategy / People Search / Verifier | Critical       | **Not done** | —                                                           |
| Outreach Writer / Personalization           | Critical       | **Not done** | —                                                           |
| Application Blueprint Agent                 | Important      | **Not done** | —                                                           |
| Policy/Constraint Agent                     | Important      | **Not done** | —                                                           |
| Planner Agent                               | Critical       | **Partial**  | Run creation and status exist; no full scan DAG.            |

**Profile-related agents:** Profile Insights agent (experience computation, seniority rules, 0–100 scores, LLM rating) is implemented and used by the AI Insights feature. Bullet analysis and Skill Analyzer are implemented and run after parse.

---

## Directory Structure (As Implemented vs Scope)

Scope structure is partially present; agent subdirs exist only where implemented.

| Scope Path                                | Implemented      | Notes                                                                                              |
| ----------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web/`                               | **Yes**          | Next.js UI: profile, preferences, sources, runs, dashboard, auth, layout, toasts, ParsingTerminal. |
| `agents/planner/`                         | **Partial**      | Run creation/status only; no full scan DAG.                                                        |
| `agents/profile/`                         | **Yes**          | Resume parsing flow, profile-insights-agent, bullet analysis, skill analyzer.                      |
| `agents/browser/`                         | **No**           | —                                                                                                  |
| `agents/normalize/`                       | **No**           | —                                                                                                  |
| `agents/rank/`                            | **No**           | —                                                                                                  |
| `agents/contacts/`                        | **No**           | —                                                                                                  |
| `agents/outreach/`                        | **No**           | —                                                                                                  |
| `agents/apply/`                           | **No**           | —                                                                                                  |
| `agents/shared/`                          | **Yes**          | Shared utils, Ollama usage.                                                                        |
| `packages/schemas/`                       | **Yes**          | Zod schemas for API/validation.                                                                    |
| `packages/db/`                            | **Yes**          | Postgres, migrations, profile, preferences, sources, runs, user_metadata, profile_insights.        |
| `packages/vector/`                        | **No**           | Not used yet.                                                                                      |
| `packages/llm/`                           | **Yes**          | Ollama model usage.                                                                                |
| `packages/tools/`                         | **Partial**      | Parsers/fetchers as used; no browser tools.                                                        |
| `packages/core/`                          | **Partial**      | Domain logic where used.                                                                           |
| `evals/`, `artifacts/`, `docs/`, `infra/` | **Partial / No** | Per scope; not fully populated for V1.                                                             |
| `miscellaneous/`                          | **Yes**          | plan.md, project_scope.md, project_scope_completion.md.                                            |

---

## Summary Table (Scope vs Completion)

| Area                                     | Scope                                           | Completed     | Difference / notes                                                                                                |
| ---------------------------------------- | ----------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Profile + resume parsing                 | Full form, parse from PDF/DOCX, auto-fill prefs | Yes           | Parse on button click only; no auto-parse on upload. AI Insights + bullet scores + skill suggestions added.       |
| Preferences                              | Full form, auto-populate                        | Yes           | Block-style employment types and seniority; Internship added.                                                     |
| Sources                                  | Add/remove/disable, blessed list, crawl on add  | Partially     | No crawl on add. Defaults are add-by-choice; enable/disable toggle; delete per source; “0 jobs” on default boxes. |
| Runs/Results                             | Scan trigger, history                           | UI + API only | No extraction/scoring; runs are placeholders.                                                                     |
| Dashboard                                | Overview, next steps                            | Yes           | 2×2 cards, progress “X of 4”, Sources as “X/Y enabled”.                                                           |
| Browser extraction                       | Navigator, DOM, pagination                      | No            | —                                                                                                                 |
| Normalization + scoring                  | Job schema, rule + LLM score, top-K             | No            | —                                                                                                                 |
| Contact + outreach + blueprint + tracker | Full flow                                       | No            | —                                                                                                                 |

---

## Data Model Summary (Implemented vs Scope)

| Entity                        | Scope | Implemented | Notes                                                                    |
| ----------------------------- | ----- | ----------- | ------------------------------------------------------------------------ |
| User                          | V1    | **Yes**     | id, name, email, etc.                                                    |
| Profile                       | V1    | **Yes**     | user_id, skills, experience, work_authorization, resume_raw_text, etc.   |
| PreferenceSet                 | V1    | **Yes**     | user_id, strict_mode, locations, seniority, employment types, etc.       |
| Source                        | V1    | **Yes**     | id, user_id, name, url, type, enabled, is_blessed, status.               |
| user_metadata                 | —     | **Yes**     | resumeUploadedAt, resumeParsedAt, insightsGeneratedAt, profileUpdatedAt. |
| user_profile_insights         | —     | **Yes**     | keyword depth/strength/overall (0–100), seniority, etc.                  |
| Job                           | V1    | **No**      | —                                                                        |
| Contact                       | V1    | **No**      | —                                                                        |
| OutreachDraft                 | V1    | **No**      | —                                                                        |
| ApplicationBlueprint          | V1    | **No**      | —                                                                        |
| PipelineEntry / PipelineStage | V1    | **No**      | —                                                                        |
| WorkflowRun                   | V1    | **Yes**     | Runs (scan) stored; no extraction artifacts.                             |
| Artifact                      | V1    | **No**      | —                                                                        |

---

## Success Metrics

| Metric                     | Scope Target                    | Current State           |
| -------------------------- | ------------------------------- | ----------------------- |
| Jobs extracted per scan    | All available from source pages | N/A — no extraction.    |
| Top 15 relevance           | >80% match preferences          | N/A — no ranking.       |
| Strict filter accuracy     | 100% shown pass mandatory prefs | N/A — no job list.      |
| Score precision            | XX.XX format                    | N/A.                    |
| Contacts found per top job | ≥1 for 70%+ of top jobs         | N/A.                    |
| Draft quality              | >50% accepted with minor edits  | N/A.                    |
| Scan time (single source)  | < 5 min                         | N/A — no scan pipeline. |

Profile/preferences/sources completion and “X of 4 complete” on dashboard are implemented; success metrics above depend on the full scan → rank → contact → draft pipeline.

---

## Appendix: Agent Taxonomy vs Implementation

Of the **19 V1 agents** in scope:

- **Implemented:** Resume Parser Agent, Preference Builder Agent (via preferences CRUD + autofill), Profile Insights (and bullet/skill analysis — not in taxonomy but profile-related).
- **Partial:** Planner Agent (run create/status only).
- **Not implemented:** Policy/Constraint, Source Validator, Browser Navigator, DOM Extractor, Pagination, Job Normalizer, Entity Resolution, Rule Scorer, LLM Ranker, Top-K Curator, Contact Strategy, People Search, Contact Verifier, Outreach Writer, Personalization, Application Blueprint.

This document will be updated as more of the scope is implemented.
