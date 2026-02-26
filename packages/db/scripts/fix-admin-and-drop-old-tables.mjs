#!/usr/bin/env node
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPaths = [
  path.resolve(__dirname, '../../../.env.local'),
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
    throw new Error('DATABASE_URL not set; cannot fix DB state');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  console.log('Setting admin=true for singhk6@mail.uc.edu ...');
  await client.query("UPDATE users SET admin = true WHERE email = 'singhk6@mail.uc.edu';");

  console.log('Dropping FKs/columns that reference old admin/blessed tables if they exist ...');
  await client.query(
    'ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_listing_cache_id_job_listings_cache_id_fk;',
  );
  await client.query('ALTER TABLE jobs DROP COLUMN IF EXISTS job_listing_cache_id;');
  await client.query(
    'ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_blessed_source_id_blessed_sources_id_fk;',
  );
  await client.query('ALTER TABLE sources DROP COLUMN IF EXISTS blessed_source_id;');

  console.log('Dropping old admin/blessed tables if they exist ...');
  await client.query('DROP TABLE IF EXISTS scrape_visited_urls;');
  await client.query('DROP TABLE IF EXISTS job_listings_cache;');
  await client.query('DROP TABLE IF EXISTS blessed_sources;');
  await client.query('DROP TABLE IF EXISTS admin_agent_logs;');
  await client.query('DROP TABLE IF EXISTS admin_brain_logs;');
  await client.query('DROP TABLE IF EXISTS scrape_state;');

  await client.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('DB_FIX_ERROR:', err);
  process.exit(1);
});
