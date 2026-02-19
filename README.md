# CareerSignal (Agentic)

A semi-autonomous, multi-agent career intelligence platform that discovers jobs, ranks them against your profile, finds the best human contacts per role, and prepares outreach drafts — all under your supervision.

---

## What It Does

1. **You** create a profile (upload resume + set preferences)
2. **You** add sources (company career pages, job boards, or use the 10 built-in defaults)
3. **You** trigger a scan
4. **Agents** hunt:
   - Extract jobs from every source (headless browser automation)
   - Normalize, deduplicate, and rank against your profile
   - Surface the **top 15 per source/company** with match scores (XX.XX precision) and explanations
   - Find the **best 3 contacts** per job (hiring managers, engineering managers, team leads)
   - Draft **2–3 outreach variants** per contact (LinkedIn message, email) with personalization
   - Map application flows into human-readable blueprints
5. **You** review, approve, and act — the system never sends anything without your click

---

## Architecture

### Design Philosophy: Code-First, LLM-Assisted

Agents are **not** thin LLM wrappers. Each agent is a hand-built module with deterministic logic at its core. LLMs (via Ollama, running locally) are used only where they provide genuine value that code alone cannot achieve — natural language understanding, nuanced reasoning, and creative drafting.

~60% of the system is pure code (no LLM calls). The remaining ~40% uses LLM as a tool within a code-controlled pipeline.

### Tech Stack

| Layer              | Technology                               | Notes                                     |
| ------------------ | ---------------------------------------- | ----------------------------------------- |
| Web UI             | Next.js (TypeScript, App Router)         | Server components, approval UX            |
| Database           | PostgreSQL + pgvector                    | Structured data + vector embeddings       |
| LLM Runtime        | Ollama (local models)                    | deepseek-r1:32b, qwen2.5:32b, llama3.1:8b |
| Browser Automation | Playwright (Chromium, headless)          | Job extraction, evidence capture          |
| Orchestration      | DB-backed job queue (V1) → Temporal (V2) | Durable, resumable workflows              |
| Artifact Storage   | Local filesystem (V1) → MinIO (V2)       | HTML snapshots, screenshots, PDFs         |
| Event Bus          | NATS (V2+)                               | Inter-agent event coordination            |

### Agent Taxonomy (V1 — 19 Agents)

| Category      | Agents                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| Governance    | Planner, Policy/Constraint                                                  |
| Profile       | Resume Parser, Preference Builder                                           |
| Sources       | Source Validator                                                            |
| Browser       | Browser Navigator, DOM Extractor, Pagination/Discovery, Screenshot Evidence |
| Normalization | Job Normalizer, Entity Resolution, Canonicalizer                            |
| Ranking       | Rule Scorer, LLM Ranker, Top-K Curator                                      |
| Contacts      | Contact Strategy, People Search, Contact Verifier                           |
| Outreach      | Outreach Writer, Personalization                                            |
| Application   | Application Blueprint                                                       |

---

## Directory Structure

```
CareerSignal - Agentic/
│
├── apps/
│   └── web/                    # Next.js web application (UI + API routes)
│
├── agents/
│   ├── planner/                # Central planner agent + workflow orchestration
│   ├── profile/                # Resume Parser, Preference Builder agents
│   ├── browser/                # Browser Navigator, DOM Extractor, Pagination, Screenshot agents
│   ├── normalize/              # Job Normalizer, Entity Resolution, Canonicalizer agents
│   ├── rank/                   # Rule Scorer, LLM Ranker, Top-K Curator agents
│   ├── contacts/               # Contact Strategy, People Search, Contact Verifier agents
│   ├── outreach/               # Outreach Writer, Personalization agents
│   ├── apply/                  # Application Blueprint agent
│   └── shared/                 # Common agent utilities, Ollama client, base interfaces
│
├── packages/
│   ├── schemas/                # Zod schemas for all entities (Job, Contact, Profile, etc.)
│   ├── db/                     # PostgreSQL client, migrations, query helpers
│   ├── vector/                 # pgvector embedding utilities, similarity search
│   ├── llm/                    # Ollama model router, prompt templates, response parsers
│   ├── tools/                  # Browser tools, HTML parsers, HTTP fetchers
│   └── core/                   # Shared domain logic, constants, utilities
│
├── evals/
│   ├── datasets/               # Golden test fixtures (saved HTML, expected outputs)
│   └── harness/                # Evaluation runner, metrics collection
│
├── artifacts/
│   └── runs/                   # Per-run artifact storage (HTML snapshots, screenshots, extracts)
│
├── docs/
│   └── architecture/           # Architecture Decision Records (ADRs), system diagrams
│
├── scripts/                    # Dev scripts (seed data, run agents manually, utilities)
│
├── infra/
│   └── docker/                 # Docker Compose for PostgreSQL + pgvector
│
├── miscellaneous/              # Project plans, scope documents, archived experiments
│   ├── plan.md                 # Original project plan (source of truth for vision)
│   └── project_scope.md        # Locked-down scope with all decisions (V1/V2/V3)
│
├── .cursorrules                # Cursor IDE rules for consistent AI-assisted development
└── README.md                   # This file
```

---

## Prerequisites

Before starting development, ensure the following are installed and running:

### Required

- **Node.js** >= 20.x (LTS) — [nodejs.org](https://nodejs.org/)
- **npm** >= 10.x (comes with Node.js)
- **PostgreSQL** >= 15 with **pgvector** extension — [pgvector setup](https://github.com/pgvector/pgvector)
- **Ollama** — [ollama.com](https://ollama.com/) with the following models pulled:
  - `deepseek-r1:32b-qwen-distill-q4_K_M` (reasoning, scoring, planning)
  - `qwen2.5:32b-instruct-q4_K_M` (extraction, drafting)
  - `qwen2.5-coder:32b-instruct-q4_K_M` (code generation, selector building)
  - `llama3.1:8b-instruct-q4_K_M` (fast bulk tasks — normalization, validation)
- **Playwright** (installed via npm, Chromium auto-downloaded)

### Hardware Requirements

| Component | Minimum        | Recommended (this project)      |
| --------- | -------------- | ------------------------------- |
| RAM       | 32 GB          | 64 GB DDR5                      |
| GPU       | 8 GB VRAM      | NVIDIA RTX 5070 Ti (16 GB VRAM) |
| CPU       | 8 cores        | Intel i9-12900K (16C/24T)       |
| Disk      | 50 GB free SSD | 100 GB+ SSD                     |

### Optional (V2+)

- **Docker** — for containerized Postgres, MinIO, NATS
- **Temporal** — self-hosted workflow engine
- **Ray** — parallel agent execution cluster
- **NATS** — event bus for inter-agent messaging
- **MinIO** — S3-compatible object storage for artifacts

---

## Quick Start

> **Status:** Phase 0 complete. App runs with profile, sources, and runs (scan trigger). Agents not yet implemented.

```bash
# 1. Verify prerequisites
node --version        # >= 20.x
npm --version         # >= 10.x
psql --version        # >= 15.x (or use Docker below)

# 2. Install dependencies
npm install

# 3. Start PostgreSQL (with pgvector). From repo root:
docker compose -f infra/docker/docker-compose.yml up -d
# Wait for DB to be ready, then push schema:
npm run db:migrate
# (If your local Postgres uses different credentials, set DATABASE_URL or edit packages/db/package.json db:push script.)

# 4. Copy env and run the app
cp .env.example .env.local   # optional; defaults work for local Docker Postgres
npm run dev
```

Open http://localhost:3000. You can create a profile, add sources, and trigger a run (scan). The first request creates the default user and seeds 10 blessed job-board sources.

---

## Core Workflows

### Workflow 1: Scan & Rank

```
User triggers scan
  → Validate sources (URL alive?)
  → Browser navigates to each source
  → Extract ALL job listings (pagination, load-more)
  → Normalize to canonical Job schema
  → Deduplicate (fuzzy title + company match)
  → Rule Scorer: deterministic scoring (visa, location, seniority, skills)
  → LLM Ranker: deep reasoning via Ollama (nuance, explanation)
  → Combined score (40% rule + 60% LLM)
  → Strict filter applied (global setting — exclude mismatches)
  → Top 15 per source/company surfaced
```

### Workflow 2: Contact Hunt

```
For each top-15 job:
  → Contact Strategy Agent picks archetype (HM > EM > TL > Recruiter > Founder)
  → People Search Agent scans public web (company pages, LinkedIn, GitHub, conferences, blogs)
  → Contact Verifier validates relevance + assigns confidence score
  → Top 3 contacts per job stored with evidence trails
```

### Workflow 3: Draft Outreach

```
For each job + contact pair:
  → Detect platform (LinkedIn, email)
  → Generate 2–3 draft variants (concise, warm, technical)
  → Personalize with job/company-specific hooks
  → Apply platform character limits automatically
  → User reviews, edits, copies to clipboard
```

### Workflow 4: Application Blueprint

```
User requests blueprint for a specific job:
  → Navigate to apply URL (Playwright)
  → Extract form structure (fields, steps, required docs)
  → Map user profile fields to form fields
  → Generate human-readable checklist
  → User follows blueprint manually
```

---

## Scoring System

Match scores use **XX.XX precision** (0.00 – 99.99) for granular ranking distinction.

| Component       | Weight | Method                                             |
| --------------- | ------ | -------------------------------------------------- |
| Rule Score      | 40%    | Deterministic: binary checks + dimension scores    |
| LLM Score       | 60%    | Reasoning via Ollama: profile-to-job deep analysis |
| **Final Score** | 100%   | Weighted combination, with strict filter gate      |

### Mandatory Preference Dimensions (Strict Filter)

When strict mode is enabled (global setting), jobs **must match all three** to appear:

1. **Work Authorization** — visa/sponsorship compatibility
2. **Location** — geographic match (US, international, remote)
3. **Seniority** — level alignment

---

## Contact Priority Ranking

When discovering contacts for a job, the system prioritizes in this order:

| Priority | Type                            | Best For                    |
| -------- | ------------------------------- | --------------------------- |
| 1        | Hiring Manager                  | Direct decision-maker       |
| 2        | Engineering Manager             | Understands team needs      |
| 3        | Team Lead / Senior Engineer     | Peer-level, insider context |
| 4        | Technical Recruiter             | Owns the req                |
| 5        | University/Campus Recruiter     | Entry-level roles           |
| 6        | Founder                         | Startups, small companies   |
| 7        | Fallback (any reachable person) | Last resort                 |

---

## Versioning Roadmap

### V1 — MVP (~1 week)

Full vertical slice: Profile → Sources → Scan → Rank → Contact → Draft → Track

- 19 agents, 4 workflows
- Single Playwright instance (sequential source scanning)
- Ollama local models for all LLM tasks
- PostgreSQL + pgvector for storage
- Local filesystem for artifacts

### V2 — Seriously Agentic (weeks/months)

- Parallel browser swarm (3–10 workers via Ray)
- Self-healing source discovery and validation
- ATS reverse-engineering library (Workday, Greenhouse, Lever, etc.)
- Multi-step contact enrichment (email pattern inference + verification)
- Competing hypothesis agents (multiple extractors + rankers, consensus)
- Weekly/daily digests and pipeline reminders

### V3 — Research-Grade (long-term)

- Multi-user tenancy with privacy isolation
- Graph memory (relationship graph: Company ↔ Team ↔ Person ↔ Job)
- Outcome-driven optimization (what sources yield interviews, which messages convert)
- Offer simulation + negotiation agent
- Multi-modal parsing (PDFs, images, screenshots via local vision models)
- Agent marketplace (enable/disable agent packs, bring-your-own tools)

---

## Key Principles

- **Semi-autonomous:** Agents act within constraints. No auto-sending emails, no auto-submitting applications. User approves all irreversible actions.
- **Evidence-backed:** Every claim carries source URLs, extracted snippets, confidence scores, and timestamps.
- **Code-first:** Agents are hand-built modules with deterministic logic. LLM is a tool, not the brain.
- **$0 budget:** Everything runs locally. No paid APIs, no cloud services, no subscriptions.
- **Reproducible:** Every workflow run has a run_id, structured logs, stored artifacts, and replay capability.

---

## Documentation

| Document                                                           | Purpose                                           |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| [`miscellaneous/plan.md`](miscellaneous/plan.md)                   | Original project plan and vision                  |
| [`miscellaneous/project_scope.md`](miscellaneous/project_scope.md) | Locked-down scope with all decisions (V1/V2/V3)   |
| [`docs/architecture/`](docs/architecture/)                         | ADRs, system diagrams, threat model (coming soon) |
