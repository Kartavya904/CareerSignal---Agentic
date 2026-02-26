import { eq, asc } from 'drizzle-orm';
import type { Db } from './client';
import { applicationAssistantAnalysisLogs as table } from './schema';

export interface AnalysisLogRow {
  id: string;
  analysisId: string;
  ts: Date;
  agent: string;
  level: string;
  message: string;
  detail: string | null;
}

export interface InsertAnalysisLogData {
  analysisId: string;
  ts: Date;
  agent: string;
  level: string;
  message: string;
  detail?: string | null;
}

export async function insertAnalysisLog(
  db: Db,
  data: InsertAnalysisLogData,
): Promise<AnalysisLogRow> {
  const [row] = await db
    .insert(table)
    .values({
      analysisId: data.analysisId,
      ts: data.ts,
      agent: data.agent,
      level: data.level,
      message: data.message,
      detail: data.detail ?? null,
    })
    .returning();
  return row as unknown as AnalysisLogRow;
}

/** Get logs for an analysis. If afterId is set, return only logs after that id (for polling). */
export async function getAnalysisLogs(
  db: Db,
  analysisId: string,
  afterId?: string,
): Promise<AnalysisLogRow[]> {
  if (!afterId) {
    const rows = await db
      .select()
      .from(table)
      .where(eq(table.analysisId, analysisId))
      .orderBy(asc(table.ts), asc(table.id));
    return rows as unknown as AnalysisLogRow[];
  }
  const rows = await db
    .select()
    .from(table)
    .where(eq(table.analysisId, analysisId))
    .orderBy(asc(table.ts), asc(table.id));
  const all = rows as unknown as AnalysisLogRow[];
  const idx = all.findIndex((r) => r.id === afterId);
  if (idx < 0) return all;
  return all.slice(idx + 1);
}
