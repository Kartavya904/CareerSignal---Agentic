# Final plan — Remaining work before project completion

**Created:** 2026-03-06  
**Context:** Post-commit _"Added Final Touch before final fixes to Outreach agent and Email agent and Application Analysis CSV upload feature."_  
**Purpose:** Single checklist of what is left, in priority order, and how each piece should behave.

---

## Priority order

| Order | Area                                            | When                          |
| ----- | ----------------------------------------------- | ----------------------------- |
| **1** | **Email agent**                                 | First                         |
| **2** | **Application analysis CSV upload**             | Second (after email agent)    |
| **3** | **Outreach agent (targeted contact discovery)** | After email + CSV feature     |
| **4** | **Interview prep**                              | After outreach agent is fixed |

---

## 1. Email agent (priority 1)

**Goal:** Optional agent that sends the user a summary of the analysis (e.g. to their own email) so it’s secure and under their control.

**Constraints:**

- **Free:** No paid email APIs. Use the user’s own email to send to themselves.
- **Secure:** Emails go to the user (e.g. to self); no third-party delivery.
- **DB:** Storing runs in the DB is so that when the **CSV-based automated application analysis** runs, we know **which user** is running it → it shows up in **history** as “automatically ran.”
- **UX:** While any application analysis is running (single URL or CSV batch), the user should see that **application analysis is in progress**.

**Deliverable for planning:** In this repo, document **all options** for how we could implement the email agent (e.g. SMTP with user’s credentials, local sendmail, app-specific “send to self” flow, etc.). Keep the plan **option-rich** so we can choose one before implementation. No need to implement until after options are agreed.

**References:**

- Preferences already have email-related settings (e.g. `packages/db/drizzle/0018_user_preferences_email_min_match.sql`, `apps/web/app/preferences/page.tsx`).
- Application assistant runner: `Email Agent not implemented yet, skipping` in `apps/web/lib/application-assistant-runner.ts`.

---

## 2. Application analysis CSV upload (priority 2)

**Goal:** Let users upload a CSV of job URLs; system runs application analysis for those URLs in the background, per user, with admin control.

### 2.1 CSV format and storage

- **CSV:** One column only — **URLs to job postings** (one URL per row; optional header row).
- **New table:** e.g. `csv_uploaded_urls` (or equivalent name) with at least:
  - `url` (text) — job posting URL
  - `user_id` (uuid) — who uploaded it
  - Optional: `created_at`, `status`, `order` for processing order.
- **Purpose of storing user_id:** When the background process runs, we know which user’s “automated application analysis” is running → show in **history** as automatically ran for that user.

### 2.2 Background processing

- Process URLs **in order** (per user).
- Run **continuously in the background** (e.g. queue or cron-style worker) so analysis keeps progressing for each user’s list.

### 2.3 Admin UI

- **New admin tab:** In addition to **“Deep company research”** and **“Contact / Outreach agent”**, add a third tab.
- **Tab purpose:** “Application analysis (per user)” or similar — resume/pause **per user**.
- **Content:** List **every user** (or every user with at least one CSV-uploaded URL). For each user, a **play / pause** (or start / stop) control to:
  - **Play:** Start (or resume) running application analysis for that user’s CSV URLs in order.
  - **Pause:** Stop processing that user’s queue until resumed.

**References:**

- Admin tabs: `apps/web/app/admin/page.tsx` (Deep company research, Contact / Outreach agent).
- Existing CSV import in admin is for **company names** (Deep company research), not job URLs — this is a separate flow for **job URLs** and application analysis.

---

## 3. Outreach agent — targeted contact discovery (priority 3)

**When:** After **Email agent** and **Application analysis CSV upload** are done.

**Current issue:** The outreach agent is too broad: it picks up many HRs and returns LinkedIn URLs without being tied to the **specific job**. Need a more **targeted** flow that starts from the job posting and uses the existing “contact priority” ranking.

### 3.1 Flow (target order)

1. **Start from the job posting URL**
   - Use the **job posting page** as the primary source.
   - Chunk / parse the job page (reuse existing chunking system).
   - **First:** Look for a **contact already on the page** (email, name, “apply to X”, recruiter mention, etc.). If found → use it and skip or reduce later discovery.

2. **URLs on the job posting**
   - If no direct contact on the page, look for **any URL** in the job content that could be a contact (e.g. “Apply here”, “Contact X”, team page, “Meet the team”, LinkedIn link). Try those URLs before going to generic search.

3. **Targeted people search (current DDG + LinkedIn, but targeted)**
   - Only if 1–2 didn’t yield a good contact: run the existing **people search** (e.g. DDG + up to 30 pages, then LinkedIn).
   - **Critical change:** The **search queries** (e.g. the “seven queries”) must be **targeted**, not generic:
     - **First:** Queries that target the **exact job title** and company (e.g. “[Company] [Exact Job Title] LinkedIn” or “hiring manager [Job Title] [Company]”).
     - **Then:** Queries for people who could be **hiring for that role** (e.g. HR/recruiters at that company for that role).
   - **Outcome:** “Found X candidates” should reflect **targeted** results (e.g. “Found 2 candidates for Senior Engineer at Acme”), not random HR URLs.

### 3.2 Contact priority (from project scope)

When ranking and choosing contacts, respect this order (see `miscellaneous/project_scope.md`):

| Priority | Contact type                            | Why                                       |
| -------- | --------------------------------------- | ----------------------------------------- |
| 1        | **Hiring Manager**                      | Direct decision-maker for the role        |
| 2        | **Engineering Manager**                 | Close to hiring decisions                 |
| 3        | **Team Lead / Senior Engineer on team** | Peer-level influence                      |
| 4        | **Technical Recruiter**                 | Directly responsible for filling the role |
| 5        | **University/Campus Recruiter**         | Entry-level / new-grad                    |
| 6        | **Founder**                             | Small companies, startups                 |
| 7        | **Fallback: any reachable person**      | Last resort                               |

Contacts must **align with the position** (e.g. no marketing manager for a SWE role).

### 3.3 Implementation notes

- **Strategy / searchQueries:** Ensure `determineContactStrategy` (or equivalent) produces **targeted** queries: job title + company first, then role-relevant HR/recruiter/hiring manager searches, not generic “HR at company” only.
- **Job posting first:** Ensure the pipeline **always** parses and chunks the job posting URL first; only then run DDG/LinkedIn discovery if no contact is found on the page or via URLs extracted from it.
- **Logging / UI:** Prefer messages like “Found N candidates for [Job Title] at [Company]” and surface that the run was **targeted** for the role.

**References:**

- `apps/web/lib/outreach-research-runner.ts` — flow, strategy, DDG people search, `strategy.searchQueries`, `MAX_PAGES_TO_VISIT`.
- `miscellaneous/project_scope.md` — Contact Priority Ranking, Contact Discovery Flow (check job description first, then strategy, then people search).

---

## 4. Interview prep (priority 4)

**When:** After the **outreach agent** targeted-discovery work is done.

**Scope:** Revisit the interview prep feature (e.g. STAR-format talking points, prep packets). No detailed spec here; treat as “next up” after outreach is fixed.

**References:**

- `apps/web/app/application-assistant/page.tsx` — “Interview Prep” in UI.
- `apps/web/lib/application-assistant-runner.ts` — interview prep step (e.g. “temporarily skipped”).
- `agents/src/match/interview-prep-agent.ts`.

---

## 5. Nothing else required for “final plan”

Per your scope, the only remaining work before considering the project “finished” is:

1. Email agent (with options doc).
2. Application analysis CSV upload + table + admin tab (per-user play/pause).
3. Outreach agent targeted flow (job-first, then targeted queries + priority ranking).
4. Interview prep (after outreach).

If you remember another area later, add it to this file or to the relevant section above.

---

## Quick reference

| Item                         | Location / note                                                            |
| ---------------------------- | -------------------------------------------------------------------------- |
| Admin tabs                   | `apps/web/app/admin/page.tsx`                                              |
| Outreach pipeline            | `apps/web/lib/outreach-research-runner.ts`                                 |
| Contact priority ranking     | `miscellaneous/project_scope.md` § Contact Priority Ranking                |
| Email preferences            | `packages/db` (email min match, etc.), `apps/web/app/preferences/page.tsx` |
| Application assistant runner | `apps/web/lib/application-assistant-runner.ts`                             |
