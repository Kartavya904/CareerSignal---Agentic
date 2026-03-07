#!/usr/bin/env node
/**
 * Reset script: deletes ALL contacts and ALL job listings from the database.
 * Companies are preserved.
 *
 * Run from repo root:
 *   node packages/db/scripts/reset-contacts-and-jobs.mjs
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

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL not set. Set it in .env or .env.local and run again.');
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  // Delete contacts first (may have FK to job_listings or companies)
  const contactsResult = await client.query('DELETE FROM contacts');
  console.log(`Deleted ${contactsResult.rowCount} contact(s).`);

  // Delete job listings (may have FK to companies)
  const jobsResult = await client.query('DELETE FROM job_listings');
  console.log(`Deleted ${jobsResult.rowCount} job listing(s).`);

  // Companies are preserved
  const companiesResult = await client.query('SELECT COUNT(*) as count FROM companies');
  console.log(`Companies preserved: ${companiesResult.rows[0].count} remain.`);

  await client.end();
  console.log('Done. Contacts and job listings have been cleared. Companies remain intact.');
}

main().catch((err) => {
  console.error('Reset error:', err);
  process.exit(1);
});
