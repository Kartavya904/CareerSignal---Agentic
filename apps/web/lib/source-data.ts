/**
 * Persistent HTML capture storage for scraped sources.
 *
 * Folder structure (project root):
 *   data_sources/
 *     <slug>/
 *       captures/
 *         <type>/         ← page type subfolder (listing, detail, etc.)
 *           <id>.html          ← raw capture
 *           <id>-cleaned.html  ← cleaned capture (after HTML Cleanup Agent)
 *       manifest.json   ← single source of truth for all captures
 *
 * Captures are paired: raw <id>.html ↔ cleaned <id>-cleaned.html, same id.
 * Manifest tracks type, depth, filenameCleaned, etc.
 * Keeps the last MAX_CAPTURES per source to avoid unbounded disk growth.
 */

import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { PageType } from '@careersignal/agents';

const DATA_SOURCES_ROOT = path.join(process.cwd(), '..', '..', 'data_sources');
const MAX_CAPTURES = 30;

export interface CaptureEntry {
  id: string;
  timestamp: string;
  url: string;
  htmlChars: number;
  jobsExtracted: number;
  strategy: string;
  filename: string;
  filenameCleaned?: string;
  type: PageType | 'unknown';
  depth: number;
  normalizedUrl?: string;
}

interface SourceManifest {
  source: string;
  captures: CaptureEntry[];
}

function slugDir(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return path.join(DATA_SOURCES_ROOT, safe);
}

function capturesDir(slug: string): string {
  return path.join(slugDir(slug), 'captures');
}

function typeCapturesDir(slug: string, type: string): string {
  return path.join(capturesDir(slug), type);
}

function manifestPath(slug: string): string {
  return path.join(slugDir(slug), 'manifest.json');
}

async function ensureDirs(slug: string, type: string): Promise<void> {
  const dir = typeCapturesDir(slug, type);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function readManifest(slug: string): Promise<SourceManifest> {
  const p = manifestPath(slug);
  if (!existsSync(p)) {
    return { source: slug, captures: [] };
  }
  try {
    const raw = await readFile(p, 'utf-8');
    return JSON.parse(raw) as SourceManifest;
  } catch {
    return { source: slug, captures: [] };
  }
}

async function writeManifest(slug: string, manifest: SourceManifest): Promise<void> {
  const dir = slugDir(slug);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(manifestPath(slug), JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Guess initial page type from URL before classification runs.
 * This is just for folder placement; the real type comes from the classifier.
 */
function guessTypeFromUrl(url: string): PageType | 'unknown' {
  const lower = url.toLowerCase();
  if (/\/jobs\/\d+-/.test(lower) || /\/job\/\d+/.test(lower) || /\/jobs\/view\/\d+/.test(lower)) {
    return 'detail';
  }
  if (lower.endsWith('/jobs') || lower.includes('/jobs?') || lower.includes('/jobs/search')) {
    return 'listing';
  }
  if (/\/company\/[^/]+\/jobs/.test(lower)) {
    return 'company_careers';
  }
  if (/\/company\/[^/]+\/?$/.test(lower)) {
    return 'company_careers';
  }
  if (/[?&]page=\d+/.test(lower) && !/page=1\b/.test(lower)) {
    return 'pagination';
  }
  if (/\/role\/|\/category\/|\/department\//.test(lower)) {
    return 'category_listing';
  }
  return 'listing';
}

/**
 * Save a raw captured HTML page for a source.
 * Stores under captures/<type_guess>/<id>.html.
 * Returns the capture entry (type may be updated later by classifier).
 */
export async function saveSourceCapture(
  slug: string,
  url: string,
  html: string,
  meta: {
    jobsExtracted: number;
    strategy: string;
    depth?: number;
    type?: PageType | 'unknown';
    normalizedUrl?: string;
  },
): Promise<CaptureEntry> {
  const type = meta.type ?? guessTypeFromUrl(url);
  await ensureDirs(slug, type);

  const now = new Date();
  const id = now.toISOString().replace(/[:.]/g, '-');
  const filename = `${id}.html`;
  const filePath = path.join(typeCapturesDir(slug, type), filename);

  await writeFile(filePath, html, 'utf-8');

  const entry: CaptureEntry = {
    id,
    timestamp: now.toISOString(),
    url,
    htmlChars: html.length,
    jobsExtracted: meta.jobsExtracted,
    strategy: meta.strategy,
    filename,
    type,
    depth: meta.depth ?? 0,
    normalizedUrl: meta.normalizedUrl,
  };

  const manifest = await readManifest(slug);
  manifest.captures.push(entry);

  while (manifest.captures.length > MAX_CAPTURES) {
    const oldest = manifest.captures.shift()!;
    const oldPath = path.join(typeCapturesDir(slug, oldest.type), oldest.filename);
    try {
      await unlink(oldPath);
    } catch {
      // Already deleted or inaccessible
    }
    if (oldest.filenameCleaned) {
      const cleanedPath = path.join(typeCapturesDir(slug, oldest.type), oldest.filenameCleaned);
      try {
        await unlink(cleanedPath);
      } catch {
        // Already deleted
      }
    }
  }

  await writeManifest(slug, manifest);
  return entry;
}

/**
 * Save cleaned HTML for an existing capture. Updates manifest with filenameCleaned.
 */
export async function saveCleanedCapture(
  slug: string,
  captureId: string,
  cleanedHtml: string,
): Promise<CaptureEntry | null> {
  const manifest = await readManifest(slug);
  const entry = manifest.captures.find((c) => c.id === captureId);
  if (!entry) return null;

  const filenameCleaned = `${captureId}-cleaned.html`;
  const filePath = path.join(typeCapturesDir(slug, entry.type), filenameCleaned);
  await ensureDirs(slug, entry.type);
  await writeFile(filePath, cleanedHtml, 'utf-8');

  entry.filenameCleaned = filenameCleaned;
  await writeManifest(slug, manifest);
  return entry;
}

/**
 * Update the page type for a capture in the manifest.
 * Does NOT move files — manifest is the source of truth for type.
 * (Files stay in original type folder; readers use manifest.)
 */
export async function updateCaptureType(
  slug: string,
  captureId: string,
  newType: PageType,
  jobsExtracted?: number,
): Promise<CaptureEntry | null> {
  const manifest = await readManifest(slug);
  const entry = manifest.captures.find((c) => c.id === captureId);
  if (!entry) return null;

  entry.type = newType;
  if (jobsExtracted !== undefined) {
    entry.jobsExtracted = jobsExtracted;
  }
  await writeManifest(slug, manifest);
  return entry;
}

/**
 * Get the latest capture entry for a source, or null if none.
 */
export async function getLatestCapture(slug: string): Promise<CaptureEntry | null> {
  const manifest = await readManifest(slug);
  return manifest.captures.length > 0 ? manifest.captures[manifest.captures.length - 1]! : null;
}

/**
 * Read raw HTML from a specific capture.
 */
export async function readCaptureHtml(slug: string, captureId: string): Promise<string | null> {
  const manifest = await readManifest(slug);
  const entry = manifest.captures.find((c) => c.id === captureId);
  if (!entry) return null;
  const filePath = path.join(typeCapturesDir(slug, entry.type), entry.filename);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, 'utf-8');
}

/**
 * Read cleaned HTML from a specific capture.
 */
export async function readCleanedCaptureHtml(
  slug: string,
  captureId: string,
): Promise<string | null> {
  const manifest = await readManifest(slug);
  const entry = manifest.captures.find((c) => c.id === captureId);
  if (!entry?.filenameCleaned) return null;
  const filePath = path.join(typeCapturesDir(slug, entry.type), entry.filenameCleaned);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, 'utf-8');
}

/**
 * Read the most recent capture HTML that had > 0 jobs extracted, or the latest.
 */
export async function readBestCaptureHtml(
  slug: string,
): Promise<{ html: string; entry: CaptureEntry } | null> {
  const manifest = await readManifest(slug);
  if (manifest.captures.length === 0) return null;

  const withJobs = manifest.captures.filter((c) => c.jobsExtracted > 0);
  const entry =
    withJobs.length > 0
      ? withJobs[withJobs.length - 1]!
      : manifest.captures[manifest.captures.length - 1]!;

  // Prefer cleaned HTML if available
  if (entry.filenameCleaned) {
    const cleanedPath = path.join(typeCapturesDir(slug, entry.type), entry.filenameCleaned);
    if (existsSync(cleanedPath)) {
      const html = await readFile(cleanedPath, 'utf-8');
      return { html, entry };
    }
  }

  const filePath = path.join(typeCapturesDir(slug, entry.type), entry.filename);
  if (!existsSync(filePath)) return null;
  const html = await readFile(filePath, 'utf-8');
  return { html, entry };
}

/**
 * List all capture entries for a source.
 */
export async function listCaptures(slug: string): Promise<CaptureEntry[]> {
  const manifest = await readManifest(slug);
  return manifest.captures;
}

/**
 * Build a short context summary of prior captures for Brain analysis.
 */
export async function getCaptureContextSummary(slug: string): Promise<string> {
  const manifest = await readManifest(slug);
  if (manifest.captures.length === 0) return 'No prior captures for this source.';

  const total = manifest.captures.length;
  const withJobs = manifest.captures.filter((c) => c.jobsExtracted > 0);
  const latest = manifest.captures[manifest.captures.length - 1]!;
  const latestWithJobs = withJobs.length > 0 ? withJobs[withJobs.length - 1]! : null;

  const lines = [
    `Prior captures: ${total} total, ${withJobs.length} had jobs.`,
    `Latest: ${latest.timestamp} — ${latest.htmlChars} chars, ${latest.jobsExtracted} jobs (${latest.strategy}), type: ${latest.type}, depth: ${latest.depth}.`,
  ];
  if (latestWithJobs && latestWithJobs.id !== latest.id) {
    lines.push(
      `Last successful: ${latestWithJobs.timestamp} — ${latestWithJobs.htmlChars} chars, ${latestWithJobs.jobsExtracted} jobs, type: ${latestWithJobs.type}.`,
    );
  }
  return lines.join('\n');
}

/**
 * Get the data_sources root directory.
 */
export function getDataSourcesRoot(): string {
  return DATA_SOURCES_ROOT;
}
