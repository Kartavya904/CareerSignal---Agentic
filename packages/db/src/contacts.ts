import { eq, and } from 'drizzle-orm';
import type { Db } from './client';
import { contacts as contactsTable } from './schema';

export type ContactSource = 'outreach_run' | 'manual' | 'reuse';
export type ContactStatus = 'pending' | 'confirmed';

export interface ContactRow {
  id: string;
  companyId: string;
  name: string;
  role: string | null;
  contactRole: string | null;
  email: string | null;
  linkedinUrl: string | null;
  archetype: string | null;
  source: ContactSource;
  confidence: string | null;
  evidence: Record<string, unknown> | null;
  status: ContactStatus;
  lastUsedAt: Date | null;
  usedForJobIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertContactInput {
  companyId: string;
  name: string;
  role?: string | null;
  contactRole?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  archetype?: string | null;
  source?: ContactSource;
  confidence?: number | null;
  evidence?: Record<string, unknown> | null;
  status?: ContactStatus;
  usedForJobIds?: string[];
}

export async function insertContact(db: Db, input: InsertContactInput): Promise<ContactRow> {
  const now = new Date();
  const [row] = await db
    .insert(contactsTable)
    .values({
      companyId: input.companyId,
      name: input.name,
      role: input.role ?? null,
      contactRole: input.contactRole ?? null,
      email: input.email ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      archetype: input.archetype ?? null,
      source: input.source ?? 'outreach_run',
      confidence: input.confidence != null ? String(input.confidence) : null,
      evidence: input.evidence ?? null,
      status: input.status ?? 'pending',
      lastUsedAt: now,
      usedForJobIds: input.usedForJobIds ?? [],
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row as unknown as ContactRow;
}

export async function listContactsByCompanyId(
  db: Db,
  companyId: string,
  opts?: { status?: ContactStatus; limit?: number },
): Promise<ContactRow[]> {
  const limit = opts?.limit ?? 50;
  const rows = await db
    .select()
    .from(contactsTable)
    .where(
      opts?.status
        ? and(eq(contactsTable.companyId, companyId), eq(contactsTable.status, opts.status))
        : eq(contactsTable.companyId, companyId),
    )
    .limit(limit);
  return rows as unknown as ContactRow[];
}

export async function updateContactLastUsed(
  db: Db,
  contactId: string,
  jobListingId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, contactId))
    .limit(1);
  if (!row) return;
  const usedForJobIds = ((row as { usedForJobIds: string[] }).usedForJobIds ?? []) as string[];
  if (!usedForJobIds.includes(jobListingId)) {
    usedForJobIds.push(jobListingId);
  }
  await db
    .update(contactsTable)
    .set({
      lastUsedAt: new Date(),
      usedForJobIds,
      updatedAt: new Date(),
    })
    .where(eq(contactsTable.id, contactId));
}
