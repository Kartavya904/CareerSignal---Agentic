import { eq, and } from 'drizzle-orm';
import type { Db } from './client';
import { applicationAssistantFeedback as table } from './schema';

export type FeedbackComponent = 'match' | 'contact' | 'outreach' | 'overall';
export type FeedbackValue = 'up' | 'down';

export interface FeedbackRow {
  id: string;
  analysisId: string;
  userId: string;
  component: string;
  value: string;
  comment: string | null;
  createdAt: Date;
}

export interface InsertFeedbackData {
  analysisId: string;
  userId: string;
  component: FeedbackComponent;
  value: FeedbackValue;
  comment?: string | null;
}

export async function insertFeedback(db: Db, data: InsertFeedbackData): Promise<FeedbackRow> {
  const [row] = await db
    .insert(table)
    .values({
      analysisId: data.analysisId,
      userId: data.userId,
      component: data.component,
      value: data.value,
      comment: data.comment ?? null,
    })
    .returning();
  return row as unknown as FeedbackRow;
}

export async function getFeedbackForAnalysis(
  db: Db,
  analysisId: string,
  userId: string,
): Promise<FeedbackRow[]> {
  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.analysisId, analysisId), eq(table.userId, userId)));
  return rows as unknown as FeedbackRow[];
}
