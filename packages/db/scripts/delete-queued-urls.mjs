#!/usr/bin/env node
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
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
    throw new Error('DATABASE_URL not set; cannot connect to DB');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  console.log('Deleting all uploaded application analysis queued URLs...');
  const res = await client.query("DELETE FROM application_analysis_queue;");
  
  console.log(`Successfully deleted ${res.rowCount} queued URLs.`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
