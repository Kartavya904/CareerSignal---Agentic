#!/usr/bin/env node
/**
 * Seed 2 test job postings and their companies for the Deep Outreach Research pipeline.
 * - Job 1: Hudson River Trading — Software Engineer (C++ or Python) - 2026 Grads (from application assistant run)
 * - Job 2: IBM — one sample job (different company)
 *
 * Run from repo root after migration:
 *   node packages/db/scripts/seed-outreach-test-jobs.mjs
 * Or from packages/db:
 *   node scripts/seed-outreach-test-jobs.mjs
 *
 * Uses DATABASE_URL from .env or .env.local (loads from repo root or cwd).
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPaths = [
    path.resolve(__dirname, '../../../.env.local'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (m) {
          const key = m[1].trim();
          let val = m[2].trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          process.env[key] = val;
        }
      }
      return;
    }
  }
}

function normalizeCompanyName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function normalizeDedupeKey(url) {
  try {
    const u = new URL(url);
    return u.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.replace(/\/$/, '').toLowerCase();
  }
}

const TEST_ENTRIES = [
  {
    company: {
      name: 'Hudson River Trading',
      url: 'https://www.hudsonrivertrading.com/',
      websiteDomain: 'hudsonrivertrading.com',
    },
    job: {
      title: 'Software Engineer (C++ or Python) - 2026 Grads',
      jobUrl:
        'https://www.hudsonrivertrading.com/hrt-job/software-engineer-c-or-python-2026-grads-3/',
      applyUrl:
        'https://www.hudsonrivertrading.com/hrt-job/software-engineer-c-or-python-2026-grads-3/',
      location: 'London | New York | Singapore',
      employmentType: 'Full-Time',
      descriptionText:
        'About HRT Hudson River Trading is a multi-asset class quantitative trading firm that provides liquidity on global markets and directly to our clients.',
    },
  },
  {
    company: {
      name: 'IBM',
      url: 'https://www.ibm.com/',
      websiteDomain: 'ibm.com',
    },
    job: {
      title: 'Software Engineer (sample)',
      jobUrl: 'https://jobs.ibm.com/',
      applyUrl: 'https://jobs.ibm.com/',
      location: null,
      employmentType: null,
      descriptionText: 'Sample job for outreach pipeline testing.',
    },
  },
];

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL not set. Set it in .env or .env.local and run again.');
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  for (const { company: companyInput, job: jobInput } of TEST_ENTRIES) {
    const normalizedName = normalizeCompanyName(companyInput.name);

    // Check company exists
    const companyRes = await client.query(
      'SELECT id, name FROM companies WHERE normalized_name = $1 AND type = $2 LIMIT 1',
      [normalizedName, 'COMPANY'],
    );
    let companyId;
    if (companyRes.rows.length > 0) {
      companyId = companyRes.rows[0].id;
      console.log(`Company already exists: ${companyInput.name} (${companyId})`);
    } else {
      const insertCompany = await client.query(
        `INSERT INTO companies (
          type, name, normalized_name, url, kind, is_priority_target, enabled_for_scraping,
          enrichment_status, job_count_total, job_count_open, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING id, name`,
        [
          'COMPANY',
          companyInput.name,
          normalizedName,
          companyInput.url || `https://${companyInput.websiteDomain || 'unknown'}/`,
          'APPLICATION_ASSISTANT',
          true,
          false,
          'DONE',
          0,
          0,
        ],
      );
      companyId = insertCompany.rows[0].id;
      console.log(`Inserted company: ${companyInput.name} (${companyId})`);
    }

    const dedupeKey = normalizeDedupeKey(jobInput.applyUrl);

    // Check job listing exists
    const jobRes = await client.query(
      'SELECT id, title FROM job_listings WHERE dedupe_key = $1 LIMIT 1',
      [dedupeKey],
    );
    if (jobRes.rows.length > 0) {
      console.log(`Job listing already exists: ${jobInput.title} (${jobRes.rows[0].id})`);
    } else {
      await client.query(
        `INSERT INTO job_listings (
          company_id, title, job_url, apply_url, dedupe_key, location, employment_type,
          description_text, status, first_seen_at, last_seen_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW(), NOW())`,
        [
          companyId,
          jobInput.title,
          jobInput.jobUrl || jobInput.applyUrl,
          jobInput.applyUrl,
          dedupeKey,
          jobInput.location ?? null,
          jobInput.employmentType ?? null,
          jobInput.descriptionText ?? null,
          'OPEN',
        ],
      );
      console.log(`Inserted job listing: ${jobInput.title} (dedupe_key: ${dedupeKey})`);
    }
  }

  await client.end();
  console.log('Done. Two companies and two job listings are ready for outreach test links.');
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
