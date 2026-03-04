/**
 * Persist each Deep Outreach Research run to disk.
 * Root folder: data_outreach_research/
 * Per run: <jobSlug>_<YYYY-MM-DD-HH-mm-ss>/
 *   memory.json, content_hashes.json,
 *   pages/<url_slug>/raw.html, cleaned.html, optional chunks.json, embeddings.json, focused_content.html (RAG).
 * Memory shape: visitedUrls, urlsToVisit, discoveredUrls, steps, contacts, drafts (like company dossier).
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const ROOT = path.join(process.cwd(), '..', '..', 'data_outreach_research');

function jobSlugFromUrlOrTitle(urlOrTitle: string): string {
  try {
    const pathPart = urlOrTitle.startsWith('http') ? new URL(urlOrTitle).pathname : urlOrTitle;
    const u = pathPart.replace(/\/$/, '').split('/').pop() ?? '';
    const slug = (u || urlOrTitle)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30);
    return slug || 'outreach';
  } catch {
    return 'outreach';
  }
}

function datetimeSlug(): string {
  return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '-');
}

/**
 * Create run folder name: job-slug_2026-02-28-14-30-00
 */
export function getOutreachRunFolderName(jobUrlOrTitle: string): string {
  const slug = jobSlugFromUrlOrTitle(jobUrlOrTitle);
  return `${slug}_${datetimeSlug()}`;
}

/** Resolve absolute path to a run folder (does not create it). */
export function getOutreachRunFolderPath(folderName: string): string {
  return path.join(ROOT, folderName);
}

/** Resolve absolute path to a page subfolder: runFolder/pages/urlSlug (like company dossier). */
export function getOutreachPageDir(folderName: string, urlSlug: string): string {
  return path.join(ROOT, folderName, 'pages', urlSlug);
}

/**
 * Produce a filesystem-safe slug from a URL for use as pages/<slug>/.
 */
export function urlToOutreachSlug(url: string, index?: number): string {
  try {
    const u = new URL(url);
    let host = u.hostname.replace(/^www\./, '').toLowerCase();
    const pathPart = u.pathname
      .replace(/\/+/g, '-')
      .replace(/[^a-z0-9-]/gi, '')
      .slice(0, 30);
    const slug = pathPart ? `${host}-${pathPart}` : host;
    const safe = slug.replace(/[^a-z0-9-]/g, '') || 'page';
    return index !== undefined ? `${safe}-${index}` : safe;
  } catch {
    return index !== undefined ? `page-${index}` : 'page';
  }
}

/**
 * Write raw.html and cleaned.html for a visited URL (and update content hashes).
 */
export async function writeOutreachPageRawAndCleaned(
  folderName: string,
  urlSlug: string,
  rawHtml: string,
  cleanedHtml: string,
): Promise<void> {
  await ensureOutreachRunFolder(folderName);
  const dir = getOutreachRunFolderPath(folderName);
  const pageDir = path.join(dir, 'pages', urlSlug);
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, 'raw.html'), rawHtml, 'utf-8');
  await writeFile(path.join(pageDir, 'cleaned.html'), cleanedHtml, 'utf-8');
  await updateOutreachContentHashes(folderName, [
    `pages/${urlSlug}/raw.html`,
    `pages/${urlSlug}/cleaned.html`,
  ]);
}

/** Ensure root and run folder exist. */
export async function ensureOutreachRunFolder(folderName: string): Promise<void> {
  if (!existsSync(ROOT)) {
    await mkdir(ROOT, { recursive: true });
  }
  const dir = getOutreachRunFolderPath(folderName);
  await mkdir(dir, { recursive: true });
}

async function computeFileHash(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Update content_hashes.json for a set of paths relative to the run folder.
 */
export async function updateOutreachContentHashes(
  folderName: string,
  relativePaths: string[],
): Promise<void> {
  const dir = getOutreachRunFolderPath(folderName);
  if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const hashesPath = path.join(dir, 'content_hashes.json');
  let hashes: Record<string, string> = {};
  if (existsSync(hashesPath)) {
    try {
      const raw = await readFile(hashesPath, 'utf-8');
      hashes = JSON.parse(raw) as Record<string, string>;
    } catch {
      hashes = {};
    }
  }

  for (const rel of relativePaths) {
    const full = path.join(dir, rel);
    const h = await computeFileHash(full);
    if (h) hashes[rel] = h;
  }

  await writeFile(hashesPath, JSON.stringify(hashes, null, 2), 'utf-8');
}

/** Per-query tracking: all page-1 results plus the top 2 URLs we chose to visit for contact discovery. */
export interface SearchResultTrackingEntry {
  query: string;
  page1Results: Array<{ url: string; title: string; snippet?: string }>;
  topPickedUrls: string[];
}

export interface OutreachMemory {
  updatedAt: string;
  runFolderName: string;
  /** URLs we have finished visiting (deduped). */
  visitedUrls: string[];
  /** URLs we intend to visit (e.g. top picks from search; drained over time). Like dossier. */
  urlsToVisit?: string[];
  /** All URLs discovered from search page-1 results (for tracking and retry). */
  discoveredUrls?: string[];
  /** For each DDG search: full page-1 results (URLs + titles) and the top 2 URLs we visited. */
  searchResultTracking?: SearchResultTrackingEntry[];
  steps?: Record<
    string,
    { step: string; completedAt?: string; outputSummary?: string; payload?: unknown }
  >;
  contacts?: unknown[];
  drafts?: unknown[];
  /** Priority contact from job body (email/LinkedIn) */
  priorityContact?: unknown;
  /** Strategy output (archetypes, queries) */
  strategy?: unknown;
  /** Raw candidates before verification */
  candidates?: unknown[];
}

export async function readOutreachMemory(folderName: string): Promise<OutreachMemory | null> {
  const dir = getOutreachRunFolderPath(folderName);
  const memoryPath = path.join(dir, 'memory.json');
  if (!existsSync(memoryPath)) return null;
  try {
    const raw = await readFile(memoryPath, 'utf-8');
    return JSON.parse(raw) as OutreachMemory;
  } catch {
    return null;
  }
}

export async function writeOutreachMemory(
  folderName: string,
  memory: OutreachMemory,
): Promise<void> {
  await ensureOutreachRunFolder(folderName);
  const dir = getOutreachRunFolderPath(folderName);
  memory.updatedAt = new Date().toISOString();
  memory.runFolderName = folderName;
  await writeFile(path.join(dir, 'memory.json'), JSON.stringify(memory, null, 2), 'utf-8');
  await updateOutreachContentHashes(folderName, ['memory.json']);
}
