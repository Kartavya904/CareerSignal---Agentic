import { eq, desc, and, gt, lt, or, isNull } from 'drizzle-orm';
import type { Db } from './client';
import { applicationAssistantAnalyses as table } from './schema';

const STALE_RUN_MS = 5 * 60 * 1000;

export interface StrictFilterRejectRow {
  dimension: string;
  reason: string;
}

export interface AnalysisRow {
  id: string;
  userId: string;
  url: string;
  jobSummary: Record<string, unknown> | null;
  matchScore: number | null;
  matchGrade: string | null;
  matchRationale: string | null;
  matchBreakdown: Record<string, unknown> | null;
  strictFilterRejects: StrictFilterRejectRow[] | null;
  matchEvidence: Record<string, unknown> | null;
  resumeEvidence: Record<string, unknown> | null;
  coverLettersEvidence: Record<string, unknown> | null;
  contactsEvidence: Record<string, unknown> | null;
  resumeSuggestions: Record<string, unknown> | null;
  coverLetters: Record<string, string> | null;
  contacts: Record<string, unknown> | null;
  keywordsToAdd: string[] | null;
  salaryLevelCheck: string | null;
  applicationChecklist: Record<string, unknown>[] | null;
  interviewPrepBullets: string[] | null;
  companyResearch: string | null;
  companySnapshot: Record<string, unknown> | null;
  runFolderName: string | null;
  runStatus: string | null;
  currentStep: string | null;
  waitingForLogin: boolean | null;
  waitingForCaptcha: boolean | null;
  runUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertAnalysisData {
  userId: string;
  url: string;
  jobSummary?: Record<string, unknown> | null;
  matchScore?: number | null;
  matchGrade?: string | null;
  matchRationale?: string | null;
  matchBreakdown?: Record<string, unknown> | null;
  strictFilterRejects?: StrictFilterRejectRow[] | null;
  matchEvidence?: Record<string, unknown> | null;
  resumeEvidence?: Record<string, unknown> | null;
  coverLettersEvidence?: Record<string, unknown> | null;
  contactsEvidence?: Record<string, unknown> | null;
  resumeSuggestions?: Record<string, unknown> | null;
  coverLetters?: Record<string, string> | null;
  contacts?: Record<string, unknown> | null;
  keywordsToAdd?: string[] | null;
  salaryLevelCheck?: string | null;
  applicationChecklist?: Record<string, unknown>[] | null;
  interviewPrepBullets?: string[] | null;
  companyResearch?: string | null;
  companySnapshot?: Record<string, unknown> | null;
  runFolderName?: string | null;
  runStatus?: string | null;
  currentStep?: string | null;
  waitingForLogin?: boolean | null;
  waitingForCaptcha?: boolean | null;
}

export type RunStatus = 'running' | 'done' | 'error';

export async function insertAnalysis(db: Db, data: InsertAnalysisData): Promise<AnalysisRow> {
  const [row] = await db
    .insert(table)
    .values({
      userId: data.userId,
      url: data.url,
      jobSummary: data.jobSummary ?? null,
      matchScore: data.matchScore != null ? String(data.matchScore) : null,
      matchGrade: data.matchGrade ?? null,
      matchRationale: data.matchRationale ?? null,
      matchBreakdown: data.matchBreakdown ?? null,
      strictFilterRejects: data.strictFilterRejects ?? null,
      matchEvidence: data.matchEvidence ?? null,
      resumeEvidence: data.resumeEvidence ?? null,
      coverLettersEvidence: data.coverLettersEvidence ?? null,
      contactsEvidence: data.contactsEvidence ?? null,
      resumeSuggestions: data.resumeSuggestions ?? null,
      coverLetters: data.coverLetters ?? null,
      contacts: data.contacts ?? null,
      keywordsToAdd: data.keywordsToAdd ?? null,
      salaryLevelCheck: data.salaryLevelCheck ?? null,
      applicationChecklist: data.applicationChecklist ?? null,
      interviewPrepBullets: data.interviewPrepBullets ?? null,
      companyResearch: data.companyResearch ?? null,
      companySnapshot: data.companySnapshot ?? null,
      runFolderName: data.runFolderName ?? null,
      runStatus: data.runStatus ?? 'running',
      currentStep: data.currentStep ?? 'scraping',
      waitingForLogin: data.waitingForLogin ?? false,
      waitingForCaptcha: data.waitingForCaptcha ?? false,
      runUpdatedAt: new Date(),
    })
    .returning();
  return row as unknown as AnalysisRow;
}

export async function updateAnalysis(
  db: Db,
  id: string,
  data: Partial<Omit<InsertAnalysisData, 'userId'>>,
): Promise<AnalysisRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.url !== undefined) set.url = data.url;
  if (data.jobSummary !== undefined) set.jobSummary = data.jobSummary;
  if (data.runFolderName !== undefined) set.runFolderName = data.runFolderName;
  if (data.matchScore !== undefined)
    set.matchScore = data.matchScore != null ? String(data.matchScore) : null;
  if (data.matchGrade !== undefined) set.matchGrade = data.matchGrade;
  if (data.matchRationale !== undefined) set.matchRationale = data.matchRationale;
  if (data.matchBreakdown !== undefined) set.matchBreakdown = data.matchBreakdown;
  if (data.strictFilterRejects !== undefined) set.strictFilterRejects = data.strictFilterRejects;
  if (data.matchEvidence !== undefined) set.matchEvidence = data.matchEvidence;
  if (data.resumeEvidence !== undefined) set.resumeEvidence = data.resumeEvidence;
  if (data.coverLettersEvidence !== undefined) set.coverLettersEvidence = data.coverLettersEvidence;
  if (data.contactsEvidence !== undefined) set.contactsEvidence = data.contactsEvidence;
  if (data.resumeSuggestions !== undefined) set.resumeSuggestions = data.resumeSuggestions;
  if (data.coverLetters !== undefined) set.coverLetters = data.coverLetters;
  if (data.contacts !== undefined) set.contacts = data.contacts;
  if (data.keywordsToAdd !== undefined) set.keywordsToAdd = data.keywordsToAdd;
  if (data.salaryLevelCheck !== undefined) set.salaryLevelCheck = data.salaryLevelCheck;
  if (data.applicationChecklist !== undefined) set.applicationChecklist = data.applicationChecklist;
  if (data.interviewPrepBullets !== undefined) set.interviewPrepBullets = data.interviewPrepBullets;
  if (data.companyResearch !== undefined) set.companyResearch = data.companyResearch;
  if (data.companySnapshot !== undefined) set.companySnapshot = data.companySnapshot;
  if (data.runStatus !== undefined) set.runStatus = data.runStatus;
  if (data.currentStep !== undefined) set.currentStep = data.currentStep;
  if (data.waitingForLogin !== undefined) set.waitingForLogin = data.waitingForLogin;
  if (data.waitingForCaptcha !== undefined) set.waitingForCaptcha = data.waitingForCaptcha;
  if (
    data.runStatus !== undefined ||
    data.currentStep !== undefined ||
    data.waitingForLogin !== undefined ||
    data.waitingForCaptcha !== undefined
  )
    set.runUpdatedAt = new Date();

  const [row] = await db.update(table).set(set).where(eq(table.id, id)).returning();
  return (row as unknown as AnalysisRow) ?? null;
}

export async function getAnalysisById(db: Db, id: string): Promise<AnalysisRow | null> {
  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return (row as unknown as AnalysisRow) ?? null;
}

export async function listAnalysesByUser(db: Db, userId: string): Promise<AnalysisRow[]> {
  const rows = await db
    .select()
    .from(table)
    .where(eq(table.userId, userId))
    .orderBy(desc(table.createdAt));
  return rows as unknown as AnalysisRow[];
}

/** Delete one analysis by id (only if owned by userId). Returns the deleted row or null. */
export async function deleteAnalysisById(
  db: Db,
  id: string,
  userId: string,
): Promise<AnalysisRow | null> {
  const [row] = await db
    .delete(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .returning();
  return (row as unknown as AnalysisRow) ?? null;
}

/** Delete all analyses for a user. Returns runFolderName of each deleted row. */
export async function deleteAllAnalysesForUser(
  db: Db,
  userId: string,
): Promise<{ runFolderName: string | null }[]> {
  const rows = await db.delete(table).where(eq(table.userId, userId)).returning();
  return (rows as unknown as AnalysisRow[]).map((r) => ({
    runFolderName: r.runFolderName ?? null,
  }));
}

/** Get the current running analysis for a user (not stale). Stale = run_updated_at older than 5 min. */
export async function getRunningAnalysisForUser(
  db: Db,
  userId: string,
): Promise<AnalysisRow | null> {
  const rows = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.userId, userId),
        eq(table.runStatus, 'running'),
        gt(table.runUpdatedAt, new Date(Date.now() - STALE_RUN_MS)),
      ),
    )
    .limit(1);
  const row = rows[0] as unknown as AnalysisRow | undefined;
  return row ?? null;
}

/** Mark stale running analyses (run_updated_at too old or null) as error. Returns count updated. */
export async function markStaleRunsAsError(db: Db, userId: string): Promise<number> {
  const stale = new Date(Date.now() - STALE_RUN_MS);
  const rows = await db
    .update(table)
    .set({ runStatus: 'error', runUpdatedAt: new Date() })
    .where(
      and(
        eq(table.userId, userId),
        eq(table.runStatus, 'running'),
        or(lt(table.runUpdatedAt, stale), isNull(table.runUpdatedAt)),
      ),
    )
    .returning();
  return rows.length;
}

/** Update run state (step, status, waiting flags); sets run_updated_at. */
export async function updateAnalysisRunState(
  db: Db,
  analysisId: string,
  data: {
    currentStep?: string;
    runStatus?: RunStatus;
    waitingForLogin?: boolean;
    waitingForCaptcha?: boolean;
  },
): Promise<void> {
  const set: Record<string, unknown> = { runUpdatedAt: new Date() };
  if (data.currentStep !== undefined) set.currentStep = data.currentStep;
  if (data.runStatus !== undefined) set.runStatus = data.runStatus;
  if (data.waitingForLogin !== undefined) set.waitingForLogin = data.waitingForLogin;
  if (data.waitingForCaptcha !== undefined) set.waitingForCaptcha = data.waitingForCaptcha;
  await db.update(table).set(set).where(eq(table.id, analysisId));
}
