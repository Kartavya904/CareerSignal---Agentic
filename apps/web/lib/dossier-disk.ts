/**
 * Persist each Deep Company Dossier run to disk.
 * Root folder: data_company_dossier/
 * Per run: <companySlug>_<YYYY-MM-DD-HH-mm-ss>/
 *   metadata.json, memory.json, content_hashes.json,
 *   pages/<url_slug>/raw.html, cleaned.html, chunks.json, embeddings.json, chunk_scores.json, focused_content.html
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { DossierDiskWriter } from '@careersignal/agents';

const ROOT = path.join(process.cwd(), '..', '..', 'data_company_dossier');

function companySlugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
  return slug || 'company';
}

function datetimeSlug(): string {
  return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '-');
}

/**
 * Create run folder name: acme-corp_2026-02-28-14-30-00
 */
export function getDossierRunFolderName(companyName: string): string {
  const slug = companySlugFromName(companyName);
  return `${slug}_${datetimeSlug()}`;
}

/** Resolve absolute path to a run folder (does not create it). */
export function getDossierRunFolderPath(folderName: string): string {
  return path.join(ROOT, folderName);
}

/** Resolve absolute path to a page subfolder: runFolder/pages/urlSlug */
export function getDossierPageDir(folderName: string, urlSlug: string): string {
  return path.join(ROOT, folderName, 'pages', urlSlug);
}

/**
 * Write only raw.html and cleaned.html for a page (e.g. before RAG writes the rest to the same dir).
 */
export async function writeDossierPageRawAndCleaned(
  folderName: string,
  urlSlug: string,
  rawHtml: string,
  cleanedHtml: string,
): Promise<void> {
  await ensureDossierRunFolder(folderName);
  const dir = getDossierRunFolderPath(folderName);
  const pageDir = path.join(dir, 'pages', urlSlug);
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, 'raw.html'), rawHtml, 'utf-8');
  await writeFile(path.join(pageDir, 'cleaned.html'), cleanedHtml, 'utf-8');
  await updateDossierContentHashes(folderName, [
    `pages/${urlSlug}/raw.html`,
    `pages/${urlSlug}/cleaned.html`,
  ]);
}

/** Ensure root and run folder exist. */
export async function ensureDossierRunFolder(folderName: string): Promise<void> {
  if (!existsSync(ROOT)) {
    await mkdir(ROOT, { recursive: true });
  }
  const dir = getDossierRunFolderPath(folderName);
  await mkdir(dir, { recursive: true });
}

async function computeFileHash(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Update content_hashes.json for a set of paths relative to the run folder.
 * Paths can be nested, e.g. "metadata.json", "pages/abc/chunks.json".
 */
export async function updateDossierContentHashes(
  folderName: string,
  relativePaths: string[],
): Promise<void> {
  const dir = getDossierRunFolderPath(folderName);
  if (!existsSync(ROOT)) {
    await mkdir(ROOT, { recursive: true });
  }
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

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

export interface DossierRunMetadata {
  companyName: string;
  seedUrl?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  finalCoverage?: number | null;
  finalStatus?: string | null;
}

export async function saveDossierMetadata(
  folderName: string,
  metadata: DossierRunMetadata,
): Promise<void> {
  await ensureDossierRunFolder(folderName);
  const dir = getDossierRunFolderPath(folderName);
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
  await updateDossierContentHashes(folderName, ['metadata.json']);
}

export interface DossierMemoryField {
  value: unknown;
  confidence: number;
  sourceUrls: string[];
}

export interface DossierMemory {
  updatedAt: string;
  coverage: { ratio: number; missing: string[] };
  fields: Record<string, DossierMemoryField>;
  visitedUrls: string[];
  discoveredUrls?: string[];
  urlsToVisit?: string[];
  urlsToVisitMissingFields?: string[];
  lastExtractionByUrl?: Record<string, string>;
}

export async function readDossierMemory(folderName: string): Promise<DossierMemory | null> {
  const dir = getDossierRunFolderPath(folderName);
  const memoryPath = path.join(dir, 'memory.json');
  if (!existsSync(memoryPath)) return null;
  try {
    const raw = await readFile(memoryPath, 'utf-8');
    return JSON.parse(raw) as DossierMemory;
  } catch {
    return null;
  }
}

export async function writeDossierMemory(folderName: string, memory: DossierMemory): Promise<void> {
  await ensureDossierRunFolder(folderName);
  const dir = getDossierRunFolderPath(folderName);
  memory.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, 'memory.json'), JSON.stringify(memory, null, 2), 'utf-8');
  await updateDossierContentHashes(folderName, ['memory.json']);
}

export interface DossierPageArtifacts {
  rawHtml: string;
  cleanedHtml: string;
  chunksJson: unknown;
  embeddingsJson?: unknown;
  chunkScoresJson?: unknown;
  focusedContentHtml: string;
}

/**
 * Save one page's artifacts under pages/<urlSlug>/.
 * urlSlug must be filesystem-safe (e.g. from urlToSlug).
 */
export async function saveDossierPageArtifacts(
  folderName: string,
  urlSlug: string,
  artifacts: DossierPageArtifacts,
): Promise<void> {
  await ensureDossierRunFolder(folderName);
  const dir = getDossierRunFolderPath(folderName);
  const pageDir = path.join(dir, 'pages', urlSlug);
  await mkdir(pageDir, { recursive: true });

  await writeFile(path.join(pageDir, 'raw.html'), artifacts.rawHtml, 'utf-8');
  await writeFile(path.join(pageDir, 'cleaned.html'), artifacts.cleanedHtml, 'utf-8');
  await writeFile(
    path.join(pageDir, 'chunks.json'),
    typeof artifacts.chunksJson === 'string'
      ? artifacts.chunksJson
      : JSON.stringify(artifacts.chunksJson, null, 2),
    'utf-8',
  );
  if (artifacts.embeddingsJson !== undefined) {
    await writeFile(
      path.join(pageDir, 'embeddings.json'),
      typeof artifacts.embeddingsJson === 'string'
        ? artifacts.embeddingsJson
        : JSON.stringify(artifacts.embeddingsJson, null, 2),
      'utf-8',
    );
  }
  if (artifacts.chunkScoresJson !== undefined) {
    await writeFile(
      path.join(pageDir, 'chunk_scores.json'),
      typeof artifacts.chunkScoresJson === 'string'
        ? artifacts.chunkScoresJson
        : JSON.stringify(artifacts.chunkScoresJson, null, 2),
      'utf-8',
    );
  }
  await writeFile(
    path.join(pageDir, 'focused_content.html'),
    artifacts.focusedContentHtml,
    'utf-8',
  );

  const relPaths = [
    `pages/${urlSlug}/raw.html`,
    `pages/${urlSlug}/cleaned.html`,
    `pages/${urlSlug}/chunks.json`,
    `pages/${urlSlug}/focused_content.html`,
  ];
  if (artifacts.embeddingsJson !== undefined) relPaths.push(`pages/${urlSlug}/embeddings.json`);
  if (artifacts.chunkScoresJson !== undefined) relPaths.push(`pages/${urlSlug}/chunk_scores.json`);
  await updateDossierContentHashes(folderName, relPaths);
}

/**
 * Produce a filesystem-safe slug from a URL for use as pages/<slug>/.
 */
export function urlToDossierSlug(url: string, index?: number): string {
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
 * Create a disk writer for the Deep Company Dossier agent (implements DossierDiskWriter).
 */
export function createDossierDiskWriter(): DossierDiskWriter {
  return {
    getRunFolderPath: getDossierRunFolderPath,
    getPageDir: getDossierPageDir,
    ensureRunFolder: ensureDossierRunFolder,
    writePageRawAndCleaned: writeDossierPageRawAndCleaned,
    readMemory: readDossierMemory,
    writeMemory: writeDossierMemory,
    saveMetadata: saveDossierMetadata,
  };
}
