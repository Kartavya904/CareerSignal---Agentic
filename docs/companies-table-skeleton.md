# Companies Table — Final Structure (Application Assistant)

Single source of truth for the companies table layout. Deep research and the Application Assistant use these fields.

---

## Identity & core (unchanged)

| Column              | Type           | Notes                   |
| ------------------- | -------------- | ----------------------- |
| `id`                | uuid           | PK                      |
| `type`              | entityTypeEnum | COMPANY / SOURCE / etc. |
| `name`              | text           | Required                |
| `normalized_name`   | text           | Required                |
| `url`               | text           | Required                |
| `origin`            | text           | Optional                |
| `kind`              | text           | Optional                |
| `website_domain`    | text           | Optional                |
| `parent_company_id` | uuid           | Optional                |
| `created_at`        | timestamp      |                         |
| `updated_at`        | timestamp      |                         |

---

## Scraping / ops (unchanged)

| Column                    | Type               | Notes |
| ------------------------- | ------------------ | ----- |
| `is_priority_target`      | boolean            |       |
| `enabled_for_scraping`    | boolean            |       |
| `ats_type`                | atsTypeEnum        |       |
| `scrape_strategy`         | scrapeStrategyEnum |       |
| `connector_config`        | jsonb              |       |
| `last_fingerprinted_at`   | timestamp          |       |
| `last_scraped_at`         | timestamp          |       |
| `last_status`             | scrapeStatusEnum   |       |
| `last_error`              | text               |       |
| `scrape_interval_minutes` | integer            |       |
| `scheduler_enabled`       | boolean            |       |
| `test_budget`             | jsonb              |       |
| `job_count_total`         | integer            |       |
| `job_count_open`          | integer            |       |

---

## Enrichment metadata (unchanged)

| Column               | Type      | Notes                                   |
| -------------------- | --------- | --------------------------------------- |
| `enrichment_sources` | jsonb     | `{ urls?: string[], paths?: string[] }` |
| `enrichment_status`  | enum      | PENDING / IN_PROGRESS / DONE / FAILED   |
| `last_enriched_at`   | timestamp |                                         |

---

## Industry & stage

| Column            | Type             | Notes                                                                                            |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| **industries**    | jsonb `string[]` | **Primary first:** first element = primary industry (show starred in UI). Rest = sub-industries. |
| **company_stage** | text             | New. e.g. `startup` \| `growth` \| `scale-up` \| `enterprise`                                    |
| **size_range**    | text             | Kept. e.g. `51-200`, `201-500`                                                                   |
| **founded_year**  | integer          | Kept.                                                                                            |

---

## Location

| Column                        | Type             | Notes                                                                                                                                            |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **headquarters_and_offices**  | text             | **Replaces `hq_location`.** Format: `City, Country \| City, Country \| …` (pipe-separated). Can include multiple HQs and other office locations. |
| **remote_friendly_locations** | jsonb `string[]` | New. Where they allow remote work (e.g. `["United States", "Canada", "UK"]`).                                                                    |

---

## URLs

| Column                   | Type | Notes                                |
| ------------------------ | ---- | ------------------------------------ |
| **careers_page_url**     | text | New. Primary careers / jobs page.    |
| **linkedin_company_url** | text | New. Official LinkedIn company page. |

---

## Funding & public

| Column             | Type    | Notes                                                            |
| ------------------ | ------- | ---------------------------------------------------------------- |
| **funding_stage**  | text    | Kept. e.g. Seed, Series A, Series B.                             |
| **public_company** | boolean | Kept. Public vs private.                                         |
| ~~ticker~~         | —       | Keep in DB for compatibility but not emphasized; you don’t care. |

---

## Remote & culture

| Column                  | Type                     | Notes                                                |
| ----------------------- | ------------------------ | ---------------------------------------------------- |
| **remote_policy**       | text                     | Kept. Emphasized. e.g. Remote-first, Hybrid, Onsite. |
| **core_values**         | jsonb `string[]` or text | New. Stated company values.                          |
| **mission_statement**   | text                     | New.                                                 |
| **benefits_highlights** | text                     | New. Summary of benefits (health, PTO, etc.).        |

---

## Hiring & visas (emphasized)

| Column                              | Type                     | Notes                                                                                                                                 |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **sponsorship_signals**             | jsonb                    | Kept. **Emphasized** for visa / sponsorship (H1B etc.).                                                                               |
| **typical_hiring_process**          | text                     | New. Steps and rough timeline.                                                                                                        |
| **interview_process**               | text                     | New. **Accumulating text:** over time deep research appends/updates this so it grows for interview prep in the Application Assistant. |
| **interview_format_hints**          | text or jsonb `string[]` | New. e.g. technical, behavioral, take-home, live coding.                                                                              |
| **hiring_locations**                | jsonb `string[]`         | Kept. Where they hire.                                                                                                                |
| **work_authorization_requirements** | text                     | New. Any stated work authorization requirements.                                                                                      |

---

## Salary & application tips

| Column                                 | Type  | Notes                                                                                                                                                                                  |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **salary_by_level**                    | jsonb | New. Per-level salary so you can show a small table. Shape: `{ "entry": { "min": 80, "max": 120, "currency": "USD", "period": "year" }, "mid": { … }, "senior": { … } }` (or similar). |
| **application_tips_from_careers_page** | text  | New. Tips from careers page / “what we look for”.                                                                                                                                      |

---

## Company description

| Column                       | Type | Notes                                                                                                                                 |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **description_text**         | text | Kept. Short summary (can be derived from long description).                                                                           |
| **long_company_description** | text | New. Long, rich company description; deep research fills this and it can be used to generate or replace the short `description_text`. |

---

## Company & market context

| Column                              | Type             | Notes                                             |
| ----------------------------------- | ---------------- | ------------------------------------------------- |
| **tech_stack_hints**                | jsonb `string[]` | Kept. Languages, frameworks, infra.               |
| **recent_layoffs_or_restructuring** | text             | New. Recent layoffs or restructuring (if known).  |
| **hiring_trend**                    | text             | New. e.g. `growing` \| `stable` \| `contracting`. |

---

## Summary: new vs existing

**New columns to add**

- `company_stage` (text)
- `headquarters_and_offices` (text) — use this instead of `hq_location` in UI; can migrate `hq_location` into it
- `remote_friendly_locations` (jsonb string[])
- `careers_page_url` (text)
- `linkedin_company_url` (text)
- `core_values` (jsonb or text)
- `mission_statement` (text)
- `benefits_highlights` (text)
- `typical_hiring_process` (text)
- `interview_process` (text, accumulating)
- `interview_format_hints` (text or jsonb string[])
- `salary_by_level` (jsonb)
- `application_tips_from_careers_page` (text)
- `work_authorization_requirements` (text)
- `long_company_description` (text)
- `recent_layoffs_or_restructuring` (text)
- `hiring_trend` (text)

**Conventions**

- **industries:** First element = primary industry (star in UI); rest = sub-industries.
- **headquarters_and_offices:** `City, Country | City, Country` (pipe-separated); can include HQs and other offices.
- **interview_process:** Append/update over time as more sources are researched; used for interview prep in Application Assistant.

**Kept, unchanged or de-emphasized**

- `size_range`, `founded_year`, `funding_stage`, `public_company`, `remote_policy`, `sponsorship_signals`, `tech_stack_hints`, `hiring_locations`, `description_text`
- `ticker`: keep in schema but not emphasized in product.
