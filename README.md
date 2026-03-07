# CareerSignal (Agentic)

A semi-autonomous, multi-agent career intelligence platform. You bring job URLs; the system extracts jobs, scores them against your profile, runs deep company research, finds contacts, and prepares cover letters and outreach drafts — all under your supervision.

---

## What It Does

1. **You** create a profile (upload resume, set preferences: locations, visa, seniority, roles).
2. **You** paste a **job posting URL** into the **Application Assistant**.
3. **Agents** run a single-URL pipeline:
   - Normalize and open the URL (follow redirects; handle login/captcha with your help).
   - Classify the page (job vs non-job); resolve to a job page if needed.
   - Extract job details and infer company identity.
   - Run **deep company research** (when the company is in the DB or added via admin): dossier from public web, stored per company.
   - Match the job to your profile (rule + LLM score, strict filter, explanation).
   - Generate resume suggestions, **cover letters**, and **interview prep** bullets.
   - Optionally run **contact discovery** (people search + verification) and **outreach drafts** (LinkedIn/email variants).
4. **You** see match score, rationale, company snapshot, cover letters, contacts, and drafts — all copy-to-clipboard; nothing is sent automatically.
5. **Dashboard** shows your analyses and open job listings; **Admin** (deep company research + contact outreach) supports company dossiers and testing the outreach pipeline.

**Scope:** Job data enters **only** via the Application Assistant (one URL per run). There is no bulk scraping of job boards or company career pages.

---

## Architecture

### Design Philosophy: Code-First, LLM-Assisted

Agents are hand-built modules with deterministic logic at the core. LLMs (Ollama, local) are used only where they add value: parsing, reasoning, and drafting. A large share of the system is pure code (classification, scoring rules, URL handling, persistence).

### Tech Stack

| Layer              | Technology                       | Notes                                               |
| ------------------ | -------------------------------- | --------------------------------------------------- |
| Web UI             | Next.js (TypeScript, App Router) | Server components, streaming logs, approval UX      |
| Database           | PostgreSQL + pgvector            | Structured data; embeddings for RAG/dossier         |
| LLM Runtime        | Ollama (local)                   | deepseek-r1:32b, qwen2.5:32b, llama3.1:8b           |
| Browser Automation | Playwright (Chromium)            | Visible browser for assistant; extraction, evidence |
| Artifact Storage   | Local filesystem                 | Per-run folders: HTML, cleaned content, RAG chunks  |
| Auth               | Session-based (email/password)   | Sign up, sign in; admin flag for admin routes       |

### Where Agents Live

- **`agents/`** (repo root, package `@careersignal/agents`): Browser (classify, extract, clean), match (scoring, company research), profile (resume parse, preferences), contacts (strategy, search, verify), outreach (drafts), apply (blueprint), normalize, rank, planner.
- **`apps/web/lib/`**: Pipeline orchestration — Application Assistant runner, deep company dossier runner, outreach research runner; disk and RAG helpers; planner/step transitions.

---

## Directory Structure

```
CareerSignal - Agentic/
├── apps/
│   └── web/                    # Next.js app: Application Assistant, Dashboard, Profile, Preferences, Admin
├── agents/                     # @careersignal/agents: all agent implementations
│   ├── src/
│   │   ├── browser/            # cleanHtml, classifyPage, extractJobDetail, resolveToJobPage
│   │   ├── profile/            # resume parser, preferences from profile
│   │   ├── match/              # matchProfileToJob, company research, deepResearchCompany
│   │   ├── contacts/           # strategy, people search, verifier
│   │   ├── outreach/           # draft generation, personalization
│   │   ├── apply/              # blueprint, resume suggestions, cover letter, interview prep
│   │   ├── normalize/          # job normalizer, entity resolution
│   │   ├── rank/               # rule scorer, LLM ranker
│   │   └── shared/             # Ollama client, base utilities
├── packages/
│   ├── db/                     # Drizzle schema, migrations, CRUD (users, profiles, preferences, analyses, companies, job_listings, contacts)
│   ├── schemas/                # Zod schemas for API and validation
│   ├── llm/                    # LLM utilities
│   └── core/                   # Shared domain logic
├── data_*/                     # Run artifacts (application assistant, dossier, outreach) — gitignored
├── miscellaneous/
│   ├── plan.md                 # High-level project plan and vision
│   └── project_scope.md       # Locked scope and detailed spec (V1/V2/V3)
├── plan.md                     # Final plan: remaining work (email agent, CSV upload, outreach tuning, interview prep)
└── README.md                   # This file
```

---

## Routes

| Route                         | Purpose                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `/`                           | Landing: hero, sign in / sign up                                                       |
| `/dashboard`                  | Profile/preferences summary; list of analyses; open job listings                       |
| `/application-assistant`      | Main flow: paste URL, run pipeline, view logs, match, cover letters, contacts          |
| `/application-assistant/[id]` | Same assistant UI with analysis `id` in route                                          |
| `/profile`                    | Edit profile; upload/parse resume; view insights                                       |
| `/preferences`                | Locations, visa, seniority, roles, strict filter, email/outreach/cover letter settings |
| `/admin`                      | Two tabs: Deep company research (dossier + CSV import), Contact/Outreach agent         |
| `/signin`, `/signup`          | Auth                                                                                   |

---

## Core Workflows

### Application Assistant (single URL)

```
Paste URL → Fetch/normalize → Browser → Classify (job / non-job / login_wall / captcha)
  → [If needed] Resolve to job page (depth ≤ 2)
  → Extract job detail (RAG-focused or raw HTML)
  → Resolve company identity → Deep company dossier (if company in DB; async)
  → Persist job_listing + analysis
  → Match (rule + LLM), strict filter, explanation
  → Writing: resume suggestions, cover letters, interview prep
  → [Optional] Contact discovery + outreach drafts
  → Done
```

### Deep Company Research (admin)

Import companies by name (or CSV); run “Deep Research” per company. Browser + DuckDuckGo gather public info; results are chunked, embedded, and stored on the company record. Used by the Application Assistant to show company snapshot and research.

### Contact / Outreach (admin or inside assistant)

For a job (from DB or test URL): contact strategy → people search (DDG, then LinkedIn) → verify → rank by archetype → email pattern inference → outreach drafts. Drafts and contacts are shown in the assistant or admin panel; copy-to-clipboard only.

---

## Scoring and Preferences

- **Match score:** XX.XX (0–99.99); combined rule + LLM; strict filter can exclude jobs that fail visa/location/seniority.
- **Preferences:** Target locations, work authorization, seniority, roles, remote preference, salary range, strict filter level, outreach/cover letter tone and length. Email agent settings (e.g. min match for updates) are stored; email sending not yet implemented.

---

## Contact Priority (project scope)

When discovering contacts: Hiring Manager > Engineering Manager > Team Lead / Senior Engineer > Technical Recruiter > Campus Recruiter > Founder > Fallback (any reachable person). Contacts must align with the position.

---

## Prerequisites

- **Node.js** >= 20.x, **npm** >= 10.x
- **PostgreSQL** >= 15 with **pgvector**
- **Ollama** with models: `deepseek-r1:32b-qwen-distill-q4_K_M`, `qwen2.5:32b-instruct-q4_K_M`, `llama3.1:8b-instruct-q4_K_M` (and optionally `qwen2.5-coder:32b-instruct-q4_K_M`)
- **Playwright** (installed via npm; Chromium used for Application Assistant)

### Quick Start

```bash
npm install
# Start Postgres (e.g. Docker): docker compose -f infra/docker/docker-compose.yml up -d
npm run db:migrate
cp .env.example .env.local   # Set DATABASE_URL, AUTH_SECRET
npm run dev
```

Open http://localhost:3000 → Sign up / Sign in → Profile → Preferences → Application Assistant (paste a job URL).

### Running locally (terminals)

- **Terminal 1:** `npm run dev` — Next.js app (Application Assistant, Dashboard, Admin, etc.).
- **Terminal 2:** `ollama serve` — local LLM runtime (and run your chosen models, e.g. `ollama run qwen2.5:32b-instruct-q4_K_M`).
- **Email summaries:** No extra process. When a user has “Email updates” enabled and an analysis finishes, the app sends the summary from the same Node process using SMTP. To enable it, set `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` (and optionally `SMTP_PORT`) in `.env.local` (see `.env.example`). Use an Outlook app password if you use Outlook.

---

## Documentation

| Document                                                         | Purpose                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [miscellaneous/plan.md](miscellaneous/plan.md)                   | High-level plan, north star, principles, roadmap                                              |
| [miscellaneous/project_scope.md](miscellaneous/project_scope.md) | Locked scope, schemas, workflows, V1/V2/V3                                                    |
| [plan.md](plan.md)                                               | Remaining work: email agent, CSV application analysis upload, outreach tuning, interview prep |
