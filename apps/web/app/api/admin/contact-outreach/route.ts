import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { getSessionUser } from '@/lib/auth';
import {
  getDb,
  getProfileByUserId,
  getPreferencesByUserId,
  findCompanyByNameOrDomain,
  getCompanyById,
  getJobListingByApplyUrl,
  listContactsByCompanyId,
  insertContact,
} from '@careersignal/db';
import { getOutreachRunFolderName } from '@/lib/outreach-research-disk';
import {
  runOutreachResearch,
  OUTREACH_PIPELINE_TIMEOUT_MS,
  type OutreachMemory,
} from '@/lib/outreach-research-runner';
import { OUTREACH_TEST_JOBS } from '@/lib/outreach-test-jobs';
import { runCompanyPageRag } from '@/lib/application-assistant-rag';

export const maxDuration = 320; // slightly over 5 min for pipeline + buffer

type LogEntry = { ts: string; level: string; message: string };

function writeLogLine(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  entry: LogEntry,
): void {
  writer.write(encoder.encode(JSON.stringify({ type: 'log', ...entry }) + '\n')).catch(() => {});
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const jobUrl = typeof body?.jobUrl === 'string' ? body.jobUrl.trim() : '';
  const jobPostingId = typeof body?.jobPostingId === 'string' ? body.jobPostingId.trim() : '';
  const useDb = body?.source === 'db' && typeof body?.applyUrl === 'string';
  const applyUrl = useDb ? body.applyUrl.trim() : '';
  if (!useDb && !jobUrl) {
    return NextResponse.json(
      { error: 'jobUrl is required (or source=db and applyUrl)', success: false },
      { status: 400 },
    );
  }
  if (useDb && !applyUrl) {
    return NextResponse.json(
      { error: 'applyUrl is required when source=db', success: false },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'info',
        message: useDb
          ? '[Admin] Loading job and company from DB...'
          : '[Admin] Resolving job and company...',
      });

      const db = getDb();
      let company: Awaited<ReturnType<typeof findCompanyByNameOrDomain>>;
      let jobTitle: string;
      let resolvedJobUrl: string;
      let jobDescription: string;
      let jobListingId: string | null = null;

      if (useDb) {
        const jobRow = await getJobListingByApplyUrl(db, applyUrl);
        if (!jobRow || !jobRow.companyId) {
          writeLogLine(writer, encoder, {
            ts: new Date().toISOString(),
            level: 'error',
            message: `[Admin] Job not found in DB for applyUrl. Run: node packages/db/scripts/seed-outreach-test-jobs.mjs`,
          });
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'result',
                success: false,
                error: 'Job not found in DB for this applyUrl. Run the seed script first.',
              }) + '\n',
            ),
          );
          return;
        }
        company = await getCompanyById(db, jobRow.companyId);
        if (!company) {
          writeLogLine(writer, encoder, {
            ts: new Date().toISOString(),
            level: 'error',
            message: '[Admin] Company for this job not found in DB.',
          });
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'result',
                success: false,
                error: 'Company not found for job.',
              }) + '\n',
            ),
          );
          return;
        }
        jobTitle = jobRow.title;
        resolvedJobUrl = jobRow.applyUrl ?? jobRow.jobUrl ?? applyUrl;
        jobDescription = jobRow.descriptionText ?? '';
        jobListingId = jobRow.id;
      } else {
        const testJob = jobPostingId ? OUTREACH_TEST_JOBS.find((j) => j.id === jobPostingId) : null;
        const companyName = testJob?.companyName ?? (body?.companyName as string) ?? '';
        jobTitle = testJob?.title ?? (body?.title as string) ?? 'Job';

        if (!companyName) {
          writeLogLine(writer, encoder, {
            ts: new Date().toISOString(),
            level: 'error',
            message:
              '[Admin] companyName could not be resolved. For test jobs use jobPostingId from the list.',
          });
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'result',
                success: false,
                error: 'companyName required (use a test job or pass companyName)',
              }) + '\n',
            ),
          );
          return;
        }

        company = await findCompanyByNameOrDomain(db, { name: companyName });
        if (!company) {
          writeLogLine(writer, encoder, {
            ts: new Date().toISOString(),
            level: 'error',
            message: `[Admin] Company "${companyName}" not found in DB. Add the company (e.g. via Deep Company Research) first.`,
          });
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'result',
                success: false,
                error: `Company "${companyName}" must exist in DB for this pipeline.`,
              }) + '\n',
            ),
          );
          return;
        }
        resolvedJobUrl = jobUrl;
        jobDescription = '';
      }

      const profile = user?.id ? await getProfileByUserId(db, user.id) : null;
      const preferences = user?.id ? await getPreferencesByUserId(db, user.id) : null;

      const runFolderName = getOutreachRunFolderName(resolvedJobUrl);
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'info',
        message: `[Admin] Run folder: ${runFolderName}. Launching browser...`,
      });

      // Fallback: existing contacts for this company (reuse for this position)
      const existingContacts = await listContactsByCompanyId(db, company.id, { limit: 20 });
      const existingContactsFromDb = existingContacts.map((c) => ({
        name: c.name,
        role: c.role,
        email: c.email,
        linkedinUrl: c.linkedinUrl,
        archetype: c.archetype,
      }));

      const STEALTH_ARGS = [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
      ];
      browser = await chromium.launch({ headless: false, args: STEALTH_ARGS });
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

      const result = await runOutreachResearch({
        job: {
          title: jobTitle,
          companyName: company.name,
          description: jobDescription ?? '',
          sourceUrl: resolvedJobUrl,
          applyUrl: resolvedJobUrl,
          id: runFolderName,
        },
        company: {
          id: company.id,
          name: company.name,
          websiteDomain: company.websiteDomain,
          descriptionText: company.descriptionText,
        },
        profile: profile
          ? {
              name: profile.name,
              skills: (profile.skills as string[]) ?? [],
              targetRoles: (profile.targetRoles as string[]) ?? [],
            }
          : null,
        runFolderName,
        log: ({ level, message }) =>
          writeLogLine(writer, encoder, { ts: new Date().toISOString(), level, message }),
        browserPage: page,
        hardTimeoutMs: OUTREACH_PIPELINE_TIMEOUT_MS,
        existingContactsFromDb,
        saveHtmlPerUrl: true,
        runRagForVisitedPages: async (outputDir, html, onLog) => {
          const r = await runCompanyPageRag(outputDir, html, onLog);
          return { focusedHtml: r.focusedHtml };
        },
        onProgress: async (phase: string, memory: OutreachMemory) => {
          writeLogLine(writer, encoder, {
            ts: new Date().toISOString(),
            level: 'info',
            message: `[Progress] ${phase} | visited=${memory.visitedUrls?.length ?? 0} discovered=${memory.discoveredUrls?.length ?? 0} toVisit=${memory.urlsToVisit?.length ?? 0} candidates=${(memory.candidates as unknown[])?.length ?? 0}`,
          });
          writer
            .write(
              encoder.encode(
                JSON.stringify({
                  type: 'progress',
                  phase,
                  visitedUrls: memory.visitedUrls,
                  discoveredUrls: memory.discoveredUrls,
                  urlsToVisit: memory.urlsToVisit,
                  candidatesCount: (memory.candidates as unknown[])?.length ?? 0,
                }) + '\n',
              ),
            )
            .catch(() => {});
          return 'continue';
        },
      });

      if (result.success && Array.isArray(result.contacts) && result.contacts.length > 0) {
        for (const c of result.contacts as Array<Record<string, unknown>>) {
          try {
            await insertContact(db, {
              companyId: company.id,
              name: String(c.name ?? ''),
              role: typeof c.role === 'string' ? c.role : null,
              email: typeof c.email === 'string' ? c.email : null,
              linkedinUrl: typeof c.linkedinUrl === 'string' ? c.linkedinUrl : null,
              archetype: typeof c.archetype === 'string' ? c.archetype : null,
              source: 'outreach_run',
              confidence:
                typeof c.confidence === 'number'
                  ? c.confidence
                  : typeof c.confidence === 'string'
                    ? parseFloat(c.confidence)
                    : null,
              evidence:
                c.evidenceUrls || c.evidenceSnippets
                  ? {
                      urls: (c.evidenceUrls as string[]) ?? [],
                      snippets: (c.evidenceSnippets as string[]) ?? [],
                    }
                  : null,
              usedForJobIds: jobListingId ? [jobListingId] : [],
            });
          } catch (err) {
            writeLogLine(writer, encoder, {
              ts: new Date().toISOString(),
              level: 'warn',
              message: `[Admin] Failed to persist contact: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }

      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: result.success ? 'success' : 'error',
        message: result.success
          ? `[Admin] Done. Contacts: ${result.contacts.length}, Drafts: ${result.drafts.length}`
          : `[Admin] Failed: ${result.error}`,
      });

      await writer.write(
        encoder.encode(
          JSON.stringify({
            type: 'result',
            success: result.success,
            error: result.error,
            contacts: result.contacts,
            drafts: result.drafts,
            runFolderName: result.runFolderName,
            visitedUrls: result.visitedUrls,
          }) + '\n',
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'error',
        message: `[Admin] Fatal: ${msg}`,
      });
      await writer.write(
        encoder.encode(JSON.stringify({ type: 'result', success: false, error: msg }) + '\n'),
      );
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // ignore
        }
      }
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
