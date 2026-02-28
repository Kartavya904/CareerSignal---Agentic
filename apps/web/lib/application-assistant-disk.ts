/**
 * Persist each Application Assistant run to disk for debugging and re-analysis.
 * Root folder: data_application_assistant/
 * Per run: <userSlug>_<YYYY-MM-DD_HH-mm-ss>/
 *   raw.html, cleaned.html, metadata.json, plus optional artifacts.
 *
 * Phase 6 adds content hashing: we maintain content_hashes.json per run folder so
 * that major artifacts have stable, comparable identities for re-analysis.
 */

import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const ROOT = path.join(process.cwd(), '..', '..', 'data_application_assistant');

function slugFromName(name: string | null): string {
  if (!name || !name.trim()) return 'user';
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 40) || 'user'
  );
}

function datetimeSlug(): string {
  return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '-');
}

/**
 * Create run folder name: firstName-lastName_2026-02-23-21-42-32
 * If no name, use user-<idSlice>_datetime.
 */
export function getRunFolderName(userName: string | null, userId: string): string {
  const slug = slugFromName(userName);
  const idPart = slug === 'user' ? `user-${userId.slice(0, 8)}` : slug;
  return `${idPart}_${datetimeSlug()}`;
}

/** Resolve absolute path to a run folder (does not create it). */
export function getRunFolderPath(folderName: string): string {
  return path.join(ROOT, folderName);
}

async function computeFileHash(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const buf = await readFile(filePath);
  const hash = createHash('sha256').update(buf).digest('hex');
  return hash;
}

/**
 * Update content_hashes.json for a set of filenames within a run folder.
 * Safe to call repeatedly; merges into existing hashes.
 */
export async function updateContentHashes(folderName: string, filenames: string[]): Promise<void> {
  const dir = getRunFolderPath(folderName);
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

  for (const name of filenames) {
    const full = path.join(dir, name);
    const h = await computeFileHash(full);
    if (h) hashes[name] = h;
  }

  await writeFile(hashesPath, JSON.stringify(hashes, null, 2), 'utf-8');
}

export interface RunMetadata {
  url: string;
  // Original URL as pasted by user (may include tracking params).
  originalUrl?: string;
  userId: string;
  userName: string | null;
  folderName: string;
  classificationType: string;
  classificationConfidence: number;
  timestamp: string;
  resolvedUrl?: string;
  jobTitle?: string;
  company?: string;
}

/**
 * Save raw HTML, cleaned HTML, and metadata for this run.
 */
export async function saveApplicationAssistantRun(
  folderName: string,
  rawHtml: string,
  cleanedHtml: string,
  metadata: RunMetadata,
): Promise<string> {
  const dir = getRunFolderPath(folderName);
  if (!existsSync(ROOT)) {
    await mkdir(ROOT, { recursive: true });
  }
  await mkdir(dir, { recursive: true });

  await writeFile(path.join(dir, 'raw.html'), rawHtml, 'utf-8');
  await writeFile(path.join(dir, 'cleaned.html'), cleanedHtml, 'utf-8');
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');

  await updateContentHashes(folderName, ['raw.html', 'cleaned.html', 'metadata.json']);

  return dir;
}

/**
 * Save an additional HTML variant for a run, e.g. post-login or post-captcha.
 * Files are named "<label>.raw.html" and "<label>.cleaned.html".
 */
export async function saveHtmlVariant(
  folderName: string,
  label: string,
  rawHtml: string,
  cleanedHtml?: string,
): Promise<void> {
  const dir = getRunFolderPath(folderName);
  if (!existsSync(ROOT)) {
    await mkdir(ROOT, { recursive: true });
  }
  await mkdir(dir, { recursive: true });
  const safeLabel = label.replace(/[^a-z0-9\-_.]/gi, '_');
  const rawPath = `${safeLabel}.raw.html`;
  await writeFile(path.join(dir, rawPath), rawHtml, 'utf-8');
  if (cleanedHtml !== undefined) {
    const cleanedPath = `${safeLabel}.cleaned.html`;
    await writeFile(path.join(dir, cleanedPath), cleanedHtml, 'utf-8');
    await updateContentHashes(folderName, [rawPath, cleanedPath]);
  } else {
    await updateContentHashes(folderName, [rawPath]);
  }
}

/**
 * Save a JSON artifact (e.g. job-detail.json, analysis.json, timings.json) into the run folder.
 */
export async function saveJsonArtifact(
  folderName: string,
  filename: string,
  data: unknown,
): Promise<void> {
  const dir = getRunFolderPath(folderName);
  if (!existsSync(ROOT)) {
    await mkdir(ROOT, { recursive: true });
  }
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf-8');
  await updateContentHashes(folderName, [filename]);
}

/**
 * Delete a single run folder by name (e.g. from analysis.runFolderName).
 * No-op if folder does not exist.
 */
export async function deleteRunFolder(folderName: string): Promise<void> {
  const dir = path.join(ROOT, folderName);
  if (!existsSync(dir)) return;
  await rm(dir, { recursive: true });
}

/** Step entry in orchestrator memory (for retry/context). */
export interface OrchestratorStepEntry {
  step: string;
  completedAt?: string;
  model?: string;
  outputSummary?: string;
  error?: string;
  payload?: Record<string, unknown>;
}

/** Running memory for a single Application Assistant run (like Company Dossier memory.json). */
export interface OrchestratorMemory {
  updatedAt: string;
  runFolderName: string;
  currentStep?: string;
  steps: Record<string, OrchestratorStepEntry>;
  /** Last error for retry context */
  lastError?: string;
}

const MEMORY_FILENAME = 'memory.json';

/** Read orchestrator memory from run folder. Returns default if missing. */
export async function readOrchestratorMemory(folderName: string): Promise<OrchestratorMemory> {
  const dir = getRunFolderPath(folderName);
  const filePath = path.join(dir, MEMORY_FILENAME);
  if (!existsSync(filePath)) {
    return {
      updatedAt: new Date().toISOString(),
      runFolderName: folderName,
      steps: {},
    };
  }
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as OrchestratorMemory;
  } catch {
    return { updatedAt: new Date().toISOString(), runFolderName: folderName, steps: {} };
  }
}

/** Update orchestrator memory (merge steps, set currentStep/lastError). Persists to disk. */
export async function updateOrchestratorMemory(
  folderName: string,
  partial: Partial<Pick<OrchestratorMemory, 'currentStep' | 'lastError'>> & {
    step?: OrchestratorStepEntry;
  },
): Promise<void> {
  const dir = getRunFolderPath(folderName);
  if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const current = await readOrchestratorMemory(folderName);
  const updated: OrchestratorMemory = {
    ...current,
    updatedAt: new Date().toISOString(),
    ...(partial.currentStep !== undefined && { currentStep: partial.currentStep }),
    ...(partial.lastError !== undefined && { lastError: partial.lastError }),
  };
  if (partial.step) {
    updated.steps = { ...current.steps, [partial.step.step]: partial.step };
  }
  await writeFile(path.join(dir, MEMORY_FILENAME), JSON.stringify(updated, null, 2), 'utf-8');
}
