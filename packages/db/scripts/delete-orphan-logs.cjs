/**
 * Delete orphan rows in application_assistant_analysis_logs and application_assistant_feedback
 * (analysis_id not in application_assistant_analyses). Run once if db:push fails with FK violation.
 *
 * Usage: node scripts/delete-orphan-logs.cjs   (from packages/db)
 * Or: node packages/db/scripts/delete-orphan-logs.cjs   (from repo root)
 */
const pg = require('pg');
const path = require('path');
const fs = require('fs');

const rootEnv = path.resolve(__dirname, '../../../.env.local');
if (fs.existsSync(rootEnv)) {
  const content = fs.readFileSync(rootEnv, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/careersignal';

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const r1 = await client.query(`
      DELETE FROM application_assistant_analysis_logs
      WHERE analysis_id NOT IN (SELECT id FROM application_assistant_analyses)
    `);
    const r2 = await client.query(`
      DELETE FROM application_assistant_feedback
      WHERE analysis_id NOT IN (SELECT id FROM application_assistant_analyses)
    `);
    console.log('Deleted orphan logs:', r1.rowCount, '| orphan feedback:', r2.rowCount);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
