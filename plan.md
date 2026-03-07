# Final plan — Remaining work before project completion

**Created:** 2026-03-06  
**Context:** Post-commit _"Added Final Touch before final fixes to Outreach agent and Email agent and Application Analysis CSV upload feature."_  
**Purpose:** Single checklist of what is left, in priority order, and how each piece should behave.

---

## Priority order

| Order | Area                                            | Status / When                   |
| ----- | ----------------------------------------------- | ------------------------------- |
| **1** | **Email agent**                                 | ✅ **Completed** (phase 1 done) |
| **2** | **Application analysis CSV upload**             | **Next** — phase 2 (plan below) |
| **3** | **Outreach agent (targeted contact discovery)** | After CSV feature               |
| **4** | **Interview prep**                              | After outreach agent is fixed   |

---

## 1. Email agent (priority 1) — ✅ Completed

**Status:** Implemented. Summary emails send after each analysis (when enabled); PDF saved to run folder and attached; HTML body with apply link, score line, best-contact draft; single shared SMTP (e.g. Yahoo/Outlook) in env.

**Goal:** Optional agent that sends the user a summary of the analysis (e.g. to their own email) so it's secure and under their control.

**Constraints:**

- **Free:** No paid email APIs. Use the user's own email to send to themselves.
- **Secure:** Emails go to the user (e.g. to self); no third-party delivery.
- **DB:** Storing runs in the DB is so that when the **CSV-based automated application analysis** runs, we know **which user** is running it → it shows up in **history** as “automatically ran.”
- **UX:** While any application analysis is running (single URL or CSV batch), the user should see that **application analysis is in progress**.

**Deliverable for planning:** In this repo, document **all options** for how we could implement the email agent (e.g. SMTP with user's credentials, local sendmail, app-specific “send to self” flow, etc.). Keep the plan **option-rich** so we can choose one before implementation. No need to implement until after options are agreed.

**References:**

- Preferences already have email-related settings (e.g. `packages/db/drizzle/0018_user_preferences_email_min_match.sql`, `apps/web/app/preferences/page.tsx`).
- Application assistant runner: `Email Agent not implemented yet, skipping` in `apps/web/lib/application-assistant-runner.ts`.

### 1.1 Core plan — Email agent (chosen approach)

**Chosen approach:** Single shared Outlook in `.env.local` (SMTP connection) as **sender**; the user who initiated the analysis is the **recipient** (their account email). Server-side only; no paid email APIs.

**Sender & recipient:**

- **Sender:** Your Outlook. Store connection in `.env.local` (e.g. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` or a single connection string). No per-user SMTP; one shared Outlook for all “summary email” sends.
- **Recipient:** The user who started the analysis — use `users.email` for that `userId` (from `getUserById(db, userId)`).

**When to send:**

- After application analysis completes.
- Only if `emailUpdatesEnabled` is true for that user.
- Respect `emailMinMatchScore`: only send if the run's match score ≥ that threshold (if set).

**Subject line:**

- Format: **`Apply for [cleaned title] at [company name] - CareerSignal`**
- Clean the job title so the subject stays reasonable length (e.g. truncate or abbreviate if very long).

**Email body structure (in order):**

1. **Job summary (first paragraph)**  
   “Our analysis for [Job Title] at [Company] ([location]).” Plus a very short line about the job (description or role type). Establishes this is a ranked position.

2. **Score and strong match**  
   One short line: score (e.g. X/100), grade, and why it's a strong match.

3. **What matches**  
   One short paragraph on what matches (from match evidence / strengths).

4. **What to improve**  
   One short paragraph on what to improve (from match evidence / gaps).

5. **Cover letter attachment**  
   One short paragraph: “Download the attached cover letter (PDF) to apply to this job.” The email must include the **cover letter as a PDF attachment** (generate with same logic as `apps/web/app/api/application-assistant/cover-letter-download/route.ts`, e.g. shared helper or pdf-lib in the email utility).

6. **Best people to reach out to**  
   “Best people to reach out to are:” then the ranked contacts with **links** to each (e.g. LinkedIn or email link). Use the outreach/contacts data already produced by the pipeline.

**Attachment:**

- One PDF: the generated cover letter for this analysis. Reuse the PDF generation used in the cover-letter-download API (pdf-lib + draft text from `analysis.coverLetters`) so the same content is attached; can be a shared helper that returns a buffer.

**Env (`.env.local`):**

- e.g. `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_USER=your-outlook@outlook.com`, `SMTP_PASS=app-password`. Or a single `SMTP_CONNECTION_STRING` if you prefer. No paid APIs.

**Outlook SMTP (reference):**

- Host: `smtp.office365.com`, port 587, STARTTLS. Auth: Outlook address + app password (not normal password). Nodemailer: `createTransport({ host, port, secure: false, auth: { user, pass } })`.

---

### 1.2 Email agent — Implementation plan

| #   | Task                     | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Env and config**       | Add to `.env.local` (and `.env.example` with placeholders): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. Document that `SMTP_PASS` is an Outlook app password.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | **Shared PDF helper**    | Extract cover-letter PDF generation (get draft text + pdf-lib layout) from `apps/web/app/api/application-assistant/cover-letter-download/route.ts` into a shared helper (e.g. `apps/web/lib/cover-letter-pdf.ts`) that accepts `coverLetters: Record<string, string> \| null` and returns `Promise<Buffer>`. Use it in the download route and in the email utility.                                                                                                                                                                                                                                                                                                                                                  |
| 3   | **Email utility module** | Add `apps/web/lib/email-agent.ts` (or `send-analysis-summary-email.ts`). It should: (a) take `db`, `userId`, `analysisId`, and the analysis payload (job title, company, location, match score/grade/rationale/strengths/gaps, cover letters, contacts, app base URL); (b) load user email via `getUserById(db, userId)`; (c) load preferences and check `emailUpdatesEnabled` and `emailMinMatchScore` (skip if disabled or below threshold); (d) build subject (cleaned title + company + “- CareerSignal”); (e) build body (paragraphs as in § 1.1); (f) generate cover letter PDF buffer via the shared helper; (g) send with Nodemailer (from env), to user email, with attachment; (h) return success/failure. |
| 4   | **Runner integration**   | In `apps/web/lib/application-assistant-runner.ts`, at the “Email Agent not implemented yet, skipping” block: if `emailUpdatesEnabled`, then call the email utility with the current run's `userId`, `analysisId`, `jobDetail`, `matchResult`, `resumeSuggestions`, `coverLetters`, `contactsEvidence`/contacts, and base URL for the analysis link. Pass `matchScore` for `emailMinMatchScore` check inside the utility. Log “Summary email sent” or “Summary email skipped (min score not met)” / “Summary email failed: …” via `dbLog`.                                                                                                                                                                            |
| 5   | **Base URL for link**    | In the email body, include a link to the analysis: e.g. `[App base URL]/application-assistant/[analysisId]`. Use `process.env.NEXT_PUBLIC_APP_URL` or `VERCEL_URL` (or similar) so the link works in production; document in env example.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 6   | **Error handling**       | If SMTP env is missing or send fails, log and do not throw (pipeline still marks “done”). Optionally set a run metadata flag or log entry so the UI can show “Email could not be sent” if desired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | **Manual test**          | Run one full application analysis with `emailUpdatesEnabled` true and `emailMinMatchScore` satisfied; confirm one email received with correct subject, body structure, PDF attachment, and contact links.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Files to touch:**

- `.env.example` — add SMTP\_\* (and optional app URL).
- `apps/web/lib/cover-letter-pdf.ts` (new) — shared PDF buffer from cover letter text.
- `apps/web/app/api/application-assistant/cover-letter-download/route.ts` — use shared PDF helper.
- `apps/web/lib/email-agent.ts` (new) — build subject/body, attach PDF, send via Nodemailer.
- `apps/web/lib/application-assistant-runner.ts` — replace “not implemented” block with call to email utility + logging.

---

## 2. Application analysis CSV upload (priority 2) — Phase 2 (next)

**Goal:** Let users upload a CSV of job URLs; system runs application analysis for those URLs in the background, per user, with admin control.

**Scope:** One queue per user (list of job URLs). Admin can start/stop the worker for each user's queue. Each URL is processed by the same pipeline as single-URL analysis (so history, email, cover letter, outreach all apply).

---

### 2.1 CSV format and storage

- **CSV:** One column only — **URLs to job postings** (one URL per row; optional header row).
- **New table:** e.g. `csv_uploaded_urls` (or `application_analysis_queue` / name TBD) with at least:
  - `id` (uuid, PK), `url` (text), `user_id` (uuid, FK), `created_at`, `status` (e.g. `pending` | `running` | `completed` | `failed`), `order`/`sequence` (int); optional `analysis_id` (FK to application_assistant_analyses).
- **Purpose of storing user_id:** When the background process runs, we know which user's “automated application analysis” is running → show in **history** as automatically ran for that user.

### 2.2 Where do users upload the CSV? — Confirmed

- **Application Assistant, new analysis only.** When the user is on the **new analysis** view (not viewing an old analysis), show a button **to the left of "History"**.
- **Button label:** **"Automate analysis"**. Do not show this button when viewing an old analysis (by id).
- **On click:** Open a **small modal** with:
  - A short description of what automated analysis is (upload CSV of job URLs; analyses run in order; results appear in history).
  - CSV file input and a **Submit** (or equivalent) action. On submit: parse URLs, insert queue rows for this user, close modal.
- **Progress on the same page:** The Application Assistant page **tracks whether this user has an automated run in progress**. If yes, show that state upfront (e.g. "Automated analysis running: X of Y") and give the user a **Hard stop** button so they can abort their own run. When no run is active, the "Automate analysis" button is the entry point.

### 2.3 Background processing (how the worker runs) — Confirmed

- **In-process, Admin Play.** When admin clicks Play for a user, an async loop in the Next.js app processes that user's queue one URL at a time. No separate script; no cron.
- **No Pause.** Once automation has started, it runs until the queue is empty or someone triggers a **Hard stop**. There is no "pause and resume later" — only **Play** (start) and **Hard stop** (abort).
- After server restart, admin can click Play again to resume that user's pending queue.

### 2.4 Admin UI — Confirmed

- **New admin tab:** **"Application analysis (per user)"**. List users who have at least one queue row (pending, completed, or failed).
- **Content:** One row per user (e.g. email/name, pending count, completed, failed). **Play:** start (or resume) processing that user's queue. **Hard stop:** abort that user's current run (same idea as deep company research hard stop). No Pause button — run to completion or hard stop only.
- Optional: show "currently running" and recent analysis links per user.

### 2.5 User-facing live view — Confirmed

- When **this user's** automation is running, the Application Assistant page should **show the run live**: the same UI that single-URL analysis uses (browser/logs) so the user sees the page and flow changing for each URL in their CSV.
- **Between analyses:** When one analysis finishes, wait **10 seconds**, then start the next URL on a **fresh page** so the user clearly sees the transition to the next job. The 10s gives them time to see the run complete and, if they want, stop and check history before the next one starts.
- All runs are saved to **history** as usual; optionally label as "From batch" or "Automated" so the user can tell.

### 2.6 Phase 2 — Implementation plan (locked)

| #   | Task                                   | Details                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **DB: new table**                      | Queue table: `id`, `user_id`, `url`, `status`, `order`/`sequence`, `created_at`, optional `analysis_id`. Migration in `packages/db`. Use e.g. `application_analysis_queue` (or `csv_uploaded_urls`).                                                                                                                                                                        |
| 2   | **"Automate analysis" button + modal** | On Application Assistant **new analysis** view only (no analysis id in route): show button to the left of History, label **"Automate analysis"**. On click open modal: short description, CSV file input, Submit. Submit → parse URLs, `POST /api/.../queue/upload`, insert rows for current user.                                                                          |
| 3   | **User progress + Hard stop**          | Same page: if this user has a run in progress, show state (e.g. "Automated analysis running: X of Y") and a **Hard stop** button. API to check "is my queue running?" and API to "hard stop my run" (sets flag so worker loop exits after current URL and marks run stopped).                                                                                               |
| 4   | **Admin: list users with queue**       | API returns users with at least one queue row + counts (pending, completed, failed). Admin tab "Application analysis (per user)" lists them.                                                                                                                                                                                                                                |
| 5   | **Admin: Play + Hard stop**            | Per user: **Play** (start/resume in-process loop), **Hard stop** (abort that user's run). No Pause. Flag "worker running for user X" so we don't start two loops; Hard stop clears flag and signals loop to exit after current URL.                                                                                                                                         |
| 6   | **Worker loop (in-process)**           | While (pending for U and not stopped): take next row → create analysis row → run full application-assistant pipeline for that URL (same runner as single-URL) → update queue row completed/failed + analysis_id. **After each run:** 10s delay, then next URL on a **fresh page** so user sees swap. On error mark row failed; continue to next or stop per product choice. |
| 7   | **Live view for user**                 | When user's automation is running, the Application Assistant UI shows the run live (reuse same browser/logs flow as single-URL so the page changes per URL). After each analysis, 10s delay then next URL starts fresh.                                                                                                                                                     |
| 8   | **History**                            | Queue-created analyses have `user_id`; show in that user's history. Optionally label "From batch" / "Automated".                                                                                                                                                                                                                                                            |

**Defaults for implementation:** Table name: `application_analysis_queue` (or keep `csv_uploaded_urls` if preferred). On single-URL failure (timeout, parse error): mark row as `failed` and **continue to next URL** so the run only stops when the queue is empty or user/admin triggers Hard stop.

**References:** `apps/web/app/admin/page.tsx`, `apps/web/app/application-assistant/page.tsx`. Existing CSV import in admin is for company names (deep research), not job URLs.

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

3. **Targeted people search (DDG then LinkedIn, then fallback)**
   - Only if 1–2 didn't yield a good contact: run **people search** for candidates across **all** role types relevant to the position. We do **not** aim only for HRs — the seven types in the Contact Priority Ranking are the **ranking** order (how we prefer/order contacts when we find them), not a limit on who we search for.
   - **Query volume:** Use **2–3 targeted queries per role type** across the seven role types; total queries **dynamic as required**, **max 30** (aligned with the existing “visit up to 30 pages” budget). Each query is targeted to that archetype + job title + company (e.g. “[Company] hiring manager [Job Title]”, “[Company] technical recruiter”, “[Company] [Job Title] team lead LinkedIn”).
   - **DDG phase:** Run these targeted queries via DDG; visit up to the existing page budget (e.g. up to 30 pages). Collect candidates; rank and filter by the Contact Priority Ranking (prefer HM > EM > Team Lead > Tech Recruiter > … > Fallback).
   - **LinkedIn discovery:** Next, run **role-targeted** LinkedIn discovery (queries targeted to the job title and role types, not generic “company + HR”). Same idea: find people who match the position.
   - **Last fallback:** If DDG + targeted LinkedIn still yield nothing useful, fall back to “at least someone from the company's LinkedIn” — a broader, company-level search so we can still suggest a contact.
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

- **Strategy / searchQueries:** Ensure `determineContactStrategy` (or equivalent) produces **2–3 targeted queries per role type** (dynamic total, **max 30**), then role-targeted LinkedIn discovery, with company-LinkedIn as last fallback. Do not aim only for HRs; search for candidates across HM, EM, team lead, recruiter, etc., and rank results by the Contact Priority table.
- **Job posting first:** Ensure the pipeline **always** parses and chunks the job posting URL first; only then run DDG/LinkedIn discovery if no contact is found on the page or via URLs extracted from it.
- **Logging / UI:** Prefer messages like “Found N candidates for [Job Title] at [Company]” and surface that the run was **targeted** for the role.

**References:**

- `apps/web/lib/outreach-research-runner.ts` — flow, strategy, DDG people search, `strategy.searchQueries`, `MAX_PAGES_TO_VISIT`.
- `miscellaneous/project_scope.md` — Contact Priority Ranking, Contact Discovery Flow (check job description first, then strategy, then people search).

### 3.4 Phase 3 — Implementation plan (Proposed Draft)

| #   | Task                                             | Details                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Extract contacts directly from Job Post**      | Update `parseJobBodyForContact` in `outreach-research-runner.ts` to be smarter or use an LLM fallback if regex fails to correctly identify named contacts in the job description to avoid returning generic emails (like `privacy@`).                          |
| 2   | **Extract and visit 'Team' links from Job Page** | In `outreach-research-runner.ts`, prior to broad DDG queries, scan the job posting's extracted HTML for links matching 'Meet the team', 'About Us', or 'Apply here'. Visit these 1-2 URLs directly using Playwright to extract priority contacts.              |
| 3   | **Update Contact Strategy Agent**                | Modify `contact-strategy-agent.ts` (`generateSearchQueries`) to ensure 2-3 generated queries _per_ identified archetype. Additionally, generate **role-targeted LinkedIn queries** dynamically here instead of relying on hardcoded queries in the runner.     |
| 4   | **Refactor LinkedIn Discovery step**             | In `outreach-research-runner.ts`, replace the hardcoded `linkedInQueries` array (which strictly searches for HR/recruiters) with dynamic queries produced by `contact-strategy-agent.ts` for the specific target archetypes identified for the role.           |
| 5   | **Contact Thresholds & Verifier Strictness**     | Review the filtering in `outreach-research-runner.ts` where contacts are kept if `confidence >= 0.35` or `isVerified`. Ensure that when falling back to "any company contact," it's clearly tagged as a fallback and ranked strictly below targeted prospects. |

### 3.5 Phase 3.5 — Outreach Pipeline Flow & UI Adjustments

**Background:** The user observed that the pipeline immediately jumps to DuckDuckGo/LinkedIn searches rather than visiting the job posting URL first to inspect for contacts or links. They also want to see the JSON results of the `contacts` array in the Admin UI.

| #   | Task                                   | Details                                                                                                                                                                                                    |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Visit Job URL First**                | In `outreach-research-runner.ts`, add a step early in `runOutreachResearch` to navigate Playwright to the `job.sourceUrl` and attempt `extractFromTeamPage`.                                               |
| 2   | **Extract 'Team' Links from Job Page** | Dynamically evaluate the Job URL page DOM in Playwright to find any links to `/team`, `/about`, `/careers` or `/leadership`. Limit to 1-2 and visit them to extract candidates.                            |
| 3   | **Conditional Fallback Strategy**      | If candidates are found from the direct job posting or its connected team pages, **SKIP** the DDG and LinkedIn discovery steps ("If we get none of these, then we change into the contact strategy mode"). |
| 4   | **UI JSON Output**                     | Update `ContactOutreachPanel.tsx` in the admin dashboard to render the `result.contacts` array in a JSON `<pre>` block directly under the success message, showing `name` and `linkedinUrl`.               |

---

## 5. Nothing else required for “final plan”

Per your scope, the only remaining work before considering the project “finished” is:

1. Email agent — ✅ completed.
2. Application analysis CSV upload + table + admin tab (per-user play/pause) — **phase 2 (next)**.
3. Outreach agent targeted flow (job-first, then targeted queries + priority ranking).
4. Interview prep (after outreach).

If you remember another area later, add it to this file or to the relevant section above.

---

## Quick reference

| Item                         | Location / note                                                                |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Admin tabs                   | `apps/web/app/admin/page.tsx`                                                  |
| Outreach pipeline            | `apps/web/lib/outreach-research-runner.ts`                                     |
| Contact priority ranking     | `miscellaneous/project_scope.md` § Contact Priority Ranking                    |
| Email preferences            | `packages/db` (email min match, etc.), `apps/web/app/preferences/page.tsx`     |
| Application assistant runner | `apps/web/lib/application-assistant-runner.ts`                                 |
| Email agent core plan        | This file § 1.1 (subject, body, attachment, env). § 1.2 = implementation steps |
| Portfolio contact flow       | `D:\Desktop\All Projects\Kartavya-Portfolio-MERN` (EmailJS; reference only)    |
