#!/usr/bin/env node
/**
 * Runs the blessed_sources data migration (0007_replace_blessed_sources.sql).
 * Loads DATABASE_URL from ../../.env.local and executes the SQL.
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Load .env.local from repo root (when run from packages/db: ../../.env.local)
  const envPaths = [
    path.resolve(__dirname, '../../.env.local'),
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
      console.log('Loaded env from', envPath);
      break;
    }
  }

  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/careersignal';
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set; using default. Set it in .env.local to use your DB.');
  }

  const sqlPath = path.join(__dirname, '../drizzle/0007_replace_blessed_sources.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const pool = new pg.Pool({ connectionString });
  try {
    await pool.query(sql);
    console.log('Migration 0007_replace_blessed_sources completed: blessed_sources replaced.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
