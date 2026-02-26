/**
 * Load .env.local (and .env) before any other imports that depend on env (e.g. @careersignal/db).
 * Import this first in scripts: import '../load-env' or import './load-env'
 */
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });
config();
