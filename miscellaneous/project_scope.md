# CareerSignal (Agentic) — Project Scope (Locked-Down)

**Purpose:** Definitive scope document for V1, V2, and V3. All decisions are locked unless explicitly marked `[OPEN]`. Derived from `plan.md` and stakeholder confirmation session.

**Implementation Context (Agentic Rebuild):**

- This is an **agentic re-implementation** of an existing working application. Most features (profile, preferences, sources, scan, extraction, ranking, top-15) are implemented or ported. The main gap is **contact search/discovery** — implementation can be ported from the previous version.

**Key Constraints (Shape Everything):**

| Constraint         | Decision                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| **Budget**         | $0. No paid APIs, no hosted LLMs, no SaaS subscriptions.                         |
| **LLM Strategy**   | Ollama only (local models). No OpenAI, Anthropic, or other paid model providers. |
| **Deployment**     | Local only. No cloud hosting for V1/V2.                                          |
| **User**           | Single user (the developer). Multi-user deferred to V3.                          |
| **Language**       | English only. No multi-language support.                                         |
| **Monetization**   | None. Not a revenue product.                                                     |
| **Compliance**     | Deferred. No GDPR/CCPA requirements for single-user local deployment.            |
| **V1 Timeline**    | ~1 week target. Ship fast, iterate. Quality matters — no broken features.        |
| **V2/V3 Timeline** | No deadline. Quality over speed once V1 is stable.                               |

---

## Version Overview

| Version | Theme                            | Target Timeline      | Core Deliverable                                                      |
| ------- | -------------------------------- | -------------------- | --------------------------------------------------------------------- |
| **V1**  | MVP — scan, rank, contact, draft | ~1 week (aggressive) | Profile → Sources → Scan → Rank → Top 15 → Contact → Drafts → Tracker |
| **V2**  | Seriously agentic                | Weeks/months         | Swarms, self-healing, ATS library, enriched contacts, digests         |
| **V3**  | Research-grade + startup-grade   | Long-term            | Multi-user, graph memory, outcome learning, marketplace, negotiation  |

---

## Tech Stack (Adjusted for $0 Budget)

| Layer                | Choice                                          | Cost | Notes                                      |
| -------------------- | ----------------------------------------------- | ---- | ------------------------------------------ |
| **Web App**          | Next.js (TypeScript, App Router)                | Free |                                            |
| **Database**         | PostgreSQL (local)                              | Free | Structured data, RLS for future multi-user |
| **Vector Store**     | pgvector (Postgres extension)                   | Free | Embeddings for semantic search + dedupe    |
| **Graph (V3)**       | Postgres recursive CTEs initially → Neo4j CE    | Free | Neo4j Community Edition is free            |
| **LLM Runtime**      | Ollama (local models)                           | Free | Model selection is critical — see below    |
| **Browser**          | Playwright (Chromium, headless)                 | Free |                                            |
| **Orchestration**    | Simple DB-backed job queue (V1) → Temporal (V2) | Free | Temporal self-hosted is free               |
| **Parallelism (V2)** | Worker threads / child processes → Ray (V2+)    | Free | Ray is open source                         |
| **Object Store**     | Local filesystem (V1) → MinIO (V2)              | Free | MinIO self-hosted is free                  |
| **Event Bus (V2+)**  | NATS                                            | Free | NATS is open source                        |
| **Auth (V3)**        | Custom auth (simple session-based for V1)       | Free | Single-user = no auth needed in V1         |

### Hardware Profile (Confirmed)

| Component | Spec                                           |
| --------- | ---------------------------------------------- |
| **RAM**   | 64 GB DDR5 @ 6000 MHz                          |
| **GPU**   | NVIDIA RTX 5070 Ti (16 GB VRAM, CUDA)          |
| **CPU**   | Intel i9-12900K (16 cores / 24 threads)        |
| **Disk**  | Local SSD (assumed, for artifact storage + DB) |

This is a strong local setup. 32B models fit comfortably in VRAM + RAM. Multiple Playwright instances are feasible. Parallel agent execution is well-supported.

### Ollama Models Available (Confirmed)

```
qwen2.5:32b-instruct-q4_K_M           19 GB
deepseek-r1:32b-qwen-distill-q4_K_M   19 GB
llama3.1:8b-instruct-q4_K_M           4.9 GB
qwen2.5-coder:32b-instruct-q4_K_M     19 GB
qwen2.5-coder:7b                       4.7 GB
qwen2.5-coder:32b                      19 GB
llama3.1:latest                        4.9 GB
deepseek-r1:32b                        19 GB
deepseek-r1:latest                     4.7 GB
deepseek-r1:8b                         4.9 GB
```

### Model Assignment Strategy

Two tiers: **fast models** (8B, ~2s/response) for high-volume tasks, **heavy models** (32B, ~8-15s/response) for reasoning-intensive tasks.

| Task Type                | Primary Model                         | Fallback           | Why                                                            |
| ------------------------ | ------------------------------------- | ------------------ | -------------------------------------------------------------- |
| Resume parsing           | `qwen2.5:32b-instruct-q4_K_M`         | `llama3.1:8b`      | Structured extraction benefits from 32B reasoning              |
| Job normalization        | `llama3.1:8b-instruct-q4_K_M`         | `qwen2.5-coder:7b` | High-volume, needs speed; 8B is accurate enough for schema map |
| Match scoring (Rule)     | N/A (deterministic, no LLM)           | —                  | Pure code logic, no model needed                               |
| Match scoring (LLM)      | `deepseek-r1:32b-qwen-distill-q4_K_M` | `qwen2.5:32b`      | Best reasoning model for nuanced profile-to-job matching       |
| Outreach drafting        | `qwen2.5:32b-instruct-q4_K_M`         | `llama3.1:8b`      | 32B produces higher quality prose with better tone control     |
| Contact reasoning        | `deepseek-r1:32b-qwen-distill-q4_K_M` | `qwen2.5:32b`      | Needs reasoning: "who is the best contact and why"             |
| Planning / orchestration | `deepseek-r1:32b-qwen-distill-q4_K_M` | `qwen2.5:32b`      | Complex multi-step reasoning, strategy decisions               |
| Code generation (tools)  | `qwen2.5-coder:32b-instruct-q4_K_M`   | `qwen2.5-coder:7b` | When agents need to generate extraction selectors dynamically  |

**Key insight:** Only one 32B model can be loaded at a time in VRAM (16 GB). The system should manage model loading — swap between `deepseek-r1:32b` and `qwen2.5:32b` depending on task type. Ollama handles this automatically but there's a ~5-10s cold-load penalty per swap. Batch similar tasks together to minimize swaps.

**Concurrency model:** Run 8B models for bulk tasks (normalization, extraction) while 32B handles sequential reasoning tasks (scoring, planning). The 8B models can run on CPU in parallel while GPU handles the 32B model.

---

## Agent Design Philosophy: Hybrid Agents (Code-First, LLM-Assisted)

**Core principle:** Agents are NOT thin LLM wrappers. Each agent is a hand-built module with deterministic logic at its core, using LLM calls only where they provide genuine value that code alone cannot achieve.

### The Spectrum

Every agent sits somewhere on this spectrum:

```
Pure Code ◄──────────────────────────────────────────────────► Pure LLM
   │                         │                                    │
   │  Rule Scorer            │  Job Normalizer                    │  Outreach Writer
   │  Entity Resolution      │  Contact Verifier                  │  LLM Ranker
   │  Pagination Agent       │  DOM Extractor                     │
   │  Top-K Curator          │  Contact Strategy                  │
   │  Source Validator        │  Resume Parser                     │
   │  Policy Agent           │  People Search                     │
```

### Design Rules for Every Agent

1. **Start with code.** Write the deterministic logic first — parsing, filtering, scoring rules, DOM traversal, HTTP requests, data transforms. This is the agent's skeleton.

2. **Add LLM only for genuine ambiguity.** Use an LLM call when:
   - The task requires natural language understanding (parsing unstructured job descriptions)
   - The decision space is too large/fuzzy for rules (ranking nuance, tone adaptation)
   - Human-like reasoning is needed (explaining why a job matches, drafting personalized outreach)

3. **Never use LLM for things code does better:**
   - URL validation → HTTP request + status code check
   - Deduplication → fuzzy string matching algorithms (Levenshtein, Jaccard)
   - Pagination → DOM selector patterns + click automation
   - Score calculation → weighted formula
   - Data transformation → schema mapping functions
   - Rate limiting → counters + timers

4. **Every agent has a typed interface.** Inputs and outputs are Zod-validated schemas, regardless of whether the internals use LLM or not. The caller doesn't care how the agent works — only that it returns the right shape.

5. **LLM calls are explicit and isolated.** When an agent does use LLM, it's a clearly defined step within the agent's pipeline, not the entire agent. Example:

```
Job Normalizer Agent:
  1. [CODE]  Parse raw HTML extract → structured fields (title, company, location)
  2. [CODE]  Apply canonicalization rules (title standardization, location normalization)
  3. [LLM]   Infer missing fields from description text (seniority, visa, remote type)
  4. [CODE]  Validate output against Job schema, fill defaults, compute dedupe_key
```

6. **LLM is a tool, not the brain.** The agent's control flow is always in code. LLM is called like any other tool — with clear inputs, expected output schema, timeout, retry policy, and fallback behavior if the LLM fails or returns garbage.

### Per-Agent LLM Dependency Classification

| Agent                     | LLM Usage  | What Code Does                                             | What LLM Does                                           |
| ------------------------- | ---------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Planner Agent             | **Heavy**  | Workflow state machine, task dispatch                      | Strategy decisions, re-planning on failure              |
| Resume Parser Agent       | **Medium** | PDF/DOCX text extraction, regex for structured fields      | Infer skills/seniority from unstructured text           |
| Preference Builder Agent  | **Light**  | Map profile fields → preference fields                     | Suggest preferences from resume context                 |
| Source Validator Agent    | **None**   | HTTP HEAD request, status code check, content-type check   | —                                                       |
| Browser Navigator Agent   | **None**   | Playwright navigation, wait strategies, screenshot capture | —                                                       |
| DOM Extractor Agent       | **Light**  | CSS selectors, XPath, DOM traversal, heuristic patterns    | Fallback: extract from messy/unusual HTML layouts       |
| Pagination Agent          | **None**   | Detect next/load-more buttons, click, wait, repeat         | —                                                       |
| Screenshot Evidence Agent | **None**   | Playwright screenshot API, file hash, storage              | —                                                       |
| Job Normalizer Agent      | **Medium** | Field parsing, canonicalization rules, schema validation   | Infer missing fields (seniority, visa) from description |
| Entity Resolution Agent   | **Light**  | Fuzzy hashing, string similarity, merge logic              | Disambiguate edge cases ("Alphabet" vs "Google")        |
| Canonicalizer Agent       | **Light**  | Lookup tables, regex patterns, abbreviation expansion      | Normalize exotic titles to standard taxonomy            |
| Rule Scorer Agent         | **None**   | Weighted scoring formula, binary checks, dimension flags   | —                                                       |
| LLM Ranker Agent          | **Heavy**  | Prompt construction, response parsing, score extraction    | Full profile-to-job reasoning + explanation             |
| Top-K Curator Agent       | **None**   | Sort by score, group by source/company, select top 15      | —                                                       |
| Contact Strategy Agent    | **Medium** | Company size lookup, role type mapping                     | Decide best archetype based on job + company context    |
| People Search Agent       | **Medium** | Web search, HTML scraping, LinkedIn parsing, GitHub API    | Identify relevant people from unstructured web results  |
| Contact Verifier Agent    | **Medium** | Cross-reference evidence, timestamp checks                 | Assess relevance + confidence from context              |
| Outreach Writer Agent     | **Heavy**  | Template selection, character limit enforcement            | Generate personalized, tone-controlled drafts           |
| Personalization Agent     | **Heavy**  | Hook extraction from job/company data                      | Weave hooks into natural-sounding outreach              |
| Application Blueprint     | **Light**  | Form field detection, DOM analysis, screenshot steps       | Map ambiguous fields to profile fields                  |
| Policy/Constraint Agent   | **None**   | Rate limit counters, budget tracking, allow/deny lists     | —                                                       |

**Summary:** 6 agents use **no LLM at all**, 6 use it **lightly** (fallback or edge cases), 4 use it at **medium** level, and 5 use it **heavily**. This means ~60% of the system is predominantly hand-written logic.

### Benefits of This Approach

- **Speed:** Code-only agents run in milliseconds, not seconds
- **Reliability:** Deterministic behavior is testable and reproducible
- **Cost:** Even with free local Ollama, LLM calls take 2-15 seconds each — minimizing them speeds up the entire pipeline
- **Debuggability:** When something breaks, you can trace through code logic, not wonder what the model "was thinking"
- **Control:** You own the logic. Changing a scoring rule is editing a function, not prompt engineering
- **Offline capability:** Code-only agents work even if Ollama is down or overloaded

---

# V1 — MVP (Ship + Demo in ~1 Week)

V1 is the **full vertical slice** that delivers real value: scan sources → extract jobs → rank them → find contacts → draft outreach → track pipeline. Timeline is aggressive (~1 week) but no features are cut — quality matters.

---

## Target Role Profile (Scoring Calibration Baseline)

The primary user's target profile, used to calibrate scoring weights and test fixtures:

| Dimension              | Target                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **Role types**         | Full Stack Software Engineer, AI/ML Engineer, Backend Engineer, Data Engineer, ML Engineer |
| **Work authorization** | H1B (requires sponsorship)                                                                 |
| **Location**           | US-based preferred, but also open to international roles                                   |
| **Remote preference**  | Remote, Hybrid, or Onsite — all acceptable (user configurable per preference set)          |
| **Seniority**          | Configurable per user — system should support all levels                                   |

This means the scoring model must be especially strong at:

- Detecting H1B/visa sponsorship signals (or lack thereof) in job descriptions
- Distinguishing between role types (a "Data Analyst" is not a "Data Engineer")
- Matching skills across overlapping domains (e.g., Python appears in SWE, ML, Data roles)

---

## 1.1 Profile Builder + Resume Parsing

### Decisions Locked

| Decision                  | Answer                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Resume formats            | **PDF + DOCX only**                                                                            |
| Language support          | **English only**                                                                               |
| Auto-populate preferences | **Yes** — button in UI: "Auto-populate from profile" that fills preferences from parsed resume |
| Profile schema storage    | Postgres, canonical fields                                                                     |

### Scope

- **Resume Parser Agent:** Accepts PDF or DOCX upload. Extracts: name, email, phone, location, skills[], experience[], education[], certifications[], visa/work authorization status.
- **Profile UI:** Form with all fields. Pre-filled from resume parse. Editable.
- **"Auto-populate preferences" button:** Maps extracted skills, location, seniority to preference fields. User confirms/edits.
- **Validation:** Required fields: name, location, visa/authorization status. Everything else optional.

### Schema (Canonical Profile)

```
Profile {
  id: uuid
  user_id: uuid
  name: string (required)
  email: string
  phone: string
  location: string (required)
  work_authorization: enum [US_CITIZEN, GREEN_CARD, H1B, OPT, EAD, OTHER] (required)
  seniority: enum [INTERN, JUNIOR, MID, SENIOR, STAFF, PRINCIPAL, DIRECTOR, VP, C_LEVEL]
  target_roles: string[]
  skills: string[]
  experience: Experience[]
  education: Education[]
  certifications: string[]
  industries: string[]
  salary_range: { min: number, max: number, currency: string } (optional)
  employment_type: enum [FULL_TIME, PART_TIME, CONTRACT, FREELANCE][]
  remote_preference: enum [REMOTE, HYBRID, ONSITE, ANY]
  resume_raw_text: text
  resume_file_ref: string
  created_at, updated_at: timestamp
}
```

### Out of Scope (V1)

- Multi-language resume parsing
- LinkedIn profile import
- Skills ontology mapping (V2)
- Graph-based profile (V3)

---

## 1.2 Sources Registry

### Decisions Locked

| Decision               | Answer                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Sources per user       | **Unlimited**                                                                              |
| Blessed default boards | **Yes, at least 10** (pre-seeded master list in backend; user adds which to use)           |
| Crawl timing           | **On add** — browser agent crawls a source when the user adds it; jobs populate in user DB |
| URL correction         | **Yes** — if URL is wrong/broken, system should figure out correct URL and update          |
| User control           | User can add/remove/disable any source (including blessed defaults)                        |

**Model:** A master list of known boards (LinkedIn Jobs, Indeed, Wellfound, etc.) lives in the backend. User adds sources (e.g. Google careers page) from this list or custom URLs. When a source is added, the browser agent crawls it and extracted jobs populate in the **user’s** database. Sources are user-scoped.

### Blessed Default Sources (10)

| #   | Source                   | URL Pattern                           | Type       |
| --- | ------------------------ | ------------------------------------- | ---------- |
| 1   | LinkedIn Jobs            | linkedin.com/jobs/                    | Aggregator |
| 2   | Indeed                   | indeed.com/jobs                       | Aggregator |
| 3   | Wellfound (AngelList)    | wellfound.com/jobs                    | Aggregator |
| 4   | Glassdoor                | glassdoor.com/Job/                    | Aggregator |
| 5   | Dice                     | dice.com/jobs                         | Aggregator |
| 6   | ZipRecruiter             | ziprecruiter.com/jobs/                | Aggregator |
| 7   | SimplyHired              | simplyhired.com/search                | Aggregator |
| 8   | Built In                 | builtin.com/jobs                      | Aggregator |
| 9   | Levels.fyi Jobs          | levels.fyi/jobs                       | Aggregator |
| 10  | Hacker News Who's Hiring | news.ycombinator.com (monthly thread) | Community  |

**Status: CONFIRMED** — these 10 are approved as blessed defaults.

### Source Schema

```
Source {
  id: uuid
  user_id: uuid
  name: string
  url: string
  type: enum [COMPANY, AGGREGATOR, COMMUNITY, CUSTOM]
  enabled: boolean (default true)
  is_blessed: boolean
  metadata: json (rate_limit, filters, notes)
  last_scanned_at: timestamp
  last_validated_at: timestamp
  status: enum [ACTIVE, BROKEN, VALIDATING, DISABLED]
  corrected_url: string (if auto-corrected)
  created_at, updated_at: timestamp
}
```

### URL Auto-Correction (V1 — Basic)

- On add: validate URL reachability (200 OK, correct content)
- If broken: attempt search for correct URL (company name + "careers" or "jobs")
- Surface corrected URL to user for confirmation before updating

### Out of Scope (V1)

- Regex/wildcard URL patterns (deferred — user's actual need is URL correction, not regex)
- Self-healing loop (V2)
- Source reliability scoring (V2)

---

## 1.3 Browser-Based Job Extraction (Headless)

### Decisions Locked

| Decision             | Answer                                                                         |
| -------------------- | ------------------------------------------------------------------------------ |
| Results limit        | **Top 15 roles per source** (after ranking, not max pages)                     |
| Extraction scope     | All jobs available on the page(s), then rank and show top 15                   |
| Supported site types | **Everything** — company career pages, LinkedIn, Indeed, Glassdoor, any site   |
| Extraction strategy  | **Both:** generic heuristics first + site-specific selectors. Planner decides. |
| Evidence capture     | HTML snapshots + screenshots stored locally                                    |

### How It Works

1. Browser Navigator Agent navigates to source URL
2. Pagination/Discovery Agent explores available pages (follows "next", "load more", filters)
3. DOM Extractor Agent extracts ALL job listings found (no page cap — extract everything available)
4. Job Normalizer Agent normalizes to canonical schema
5. Scoring pipeline ranks ALL extracted jobs
6. **Top-K Curator selects top 15 per source** (or per company within aggregator source)
7. Only top 15 shown to user; remaining stored but hidden (next one surfaces when user processes the top 15)

### Extraction Strategy (Planner-Driven)

```
Planner decides per-source:
  1. Try generic heuristics (DOM patterns, common selectors)
  2. If confidence < threshold → try site-specific recipe (if available)
  3. If both fail → try structured data (JSON-LD, microdata)
  4. If all fail → screenshot + log for manual recipe creation
```

### Artifact Storage (V1 — Local Filesystem)

```
artifacts/
├── runs/{run_id}/
│   ├── {source_id}/
│   │   ├── raw_html/{page_num}.html
│   │   ├── screenshots/{page_num}.png
│   │   ├── extracted_jobs.json
│   │   └── metadata.json
```

### Out of Scope (V1)

- Multiple simultaneous browsers (single Playwright instance in V1; parallelism in V2)
- Infinite scroll handling beyond basic "load more" click
- Anti-bot evasion (only respectful pacing + retries)

---

## 1.4 Normalization to Unified Job Schema

### Decisions Locked

| Decision              | Answer                                                                         |
| --------------------- | ------------------------------------------------------------------------------ |
| Required fields (Job) | **Title, company, source_url** (minimum). Location + visa strongly encouraged. |
| Required preferences  | **Location** (required), **Work authorization/visa** (required)                |
| Deduplication         | **Fuzzy:** title + company match (not just exact URL)                          |
| Storage               | **Both** raw extract AND normalized                                            |

### Job Schema (Canonical)

```
Job {
  id: uuid
  run_id: uuid
  source_id: uuid
  user_id: uuid

  // Core (required)
  title: string (required)
  company_name: string (required)
  source_url: string (required)

  // Important (strongly encouraged)
  location: string
  remote_type: enum [REMOTE, HYBRID, ONSITE, UNKNOWN]
  seniority: enum [INTERN, JUNIOR, MID, SENIOR, STAFF, PRINCIPAL, DIRECTOR, VP, C_LEVEL, UNKNOWN]
  employment_type: enum [FULL_TIME, PART_TIME, CONTRACT, FREELANCE, UNKNOWN]
  visa_sponsorship: enum [YES, NO, UNKNOWN]

  // Detail
  description: text
  requirements: string[]
  posted_date: date
  salary_min: number
  salary_max: number
  salary_currency: string
  department: string
  team: string
  apply_url: string

  // Metadata
  raw_extract: json (original scraped data)
  evidence_refs: string[] (artifact paths)
  confidence: number (extraction confidence 0-1)
  dedupe_key: string (generated from title + company fuzzy hash)

  // Scoring (filled by ranking pipeline)
  match_score: decimal(5,2) (XX.XX format, e.g., 87.43)
  score_breakdown: json
  score_explanation: text
  strict_filter_pass: boolean

  created_at, updated_at: timestamp
}
```

### Score Format

Match score uses **XX.XX format** (two digits, decimal point, two digits) for granular distinction:

- Range: 0.00 – 99.99
- Example: 87.43, 92.17, 65.08
- Displayed with full precision in UI

### Deduplication Logic

```
1. Generate dedupe_key = fuzzy_hash(normalize(title) + normalize(company_name))
2. On insert: check if dedupe_key exists within same run
3. If match found: merge (keep richer record, note both source URLs)
4. Cross-run deduplication: compare against existing jobs (same dedupe_key + within 30 days)
```

---

## 1.5 AI Match Scoring + Strict Preference Filter

### Decisions Locked

| Decision              | Answer                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Scoring approach      | **Both** Rule Scorer + LLM Ranker from day 1                                              |
| Mandatory preferences | **Visa/work authorization** (required), **Location** (required), **Seniority** (required) |
| Strict filter         | **Global user setting** — applied to every scan automatically                             |
| Score precision       | **XX.XX format** (e.g., 87.43) — 4 significant digits                                     |
| Scoring quality       | **Must be highly accurate** — this is a core differentiator                               |

### Scoring Pipeline

```
1. Rule Scorer Agent (fast, deterministic):
   - Binary checks: visa match? location match? seniority match?
   - Dimension scores: skills overlap %, experience years fit, industry match
   - Output: rule_score (0.00–99.99) + dimension_flags

2. LLM Ranker Agent (deep, via Ollama):
   - Full profile-to-job reasoning
   - Considers nuance: "Senior" in title but actually mid-level role
   - Natural language explanation of fit/gaps
   - Output: llm_score (0.00–99.99) + explanation + flags

3. Combined Score:
   - Weighted: final_score = (rule_weight * rule_score) + (llm_weight * llm_score)
   - Default weights: 40% rule, 60% LLM (tunable)
   - If strict_filter enabled: any mandatory dimension failure → exclude entirely
```

### Strict Filter (Global Setting)

When enabled (global across all scans):

- Jobs that **fail ANY mandatory preference** (visa, location, seniority) are **excluded** from results entirely
- They are still stored but marked `strict_filter_pass: false`
- User never sees them unless they disable strict filter

### Score Breakdown (Per Job)

```
ScoreBreakdown {
  rule_score: decimal(5,2)
  llm_score: decimal(5,2)
  final_score: decimal(5,2)
  dimensions: {
    visa_match: MATCH | MISMATCH | UNKNOWN
    location_match: MATCH | MISMATCH | PARTIAL
    seniority_match: MATCH | MISMATCH | PARTIAL
    skills_overlap: decimal (0.00–1.00)
    experience_fit: decimal (0.00–1.00)
    industry_match: MATCH | MISMATCH | PARTIAL
    employment_type_match: MATCH | MISMATCH
    remote_match: MATCH | MISMATCH | PARTIAL
  }
  explanation: text (LLM-generated natural language)
  evidence: string[] (supporting quotes from job description)
}
```

---

## 1.6 Top-K Ranking per Source/Company

### Decisions Locked

| Decision          | Answer                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Primary unit      | **Top 15 per source** if source is a single company; **Top 15 per company within source** if aggregator |
| Global merge      | **Yes** — results mergeable across sources into a global top-N view                                     |
| Diversity         | Deferred / nice-to-have for V1                                                                          |
| Overflow behavior | When user processes a top-15 job (moves to next stage), next-ranked job surfaces                        |

### Logic

```
For each source:
  if source.type == COMPANY:
    show top 15 jobs from that company (by final_score DESC)
  if source.type in [AGGREGATOR, COMMUNITY, CUSTOM]:
    group jobs by company_name
    show top 15 per company within that source

Global view:
  merge all top-15 lists across sources
  sort by final_score DESC
  display as unified ranked list (with source attribution)
```

### "Rolling Top 15" (Lazy Surfacing)

- Initially show **max 15** ranked results per source/company
- All ranked jobs are stored in the DB; only the top 15 are shown
- When the user changes a job’s status (e.g. Discovered → Applied), the **next-ranked** job (e.g. #16) surfaces into the visible list
- This keeps the active list at ~15 actionable items; no manual pagination — results are lazy-loaded as the user processes the list

---

## 1.7 Job Detail UI (Match Explanation + Cover Letter)

### Decisions Locked

| Element               | Answer                                                               |
| --------------------- | -------------------------------------------------------------------- |
| Match explanation     | **Yes** — short “Why you’re a perfect match” (keywords, fit summary) |
| Company description   | **Yes** — short blurb about the company                              |
| Full job description  | **Yes** — visible when user expands or opens the job                 |
| Generate cover letter | **Yes** — button to draft a cover letter for that specific position  |

---

## 1.8 Contact Discovery from Public Web

### Decisions Locked

| Decision                 | Answer                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Sources in scope         | **Everything public:** GitHub, company sites, LinkedIn public, conference pages, open internet |
| LinkedIn API             | **No** — purely public web signals. No LinkedIn API.                                           |
| Confidence threshold     | **Display confidence score** on each contact (no minimum cutoff — show all found)              |
| Max contacts per job     | **3**                                                                                          |
| Contact priority ranking | Ordered by relevance to role (see ranking below)                                               |

### Contact Priority Ranking (Global)

When searching for contacts, prioritize in this order:

| Priority | Contact Type                            | Why                                               |
| -------- | --------------------------------------- | ------------------------------------------------- |
| 1        | **Hiring Manager**                      | Direct decision-maker for the role                |
| 2        | **Engineering Manager**                 | Close to hiring decisions, understands team needs |
| 3        | **Team Lead / Senior Engineer on team** | Peer-level influence, insider knowledge           |
| 4        | **Technical Recruiter**                 | Directly responsible for filling the role         |
| 5        | **University/Campus Recruiter**         | Relevant for entry-level / new-grad roles         |
| 6        | **Founder**                             | Small companies, startup roles                    |
| 7        | **Fallback: any reachable person**      | Last resort — anyone from the company             |

The contact must **align with the position** (e.g., don't suggest a marketing manager for a SWE role).

### Contact Discovery Flow (Full Multi-Source — Option B Confirmed)

```
1. Check job description first: if it contains an email → scrape, save as contact, draft cold email
2. Otherwise: Contact Strategy Agent decides which archetype to hunt based on job + company size + role type
3. People Search Agent: searches ALL public web sources (public records, LinkedIn public, company sites, etc.) for names matching archetype
   - Company team/about pages
   - LinkedIn public profiles (no login required)
   - GitHub org members + contributors
   - Conference speaker lists (recorded talks, event pages)
   - Blog post authors (company engineering blogs)
   - Press releases / news articles
   - Twitter/X profiles (public)
   - Open-source project maintainers
   - Company podcasts / interviews
   - Patent filings, academic papers (for research roles)
4. Contact Verifier Agent: validates relevance + freshness + confidence
5. Output: top 3 contacts per job, ranked by priority + confidence
6. Draft outreach:
   - If contact has **email** → draft cold email
   - If contact has **LinkedIn** (no email) → draft LinkedIn connection/DM message
```

This is the thorough Option B — takes longer per job but produces higher quality contacts with stronger evidence trails.

### Contact Schema

```
Contact {
  id: uuid
  job_id: uuid
  name: string
  role: string
  company: string
  archetype: enum [HIRING_MANAGER, ENG_MANAGER, TEAM_LEAD, TECH_RECRUITER, CAMPUS_RECRUITER, FOUNDER, FALLBACK]
  evidence_urls: string[]
  evidence_snippets: string[]
  confidence: decimal(3,2) (0.00–1.00)
  linkedin_url: string (public, if found)
  email: string (if discoverable publicly, V2 for inference)
  platform: enum [LINKEDIN, EMAIL, GITHUB, TWITTER, OTHER]
  found_via: string (which source/method)
  created_at: timestamp
}
```

---

## 1.9 Outreach Drafting

### Decisions Locked

| Decision         | Answer                                                                          |
| ---------------- | ------------------------------------------------------------------------------- |
| Send integration | **No** — copy-to-clipboard only in V1. No LinkedIn API, no SMTP.                |
| Character limits | **Automated** — detect platform from contact, apply appropriate limits          |
| Draft variants   | **2–3 per contact**                                                             |
| Tone             | Default tone, with variation across drafts (e.g., concise vs warm vs technical) |

### Platform-Aware Character Limits

| Platform            | Limit                                 | Enforced automatically  |
| ------------------- | ------------------------------------- | ----------------------- |
| LinkedIn Connection | ~300 characters                       | Hard limit in draft     |
| LinkedIn DM         | ~1900 characters                      | Soft limit              |
| Email               | No hard limit; ~200 words recommended | Soft guideline in draft |

### Draft Generation Flow

```
1. For each contact (up to 3 per job):
   a. Detect platform (LinkedIn, email, etc.)
   b. Outreach Writer Agent generates 2–3 variants:
      - Variant A: Concise, direct
      - Variant B: Warm, conversational
      - Variant C: Technical, value-driven (if 3 variants)
   c. Personalization Agent injects: job title, company name, specific team/project hooks
   d. Apply platform character limit
2. Store drafts linked to Job + Contact
3. User reviews, edits, copies to clipboard
```

### OutreachDraft Schema

```
OutreachDraft {
  id: uuid
  job_id: uuid
  contact_id: uuid
  platform: enum [LINKEDIN_CONNECTION, LINKEDIN_DM, EMAIL]
  variant: string (A, B, C)
  subject: string (email only)
  body: text
  character_count: number
  within_limit: boolean
  tone: enum [CONCISE, WARM, TECHNICAL]
  personalization_hooks: string[]
  status: enum [DRAFT, APPROVED, SENT_MANUALLY, ARCHIVED]
  created_at, updated_at: timestamp
}
```

---

## 1.10 Application Flow Blueprinting

### Decisions Locked

| Decision       | Answer                                                              |
| -------------- | ------------------------------------------------------------------- |
| Auto-fill      | **No** — blueprint + manual only in V1                              |
| ATS priority   | **All ATS types** — extract from whatever application page is found |
| Blueprint unit | **Per job** (not per company/ATS)                                   |

### Scope (V1 — Minimal)

- Navigate to job's apply URL
- Capture the application form structure (fields, required flags, steps)
- Map user profile fields to form fields (suggested mapping)
- Produce human-readable checklist: "Step 1: Upload resume. Step 2: Fill name, email..."
- **Do NOT auto-fill or submit anything**

### ApplicationBlueprint Schema

```
ApplicationBlueprint {
  id: uuid
  job_id: uuid
  apply_url: string
  steps: Step[] (ordered)
  fields: FormField[]
  required_documents: string[] (e.g., "resume", "cover letter")
  profile_field_mapping: json (form_field → profile_field)
  blockers: string[] (e.g., "requires login", "CAPTCHA detected")
  ats_type: string (detected ATS if identifiable)
  created_at: timestamp
}

Step {
  order: number
  description: string
  url: string
  screenshot_ref: string
}

FormField {
  name: string
  label: string
  type: enum [TEXT, TEXTAREA, SELECT, FILE, CHECKBOX, RADIO, DATE]
  required: boolean
  options: string[] (for SELECT/RADIO)
  mapped_profile_field: string (suggested mapping)
  mapping_confidence: decimal(3,2)
}
```

---

## 1.11 Tracker: Pipeline Stages

### Decisions Locked

| Decision       | Answer                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Default stages | **Discovered → Contacted → Applied → Interviewing → Offer → Rejected** |
| Custom stages  | **Yes** — user can add custom stages                                   |
| Notes          | Freeform text (V1). Structured tags/dates deferred.                    |
| UI             | Kanban or list view, filterable by stage/source/company                |

### Pipeline Schema

```
PipelineEntry {
  id: uuid
  job_id: uuid
  user_id: uuid
  stage: string (from default + custom stages)
  notes: text
  evidence_refs: string[]
  draft_ids: uuid[] (linked outreach drafts)
  contact_ids: uuid[] (linked contacts)
  blueprint_id: uuid
  moved_to_stage_at: timestamp
  created_at, updated_at: timestamp
}

PipelineStage {
  id: uuid
  user_id: uuid
  name: string
  order: number
  is_default: boolean
  color: string (for UI)
}
```

### Default Stages

| Order | Stage        | Description                      |
| ----- | ------------ | -------------------------------- |
| 1     | Discovered   | Job found and ranked by system   |
| 2     | Contacted    | Outreach sent (manually by user) |
| 3     | Applied      | Application submitted            |
| 4     | Interviewing | In interview process             |
| 5     | Offer        | Received offer                   |
| 6     | Rejected     | Rejected at any stage            |

---

# V1 — Agents Required (All 19 for ~1 Week Ship)

From the 35-agent taxonomy in `plan.md`, these are the **agents needed for V1**:

| #   | Agent                           | Role                                                    | Priority  |
| --- | ------------------------------- | ------------------------------------------------------- | --------- |
| 1   | **Planner Agent**               | Orchestrates scan workflow, decides extraction strategy | Critical  |
| 2   | **Resume Parser Agent**         | Extracts profile from PDF/DOCX                          | Critical  |
| 3   | **Preference Builder Agent**    | Auto-populates preferences from profile                 | Critical  |
| 4   | **Source Validator Agent**      | Checks URL reachability on source add                   | Critical  |
| 5   | **Browser Navigator Agent**     | Drives Playwright, navigates pages                      | Critical  |
| 6   | **DOM Extractor Agent**         | Extracts job listings from HTML                         | Critical  |
| 7   | **Pagination Agent**            | Follows next/load-more to get all listings              | Critical  |
| 8   | **Job Normalizer Agent**        | Raw extract → canonical Job schema                      | Critical  |
| 9   | **Entity Resolution Agent**     | Deduplicates jobs (fuzzy title+company)                 | Critical  |
| 10  | **Rule Scorer Agent**           | Deterministic scoring against preferences               | Critical  |
| 11  | **LLM Ranker Agent**            | Deep preference reasoning via Ollama                    | Critical  |
| 12  | **Top-K Curator Agent**         | Selects top 15 per source/company                       | Critical  |
| 13  | **Contact Strategy Agent**      | Decides which contact archetype to find                 | Critical  |
| 14  | **People Search Agent**         | Hunts contacts via public web                           | Critical  |
| 15  | **Contact Verifier Agent**      | Validates contact relevance + confidence                | Critical  |
| 16  | **Outreach Writer Agent**       | Generates 2–3 draft variants                            | Critical  |
| 17  | **Personalization Agent**       | Injects job/company-specific hooks into drafts          | Critical  |
| 18  | **Application Blueprint Agent** | Maps application form structure                         | Important |
| 19  | **Policy/Constraint Agent**     | Enforces rate limits + budgets                          | Important |

### Recommended Build Order (~1 Week)

| Day   | Focus                                    | Agents Built                                                          |
| ----- | ---------------------------------------- | --------------------------------------------------------------------- |
| Day 1 | Scaffold + DB + Profile                  | Resume Parser, Preference Builder                                     |
| Day 2 | Sources + Browser extraction             | Source Validator, Browser Navigator, DOM Extractor, Pagination        |
| Day 3 | Normalization + Scoring                  | Job Normalizer, Entity Resolution, Canonicalizer, Rule Scorer         |
| Day 4 | LLM Ranking + Top-K + UI                 | LLM Ranker, Top-K Curator, Planner (orchestration)                    |
| Day 5 | Contact discovery                        | Contact Strategy, People Search, Contact Verifier                     |
| Day 6 | Outreach + Blueprint + Tracker           | Outreach Writer, Personalization, Application Blueprint, Policy Agent |
| Day 7 | Integration testing + polish + bug fixes | End-to-end workflow validation                                        |

---

# V1 — Core Workflows

## Workflow 1: "Scan & Rank"

```
1. User triggers scan (manual or on profile/source change)
2. Load user profile + preferences + strict filter settings
3. For each enabled source:
   a. Source Validator checks URL is alive
   b. Browser Navigator navigates to source
   c. Pagination Agent discovers all available pages
   d. DOM Extractor extracts all job listings
   e. Job Normalizer converts to canonical schema
   f. Entity Resolution deduplicates
4. All normalized jobs pooled
5. Rule Scorer scores every job
6. LLM Ranker scores every job (via Ollama)
7. Combined score calculated
8. Strict filter applied (if enabled globally)
9. Top-K Curator selects top 15 per source (or per company within aggregator)
10. Results persisted + evidence artifacts stored
11. UI refreshed with ranked results
```

## Workflow 2: "Contact Hunt" (Per Job or Batch)

```
1. For each top-15 job (or user-selected jobs):
   a. Contact Strategy Agent determines archetype priority for this job
   b. People Search Agent searches public web for contacts
   c. Contact Verifier validates relevance + confidence
   d. Top 3 contacts selected per job
2. Results persisted with evidence
```

## Workflow 3: "Draft Outreach" (Per Job+Contact)

```
1. For each job-contact pair:
   a. Detect contact platform (LinkedIn, email, etc.)
   b. Outreach Writer generates 2–3 draft variants
   c. Personalization Agent adds hooks
   d. Character limits applied per platform
2. Drafts stored, linked to job + contact
3. User reviews in UI
```

## Workflow 4: "Application Blueprint" (Per Job)

```
1. User requests blueprint for a specific job
2. Browser Navigator navigates to apply URL
3. Application Blueprint Agent extracts form structure
4. Profile fields mapped to form fields
5. Checklist generated
6. User uses blueprint as manual guide
```

---

# V2 — Seriously Agentic

All V2 features build on a stable V1. No timeline pressure.

## 2.1 Parallel Exploration Swarm

### Decisions Locked

| Decision              | Answer                                                              |
| --------------------- | ------------------------------------------------------------------- |
| Max parallel browsers | **3–10** (auto-calculated based on system resources via testing)    |
| Competing hypotheses  | **Both** multiple extractors AND multiple rankers                   |
| Cost budget           | **Yes** — enforce token caps, time limits, compute budgets per scan |

### Scope

- Ray cluster for worker pool management
- N Playwright workers (3–10, dynamically calculated based on RAM/CPU)
- Parallel source scanning: each source gets its own browser worker
- Competing hypotheses: 2–3 extraction strategies run in parallel per source, best result wins
- Competing rankers: multiple scoring prompts, consensus reconciliation
- Fault isolation: one source failure doesn't block others
- Cost tracking: tokens used, time elapsed, compute cost per scan

### New Agents (V2)

| Agent                   | Role                                                    |
| ----------------------- | ------------------------------------------------------- |
| **Scheduler Agent**     | Manages timing, pacing, worker allocation               |
| **Evaluator Agent**     | Compares outcomes vs predictions, triggers improvements |
| **Incident Agent**      | Failure triage, reproducible bug reports from runs      |
| **Consensus Agent**     | Reconciles competing ranker outputs                     |
| **Freshness Agent**     | Downranks stale/reposted listings                       |
| **Anti-Bot Resilience** | Adaptive pacing, header rotation, retries               |

---

## 2.2 "Reverse-Engineer the ATS" Library

### Decisions Locked

| Decision       | Answer                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ |
| ATS list       | **All** — Workday, Greenhouse, Lever, SmartRecruiters, BambooHR, Ashby, Taleo, iCIMS, etc. |
| Private/custom | **Yes** — generic fallback for unknown ATS                                                 |
| Recipe updates | **Self-learning** from successful extractions                                              |

### Scope

- ATS fingerprint detection: identify ATS from URL patterns, DOM structure, API endpoints
- Per-ATS extraction recipes: optimized selectors, known API endpoints (public)
- Per-ATS application flow recipes: button locations, form structures, field mappings
- Blueprint library: stored blueprints keyed by ATS type + company
- Self-learning: when extraction succeeds → save pattern; when fails → flag for review
- Versioning: ATS sites change; recipes are versioned with fallback to generic

---

## 2.3 Self-Healing Source Discovery and Validation

### Decisions Locked

| Decision             | Answer                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| Auto-replace         | **Require user confirmation**, but persist/re-prompt if user declines      |
| Validation frequency | **On every scan + on-demand + scheduled** (periodic background validation) |
| "Broken" definition  | **All of:** 404, 403, CAPTCHA, timeout, redirect to non-job page           |

### Scope

- Source Self-Heal Agent: detects broken source → searches for replacement URL → proposes update
- Persistent prompting: if user declines replacement, system re-prompts on next scan if still broken
- Validation runs: before each scan (quick check) + daily scheduled + manual trigger
- Robots/Terms Awareness Agent: flags if replacement strategy might violate ToS

---

## 2.4 Multi-Step Contact Enrichment

### Decisions Locked

| Decision                | Answer                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| Email verification      | **Non-intrusive methods only** (DNS MX check, pattern inference) |
| Cold email verification | **No** — never send unsolicited email for verification           |
| Enrichment depth        | **Infer + verify** (pattern inference → MX/SMTP check)           |

### Scope

- Email Pattern Agent: given company domain + person name → infer format (first.last@, f.last@, etc.)
- Verification: DNS MX check (free, passive), SMTP VRFY if supported (passive, no email sent)
- No paid APIs (Hunter, ZeroBounce) — $0 budget constraint
- Confidence update: verified email → higher confidence score
- Fallback: if email can't be verified, still show contact with LinkedIn as primary channel

---

## 2.5 Weekly Digests + Reminders

### Decisions Locked

| Decision         | Answer                                                   |
| ---------------- | -------------------------------------------------------- |
| Delivery channel | **Deferred** — not a V2 priority, focus on core flow     |
| Digest frequency | **Daily + weekly** options (when implemented)            |
| Reminder types   | **All three:** pipeline staleness, deadlines, follow-ups |

### Scope (When Implemented)

- In-app notification center (primary)
- Email delivery (optional, when email service is set up)
- Configurable: user chooses frequency and reminder types
- Content: new jobs since last digest, pipeline status, suggested actions

---

# V3 — Research-Grade + Startup-Grade

All V3 features are long-term. No timeline pressure.

## 3.1 Multi-User Tenancy

### Decisions Locked

| Decision      | Answer                                                         |
| ------------- | -------------------------------------------------------------- |
| Auth provider | **Custom** (simple session-based; no paid auth SaaS)           |
| Billing       | **Free tier / open-source single-user first**. Paid tiers TBD. |
| Quotas        | **Not needed now** (single user)                               |

---

## 3.2 Graph Memory

### Decisions Locked

| Decision            | Answer                                                                |
| ------------------- | --------------------------------------------------------------------- |
| Technology          | **Postgres recursive CTEs initially** → Neo4j Community Edition later |
| Write frequency     | **Real-time** per discovery (agents write to graph as they find data) |
| Graph visualization | **Must-have** in UI                                                   |

### Rationale for Postgres-first

- $0 budget: Postgres is already in the stack
- Simpler ops: one database to manage
- Recursive CTEs handle: "shortest path from me → person → company → job"
- Upgrade path: when graph queries get complex, migrate to Neo4j CE (free)

---

## 3.3 Outcome-Driven Optimization

### Decisions Locked

| Decision          | Answer                                           |
| ----------------- | ------------------------------------------------ |
| History retention | **Forever** — never delete outcome data          |
| Model updates     | **Real-time** updates to scoring/recommendations |

### Scope

- User marks outcomes: Applied → Interview → Offer / Rejected (at each stage)
- Attribution: link outcome to source, job characteristics, contact, outreach style
- Analytics: which sources yield interviews, which message tones convert
- Feedback loop: Evaluator Agent uses outcomes to re-weight scoring model

---

## 3.4 Offer Simulation + Negotiation Agent

### Decisions Locked

| Decision     | Answer                                                |
| ------------ | ----------------------------------------------------- |
| Offer format | **Both** — paste text + upload PDF                    |
| Salary data  | **All available free sources**, cited with provenance |
| Scope        | Deferred for detailed scoping                         |

---

## 3.5 Multi-Modal Parsing

### Decisions Locked

| Decision      | Answer                                            |
| ------------- | ------------------------------------------------- |
| Priority      | **All three:** resume PDFs, job PDFs, screenshots |
| Vision model  | **Local only** (LLaVA or similar via Ollama)      |
| Max file size | Not constrained                                   |

---

## 3.6 Agent Marketplace

### Decisions Locked

| Decision         | Answer                                                |
| ---------------- | ----------------------------------------------------- |
| Pack granularity | **Bundle of agents** (pack = group of related agents) |
| BYO tools        | **Allow arbitrary HTTP calls**                        |
| Marketplace      | **Both** internal + public/community packs            |

---

# Cross-Cutting: All Versions

## Human-in-the-Loop

- **No auto-send.** All outreach/applications require explicit user action.
- **Approval gates:** Send message, submit application, replace source URL.
- **Safety valves:** Rate limits per domain, run budgets (time + tokens), simulation mode.

## Evidence & Reproducibility

- Every claim (job exists, contact found) carries: source URL, extracted snippet, confidence, timestamp.
- Artifacts hashed and timestamped.
- Audit trail: inputs, outputs, agent ID + version, timestamps.
- Stored locally in `artifacts/` directory.

## Policies & Boundaries

- No CAPTCHA bypass or ToS violation.
- Detect blockers → slow down, retry, prompt user.
- Prefer official/public endpoints.
- Respectful pacing: configurable rate limits per domain.

---

# Directory Structure (V1 Adjusted)

```
career-signal-agentic/
├── apps/
│   └── web/                          # Next.js UI
├── agents/
│   ├── planner/                      # Central planner + orchestration
│   ├── profile/                      # Resume parser, preference builder
│   ├── browser/                      # Navigator, extractor, pagination
│   ├── normalize/                    # Normalizer, canonicalizer, dedupe
│   ├── rank/                         # Rule scorer, LLM ranker, top-K curator
│   ├── contacts/                     # Strategy, people search, verifier
│   ├── outreach/                     # Writer, personalizer
│   ├── apply/                        # Application blueprint
│   └── shared/                       # Common agent utils, Ollama client
├── packages/
│   ├── schemas/                      # Zod schemas for all entities
│   ├── db/                           # Postgres client + migrations
│   ├── vector/                       # pgvector utilities
│   ├── llm/                          # Ollama model router + prompt packs
│   ├── tools/                        # Browser tools, parsers, fetchers
│   └── core/                         # Shared domain logic
├── evals/
│   ├── datasets/                     # Golden test fixtures
│   └── harness/                      # Eval runner
├── artifacts/                        # Local artifact storage (HTML, screenshots)
├── docs/
│   └── architecture/                 # ADRs, diagrams
├── scripts/                          # Dev scripts
├── miscellaneous/                    # Plans, scope docs, archives
└── infra/
    └── docker/                       # Docker compose for Postgres + pgvector
```

---

# Data Model Summary (All Entities)

| Entity               | Version | Key Fields                                                       |
| -------------------- | ------- | ---------------------------------------------------------------- |
| User                 | V1      | id, name, email, settings                                        |
| Profile              | V1      | id, user_id, skills[], experience[], work_authorization          |
| PreferenceSet        | V1      | id, user_id, strict_mode, visa, location, seniority + soft prefs |
| Source               | V1      | id, url, type, enabled, is_blessed, status                       |
| Job                  | V1      | id, title, company, match_score (XX.XX), strict_filter_pass      |
| Contact              | V1      | id, job_id, name, role, archetype, confidence, platform          |
| OutreachDraft        | V1      | id, job_id, contact_id, platform, variant, body, status          |
| ApplicationBlueprint | V1      | id, job_id, steps[], fields[], checklist                         |
| PipelineEntry        | V1      | id, job_id, stage, notes, evidence_refs                          |
| WorkflowRun          | V1      | id, user_id, status, events[], artifacts[]                       |
| Artifact             | V1      | id, run_id, type, path, hash, timestamp                          |
| PipelineStage        | V1      | id, name, order, is_default, color                               |
| Outcome              | V3      | id, job_id, type (interview/offer/reject), attribution           |
| GraphNode            | V3      | id, type, properties, relationships                              |

---

# Success Metrics

| Metric                     | Target                                       | Version |
| -------------------------- | -------------------------------------------- | ------- |
| Jobs extracted per scan    | All available from source pages              | V1      |
| Top 15 relevance           | >80% of top 15 genuinely match preferences   | V1      |
| Strict filter accuracy     | 100% of shown jobs pass mandatory prefs      | V1      |
| Score precision            | XX.XX format, granular distinction           | V1      |
| Contacts found per top job | At least 1 contact for 70%+ of top jobs      | V1      |
| Draft quality              | User accepts >50% of drafts with minor edits | V1      |
| Scan time (single source)  | < 5 minutes                                  | V1      |
| Scan time (10 sources)     | < 10 minutes (with V2 parallelism)           | V2      |

---

# Appendix: Full Agent Taxonomy (35 Agents, Version-Mapped)

| #   | Agent                        | Version | Category      |
| --- | ---------------------------- | ------- | ------------- |
| 1   | Planner Agent                | V1      | Governance    |
| 2   | Policy/Constraint Agent      | V1      | Governance    |
| 3   | Scheduler Agent              | V2      | Governance    |
| 4   | Evaluator Agent              | V2      | Governance    |
| 5   | Incident Agent               | V2      | Governance    |
| 6   | Resume Parser Agent          | V1      | Profile       |
| 7   | Skills Ontology Agent        | V2      | Profile       |
| 8   | Preference Builder Agent     | V1      | Profile       |
| 9   | Persona Builder Agent        | V2      | Profile       |
| 10  | Gap Analysis Agent           | V3      | Profile       |
| 11  | Source Finder Agent          | V2      | Sources       |
| 12  | Source Validator Agent       | V1      | Sources       |
| 13  | Source Self-Heal Agent       | V2      | Sources       |
| 14  | Robots/Terms Awareness Agent | V2      | Sources       |
| 15  | Browser Navigator Agent      | V1      | Browser       |
| 16  | DOM Extractor Agent          | V1      | Browser       |
| 17  | Structured Data Agent        | V2      | Browser       |
| 18  | Screenshot Evidence Agent    | V1      | Browser       |
| 19  | Pagination/Discovery Agent   | V1      | Browser       |
| 20  | Anti-Bot Resilience Agent    | V2      | Browser       |
| 21  | Job Normalizer Agent         | V1      | Normalization |
| 22  | Entity Resolution Agent      | V1      | Normalization |
| 23  | Canonicalizer Agent          | V1      | Normalization |
| 24  | Rule Scorer Agent            | V1      | Ranking       |
| 25  | LLM Ranker Agent             | V1      | Ranking       |
| 26  | Consensus Agent              | V2      | Ranking       |
| 27  | Top-K Curator Agent          | V1      | Ranking       |
| 28  | Freshness Agent              | V2      | Ranking       |
| 29  | Contact Strategy Agent       | V1      | Contacts      |
| 30  | People Search Agent          | V1      | Contacts      |
| 31  | Email Pattern Agent          | V2      | Contacts      |
| 32  | Contact Verifier Agent       | V1      | Contacts      |
| 33  | Outreach Writer Agent        | V1      | Outreach      |
| 34  | Personalization Agent        | V1      | Outreach      |
| 35  | Application Blueprint Agent  | V1      | Application   |

**V1 count: 19 agents** | V2 count: 12 agents | V3 count: 4 agents

---

_Document fully locked. All follow-up questions resolved. Ready to build._
