import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const DATA_USER_ROOT = path.join(process.cwd(), '..', '..', 'data_user');

/**
 * Sanitize email to be safe as a directory name.
 * Replaces @ with _at_ and other unsafe chars with _.
 */
export function emailToFolderName(email: string): string {
  return email
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9._-]/g, '_');
}

/**
 * Get the user's data directory path.
 * Creates it if it doesn't exist.
 */
export async function getUserDataDir(email: string): Promise<string> {
  const folderName = emailToFolderName(email);
  const userDir = path.join(DATA_USER_ROOT, folderName);

  if (!existsSync(userDir)) {
    await mkdir(userDir, { recursive: true });
  }

  return userDir;
}

/**
 * Get the path where a user's resume should be stored.
 */
export function getResumeFilePath(userDir: string, originalFilename: string): string {
  const ext = path.extname(originalFilename) || '.pdf';
  return path.join(userDir, `resume${ext}`);
}

/**
 * Check if user has uploaded a resume.
 */
export function hasResume(userDir: string): boolean {
  const extensions = ['.pdf', '.docx', '.doc', '.txt'];
  return extensions.some((ext) => existsSync(path.join(userDir, `resume${ext}`)));
}

/**
 * Get the resume filename if it exists.
 */
export function getResumeFilename(userDir: string): string | null {
  const extensions = ['.pdf', '.docx', '.doc', '.txt'];
  for (const ext of extensions) {
    const resumePath = path.join(userDir, `resume${ext}`);
    if (existsSync(resumePath)) {
      return `resume${ext}`;
    }
  }
  return null;
}

/**
 * Get the full absolute path to the user's resume file.
 */
export function getResumeFullPath(userDir: string): string | null {
  const extensions = ['.pdf', '.docx', '.doc', '.txt'];
  for (const ext of extensions) {
    const resumePath = path.join(userDir, `resume${ext}`);
    if (existsSync(resumePath)) {
      return resumePath;
    }
  }
  return null;
}
