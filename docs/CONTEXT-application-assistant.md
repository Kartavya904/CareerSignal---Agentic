# CareerSignal — Context: Application Assistant Only

**Purpose:** Single source of context for the current project scope. All implementation and planning align with this.

---

## Scope (locked)

1. **Profile** — Resume upload, parsing, basics. One-click autofill to preferences.
2. **Preferences** — Work auth, locations, seniority, strictness. Used for matching.
3. **Application Assistant** — User pastes a **single job URL** → extract → match to profile → cover letter drafts, interview prep, checklist. **No bulk scraping, no admin crawls, no company catalog.**

Out-of-scope code lives in `miscellaneous/backup` (company catalog, job_listings cache, ATS connectors, admin scrapes, blessed-sources crawl).

---

## Key paths

| Area                     | Path                                                      |
| ------------------------ | --------------------------------------------------------- |
| Web app                  | `apps/web/`                                               |
| Dashboard (3 cards)      | `apps/web/app/dashboard/page.tsx`                         |
| Profile                  | `apps/web/app/profile/`                                   |
| Preferences              | `apps/web/app/preferences/`                               |
| Application Assistant UI | `apps/web/app/application-assistant/`                     |
| Assistant pipeline       | `apps/web/lib/application-assistant-runner.ts`            |
| Agents                   | `agents/`                                                 |
| DB                       | `packages/db/src/`                                        |
| Scope & plan             | `miscellaneous/project_scope.md`, `miscellaneous/plan.md` |

---

## Application Assistant flow (single URL)

1. User submits URL in Application Assistant.
2. Create analysis row; browser navigates to URL.
3. DOM extract → job detail (title, company, location, etc.).
4. Optional company research (about page) when job is on ATS.
5. Match score vs profile/preferences (rule + optional LLM).
6. Cover letters, interview prep, checklist; persist and show in UI.

No background scrapes. No company/job_listings population from connectors.

---

## DB usage

- **Active:** `users`, `profiles`, `user_preferences`, `user_metadata`, `user_profile_insights`, `sources`, `runs`, `application_assistant_analyses`, `application_assistant_analysis_logs`, `jobs` (run-linked when used).
- **Legacy (data cleared):** `companies`, `job_listings`, `job_observations` — no app code writes to these. To clear again: `npx tsx scripts/truncate-scraping-data.ts`.

---

## Dashboard account progress

- **2 of 2 complete** = Profile saved (name + resume) and Preferences saved.
- Application Assistant is “one click away” and does **not** count toward the 2 of 2.

---

_Update this doc when scope or key paths change._
