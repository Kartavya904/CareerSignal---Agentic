/**
 * Persist each Application Assistant run to disk for debugging and re-analysis.
 * Root folder: data_application_assistant/
 * Per run: <userSlug>_<YYYY-MM-DD_HH-mm-ss>/
 *   raw.html, cleaned.html, metadata.json, plus optional artifacts.
 */

import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

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
  await writeFile(path.join(dir, `${safeLabel}.raw.html`), rawHtml, 'utf-8');
  if (cleanedHtml !== undefined) {
    await writeFile(path.join(dir, `${safeLabel}.cleaned.html`), cleanedHtml, 'utf-8');
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
