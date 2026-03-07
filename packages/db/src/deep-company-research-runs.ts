import { eq, asc, desc } from 'drizzle-orm';
import type { Db } from './client';
import {
  deepCompanyResearchRuns as runsTable,
  deepCompanyResearchAdminLogs as logsTable,
} from './schema';

export type DeepCompanyResearchRunStatus = 'running' | 'completed' | 'failed';

export interface DeepCompanyResearchRunRow {
  id: string;
  status: DeepCompanyResearchRunStatus;
  companyName: string;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export interface DeepCompanyResearchAdminLogRow {
  id: string;
  runId: string;
  ts: Date;
  level: string;
  message: string;
}

export async function insertDeepCompanyResearchRun(
  db: Db,
  companyName: string,
): Promise<DeepCompanyResearchRunRow> {
  const [row] = await db.insert(runsTable).values({ companyName, status: 'running' }).returning();
  return row as unknown as DeepCompanyResearchRunRow;
}

export async function updateDeepCompanyResearchRunStatus(
  db: Db,
  runId: string,
  status: 'completed' | 'failed',
): Promise<void> {
  await db
    .update(runsTable)
    .set({ status, completedAt: new Date() })
    .where(eq(runsTable.id, runId));
}

export async function insertDeepCompanyResearchAdminLog(
  db: Db,
  data: { runId: string; ts: Date; level: string; message: string },
): Promise<void> {
  await db.insert(logsTable).values({
    runId: data.runId,
    ts: data.ts,
    level: data.level,
    message: data.message,
  });
}

export async function getLatestDeepCompanyResearchRunWithLogs(db: Db): Promise<{
  run: DeepCompanyResearchRunRow;
  logs: DeepCompanyResearchAdminLogRow[];
} | null> {
  const [latest] = await db.select().from(runsTable).orderBy(desc(runsTable.startedAt)).limit(1);
  if (!latest) return null;

  const logs = await db
    .select()
    .from(logsTable)
    .where(eq(logsTable.runId, latest.id))
    .orderBy(asc(logsTable.ts), asc(logsTable.id));

  return {
    run: latest as unknown as DeepCompanyResearchRunRow,
    logs: logs as unknown as DeepCompanyResearchAdminLogRow[],
  };
}
