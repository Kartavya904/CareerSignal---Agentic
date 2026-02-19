# revised_plan.md — Greenfield Agentic Multi‑Agent Job + Contact Hunting Platform (Semi‑Autonomous)

**Project codename:** CareerSignal (Agentic)  
**Mode:** Greenfield rebuild from scratch (no legacy assumptions)  
**Primary objective:** A **semi‑autonomous, multi‑agent career intelligence system** that discovers jobs, ranks them with a profile‑aware AI engine, finds the best human contact per role, reverse‑engineers application flows, and prepares outreach/applications for user approval.

---

## 0) North Star

Build a “career operations center” where you:
1. Create/confirm your profile + constraints (visa, location, seniority, industries, etc.)
2. Give sources (company pages, ATS links, job boards, communities)
3. Launch a scan
4. Agents **hunt**:
   - jobs (accurately, with evidence)
   - people (recruiters/hiring managers/teams) to contact for each job
5. System outputs:
   - **Top 15 roles per source/company** (configurable)
   - match score + explanation + citations/evidence
   - best contact(s) + rationale + confidence
   - drafted outreach messages/emails (not auto‑sent)
   - an “application plan” (not auto‑submitted unless explicitly approved)
6. You supervise major actions: outreach send, application submit, and “connect” actions.

---

## 1) Product Principles (what prevents “backend treadmill syndrome”)

### 1.1 Agent-first, not API-first
APIs exist to support agents and UI—not as the main product.

### 1.2 Evidence or it didn’t happen
Every claim (“job exists”, “this is the hiring manager”) must carry:
- source URLs
- extracted snippets (hashed + timestamped)
- confidence + reasoning trace
- fallback options when uncertain

### 1.3 Semi-autonomous gates
Agents can:
- read, crawl, extract, rank, draft, organize
Agents cannot (by default):
- submit applications
- send emails/messages
- perform irreversible actions  
Those require user approval gates.

### 1.4 Self-healing + self-improving
The system learns from failures:
- URL changed → discover new URL
- scraping blocked → switch strategy (API, cached, alternate mirrors)
- ranking wrong → collect feedback + run eval loops

### 1.5 Modular agents, composable workflows
Anything that sounds like “a feature” should be:
- an agent, a tool, or a workflow step (Temporal DAG)
- testable and measurable

---

## 2) Key Capabilities (v1 → v3)

### v1 (MVP you can ship + demo)
- Profile builder + resume parsing
- Sources registry (company pages + boards + aggregators)
- Browser-based job extraction (headless)
- Normalization to a unified Job schema
- AI match scoring + strict preference filter option
- Top-K ranking per source/company
- Contact discovery from public web (team pages, press releases, org charts, GitHub, conference pages, etc.)
- Outreach drafting (LinkedIn-style message + email)
- Application flow “blueprinting” (form extraction + field mapping)
- Tracker: pipeline stages, notes, evidence, drafts

### v2 (seriously agentic)
- Parallel exploration swarm (multiple browser agents with competing hypotheses)
- “Reverse-engineer the ATS” library (Workday/Greenhouse/Lever/SmartRecruiters/etc. as learned patterns)
- Self-healing source discovery and validation
- Multi-step contact enrichment (email pattern inference + verification)
- Weekly digests + reminders + scheduling suggestions (still user-controlled)

### v3 (research-grade + startup-grade)
- Multi-user tenancy + per-user memory + privacy isolation
- Graph memory: relationship graph (company ↔ team ↔ person ↔ job ↔ outreach)
- Outcome-driven optimization (what sources yield interviews, which messages convert)
- Offer simulation + negotiation agent
- Multi-modal: parse PDFs, images, and job page screenshots when needed
- Agent marketplace: enable/disable agent packs; bring-your-own tools

---

## 3) System Architecture (recommended stack for speed + depth)

This is intentionally overpowered—**but staged** so you can start minimal and grow.

### 3.1 Core building blocks
**A) Web App (UI + API Gateway)**
- Next.js (TypeScript) as the product shell
- Server actions / API routes only for:
  - auth
  - orchestration triggers
  - data read/write
  - user approval gates

**B) Agent Runtime**
- Python agents for extraction, parsing, ranking, reasoning (fast iteration)
- TypeScript agents for UI-adjacent logic and shared schemas (optional)

**C) Workflow Orchestration**
- Temporal for durable, resumable workflows (scan runs, enrichment runs, retries)
- Every “run” is a workflow with steps and checkpoints

**D) Distributed Execution**
- Ray for parallel agents (browser swarms, multi-source scans)
- Worker pools by capability: browser, NLP, graph, scoring, enrichment

**E) Data Plane**
- Postgres for structured data
- pgvector for embeddings (semantic search, dedupe, matching)
- Optional Neo4j for relationship graph (people ↔ companies ↔ roles)
- Object store (S3/MinIO) for artifacts: HTML snapshots, PDFs, screenshots

**F) Event Bus**
- NATS (simple) or Kafka (heavy) for events:
  - JobDiscovered
  - JobNormalized
  - JobRanked
  - ContactFound
  - ApprovalRequested
  - DraftGenerated
  - WorkflowFailed

### 3.2 Why this mix?
- Temporal = “your agents will fail and restart” insurance.
- Ray = parallelism without pain.
- Postgres+pgvector = simplest serious memory core.
- Neo4j (optional) = unlocks contact hunting + relationship reasoning.

---

## 4) Human-in-the-Loop Controls (non-negotiable)

### 4.1 Approval gates (default)
- “Create connection request” → requires click
- “Send LinkedIn DM” → requires click + final review
- “Send email” → requires click + final review
- “Submit application” → requires click + final review

### 4.2 Safety valves
- Rate limits per domain
- Run budgets (time, pages, tokens, dollars)
- Per-source allow/deny list
- “Simulation mode” (collect data only; no drafts)

### 4.3 Audit & reproducibility
Every action has:
- inputs (URLs, prompts, constraints)
- outputs (extracted data, drafts)
- timestamps
- agent identity + version
- deterministic replay for failures (where possible)

---

## 5) Memory Model (per-user, hybrid, and disciplined)

### 5.1 Memory layers
1) **Structured memory (Postgres)**
- canonical entities: user, profile, job, person, company, outreach, workflow run

2) **Semantic memory (pgvector)**
- embeddings of:
  - resume chunks
  - job descriptions
  - company blurbs
  - outreach drafts
  - notes and outcomes

3) **Graph memory (Neo4j, optional)**
- relationships:
  - Person WORKS_AT Company
  - Person OWNS Role/Team
  - Job POSTED_BY Company
  - Outreach SENT_TO Person
  - Outcome (Interview/Offer) CAUSED_BY Outreach/Job

4) **Episodic run memory**
- each workflow run stores:
  - what was tried
  - what failed
  - what was learned (patterns)
  - what to attempt next time

### 5.2 Memory scopes
- **User-private:** profile, preferences, outreach history
- **Shared global:** platform fingerprints, extraction recipes, public ATS patterns (no personal data)
- **Agent-local:** scratchpad, short context windows

---

## 6) Agent Taxonomy (35 agents)

### 6.1 Governance + Planning
1. **Planner Agent (Central Brain)** — builds/updates workflow plans; decides which agents to spawn  
2. **Policy/Constraint Agent** — enforces user constraints, budgets, allowlists  
3. **Scheduler Agent** — timing, pacing, and run orchestration (Temporal integration)  
4. **Evaluator Agent** — compares outcomes vs predictions; triggers improvements  
5. **Incident Agent** — failure triage; creates reproducible bug reports from runs

### 6.2 Profile + Preferences
6. **Resume Parser Agent** — extract structured profile from PDF/DOCX/text  
7. **Skills Ontology Agent** — maps skills to canonical taxonomy  
8. **Preference Builder Agent** — interactive preference completion + strictness levels  
9. **Persona Builder Agent** — builds “candidate narrative” used for outreach tone  
10. **Gap Analysis Agent** — identifies skill gaps per target role + learning plan

### 6.3 Source Discovery + Validation
11. **Source Finder Agent** — finds official career pages/ATS endpoints for a company  
12. **Source Validator Agent** — checks URL correctness, freshness, and access viability  
13. **Source Self‑Heal Agent** — when broken, finds replacement URLs and updates registry  
14. **Robots/Terms Awareness Agent** — flags risk; suggests safer alternatives (rate limits, APIs)

### 6.4 Browser + Extraction Swarm
15. **Browser Navigator Agent** — Playwright driver; navigates & captures artifacts  
16. **DOM Extractor Agent** — extracts job cards, links, and metadata from HTML  
17. **Structured Data Agent** — parses JSON‑LD/embedded job data  
18. **Screenshot Evidence Agent** — captures screenshot evidence for claims  
19. **Pagination/Discovery Agent** — explores next pages, filters, search boxes  
20. **Anti‑Bot Resilience Agent** — adapts pacing, headers, retries (no bypass instructions)

### 6.5 Normalization + Dedupe
21. **Job Normalizer Agent** — converts raw extracts to canonical Job schema  
22. **Entity Resolution Agent** — dedupes companies/roles/locations/people  
23. **Canonicalizer Agent** — standardizes titles, seniority, location, employment type

### 6.6 Matching + Ranking
24. **Rule Scorer Agent** — fast, transparent baseline scoring  
25. **LLM Ranker Agent** — deep preference satisfaction + explanation + strict filter  
26. **Consensus Agent** — runs multiple rankers and reconciles differences  
27. **Top‑K Curator Agent** — selects top 15 per source/company; keeps diversity constraints  
28. **Freshness Agent** — downranks stale or reposted listings

### 6.7 Contact Hunting + Outreach
29. **Contact Strategy Agent** — decides which role-contact archetype to find (recruiter, HM, team lead)  
30. **People Search Agent** — hunts names via public web signals (team pages, posts, repos, talks)  
31. **Email Pattern Agent** — infers likely email formats; cross-checks with public evidence  
32. **Contact Verifier Agent** — validates contact relevance + confidence scoring  
33. **Outreach Writer Agent** — drafts LinkedIn message + email variants (not sent)  
34. **Personalization Agent** — injects job-specific hooks and company context

### 6.8 Application Flow Reverse Engineering
35. **Application Blueprint Agent** — maps forms, required fields, uploads, and steps; produces “fill plan” and preview

> Note: This taxonomy is intentionally modular—agents can be toggled, replaced, or merged as the system matures.

---

## 7) Workflows (Temporal DAGs)

### 7.1 “Scan & Rank” (core workflow)
1. Load user profile + constraints
2. Validate sources
3. Spawn browser swarm per source
4. Extract raw listings + evidence artifacts
5. Normalize + dedupe
6. Fetch job detail pages (if needed) for full descriptions
7. Score jobs (rule + LLM)
8. Apply strict preference filter (optional)
9. Select top 15 per source/company
10. Persist results + explanations + evidence

### 7.2 “Contact Hunt” (per job, can run in batch)
1. Identify contact archetype
2. Search public sources for people
3. Rank candidates (relevance + recency + role alignment)
4. Attempt email discovery (public only) + confidence rating
5. Produce contact card + evidence links
6. Draft outreach message/email

### 7.3 “Application Blueprint” (per job)
1. Navigate apply flow (up to pre-submit stage)
2. Extract steps + form schema
3. Map user profile to fields
4. Produce “fill plan” + required items checklist
5. Halt for user approval before any submission

### 7.4 “Pipeline Maintenance”
- statuses, reminders, drafts, interview prep packets, outcome tracking
- never auto-sends without approval

---

## 8) Data Model (high level)

### 8.1 Core entities
- **User**: auth + settings + budgets
- **Profile**: resume-derived structured profile + freeform narrative
- **PreferenceSet**: strict constraints + soft preferences + weights
- **Source**: url + metadata + reliability stats + last-seen signals
- **Company**: canonical company record + intel + ATS fingerprints
- **Job**: canonical job + evidence + content snapshots + freshness
- **Match**: score + flags + explanations + model versions
- **Person**: contact candidate + evidence + confidence
- **OutreachDraft**: variants + tone + personalization + template ids
- **ApplicationBlueprint**: form schema + steps + required artifacts
- **WorkflowRun**: provenance + events + artifacts + outcomes

### 8.2 Artifact store
- HTML snapshots, screenshots, PDFs, extracted text chunks
- hashed and timestamped for reproducibility

---

## 9) Directory Structure (monorepo, agent-native)

```
career-signal-agentic/
├─ apps/
│  ├─ web/                         # Next.js UI (user control center)
│  └─ admin/                       # (optional) ops dashboard
├─ services/
│  ├─ orchestrator/                # Temporal workers + API surface
│  ├─ agent-runtime/               # Ray cluster entrypoints
│  └─ browser-farm/                # Playwright headless orchestration
├─ agents/
│  ├─ planner/                     # central planner, constraint enforcer
│  ├─ browser/                     # navigate/extract/paginate/evidence
│  ├─ normalize/                   # canonicalization, dedupe
│  ├─ rank/                        # rule scorer, LLM rankers, consensus
│  ├─ contacts/                    # people search, verification, email inference
│  ├─ apply/                       # application blueprinting
│  ├─ evaluate/                    # evals, regression tests, feedback loops
│  └─ shared/                      # common agent utils
├─ packages/
│  ├─ schemas/                     # zod/protobuf schemas for events + entities
│  ├─ db/                          # migrations + db client
│  ├─ vector/                      # embeddings + similarity utilities
│  ├─ llm/                         # model router, prompt packs, guardrails
│  ├─ tools/                       # browser tools, parsers, fetchers
│  └─ core/                        # shared domain logic
├─ infra/
│  ├─ docker/                      # compose for local dev
│  ├─ k8s/                         # optional manifests later
│  └─ terraform/                   # optional cloud infra later
├─ evals/
│  ├─ datasets/                    # labeled jobs/preferences, contact truth sets
│  └─ harness/                     # eval runner, metrics dashboards
├─ docs/
│  ├─ architecture/                # ADRs, diagrams, threat model
│  └─ runbooks/                    # ops + debugging
└─ scripts/                        # dev scripts, data imports
```

---

## 10) Tech Choices (default recommendations)

### Minimal “Start Small” Stack (Week 1–2)
- Next.js web app
- Postgres + pgvector
- Playwright (single worker)
- Single-process planner + a few agents
- Queue: simple DB-backed job queue or Redis

### “Serious Agentic” Stack (Week 3+)
- Temporal workflows
- Ray cluster for parallel agents
- NATS event bus
- MinIO object store
- Optional Neo4j graph

### LLM Strategy
- Model router that supports:
  - local models (Ollama) for privacy + cost control
  - hosted models for reliability/quality when needed
- Version all prompts and store model IDs per output.

---

## 11) Policies & Boundaries (important)
- The system should **not** include instructions or mechanisms to bypass security protections (e.g., CAPTCHAs) or violate a site’s terms.  
- Instead, it should:
  - detect blockers
  - slow down / retry with safer pacing
  - prompt the user for manual intervention when necessary
  - prefer official/public endpoints and user-provided sources

This still allows aggressive *engineering* (robustness, retries, alternate sources) without turning the project into an “evasion toolkit.”

---

## 12) Roadmap (phased, modular, measurable)

### Phase 0 — Foundations (2–4 days)
- repo scaffold + monorepo tooling
- core schemas + db migrations
- minimal UI shell (profile, preferences, sources, runs)
- basic event model + run logs

**Exit criteria:** can create a profile + preference set + add sources + start a run.

### Phase 1 — Browser Extraction MVP (1–2 weeks)
- Playwright browser agent
- extractor + normalizer
- evidence artifacts
- basic ranking (rule scorer)
- top-15 per source/company
- tracker UI

**Exit criteria:** real jobs appear with evidence; dedupe works; top-15 list stable.

### Phase 2 — LLM Ranking Engine (1–2 weeks)
- strict preference satisfaction mode
- AI explanations + flags per dimension
- consensus agent (optional)
- “why no matches” diagnosis summary

**Exit criteria:** preference correctness is high; user trusts “all preferences met.”

### Phase 3 — Contact Hunting (2 weeks)
- people search agent + verifier
- confidence scoring + evidence
- outreach drafts (message + email)
- user approval gates + draft storage

**Exit criteria:** for top jobs, system finds credible contacts and produces usable drafts.

### Phase 4 — Application Blueprinting (2 weeks)
- application flow capture (pre-submit)
- form schema extraction
- field mapping + checklist generation
- reusable “ATS blueprints” library

**Exit criteria:** user can open a blueprint and apply quickly with guidance.

### Phase 5 — Distributed + Evaluation (ongoing)
- Temporal + Ray + NATS
- eval harness + regression suites
- feedback loops (what led to interviews)
- agent improvements and new packs

**Exit criteria:** system scales, is debuggable, and improves over time.

---

## 13) “Out of the blue” innovation ideas (optional but spicy)

1) **Multi-agent debate ranking**: 3 independent rankers argue; a judge agent reconciles.  
2) **Self-healing sources**: sources become “living” — updated automatically with confidence + proof.  
3) **Relationship graph**: show the shortest path from you → employee → team → hiring manager.  
4) **Application friction score**: estimate effort/time for each application; optimize for ROI.  
5) **Counterfactual coach**: “If you removed X preference, you’d gain Y jobs.”  
6) **Persona switcher for outreach**: concise, warm, technical, or recruiter-friendly style packs.  
7) **Agent marketplace**: enable “ATS pack”, “Contact pack”, “Salary pack”, “Interview pack”.  
8) **Outcome-driven learning**: agents learn what actually converts for *you* (per user).

---

## 14) Success Metrics (so the project doesn’t drift)

### Accuracy + trust
- % of jobs truly matching strict constraints
- false positives in seniority/visa/location
- evidence completeness rate

### Efficiency
- time-to-top-15 per source
- cost per successful lead (time + tokens + compute)

### Value
- contacts found per 10 top jobs
- outreach drafts accepted by user
- interviews per month attributable to system

---

## 15) What to build first (recommended “Week 1” checklist)

1. Scaffold monorepo + schemas + Postgres
2. Implement “Run” concept (Temporal later; start simple)
3. Build Playwright Browser Navigator Agent
4. Build Job Normalizer + storage
5. Build baseline Rule Scorer + Top-K Curator
6. Build UI: Runs + Results + Evidence viewer

Once this works, everything else compounds.

---

## 16) URLs (reference docs)
- Temporal: https://temporal.io/docs/
- Ray: https://docs.ray.io/
- LangGraph: https://langchain-ai.github.io/langgraph/
- Playwright: https://playwright.dev/docs/intro
- Postgres: https://www.postgresql.org/docs/
- pgvector: https://github.com/pgvector/pgvector
- NATS: https://docs.nats.io/
- Neo4j: https://neo4j.com/docs/
- MinIO: https://min.io/docs/minio/kubernetes/upstream/
