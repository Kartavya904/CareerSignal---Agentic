#!/usr/bin/env node
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local similar to run-blessed-sources-migration.mjs
const envPaths = [
  // repo root .env.local (scripts/ -> db/ -> packages/ -> root)
  path.resolve(__dirname, '../../../.env.local'),
  // fallbacks
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '../.env.local'),
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
    break;
  }
}

const url = process.env.DATABASE_URL;

async function main() {
  if (!url) {
    throw new Error('DATABASE_URL not set; cannot check DB state');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const userRes = await client.query(
    "SELECT email, admin FROM users WHERE email = 'singhk6@mail.uc.edu' LIMIT 1;",
  );

  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'blessed_sources',
        'job_listings_cache',
        'scrape_visited_urls',
        'admin_agent_logs',
        'admin_brain_logs',
        'scrape_state'
      )
    ORDER BY table_name;
  `);

  console.log('USER_ROW:', JSON.stringify(userRes.rows, null, 2));
  console.log('ADMIN_TABLES_PRESENT:', JSON.stringify(tablesRes.rows, null, 2));

  await client.end();
}

main().catch((err) => {
  console.error('DB_CHECK_ERROR:', err);
  process.exit(1);
});
