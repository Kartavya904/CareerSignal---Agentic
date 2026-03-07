import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { getSessionUser } from '@/lib/auth';
import {
  getDb,
  upsertCompanyEnrichment,
  insertDeepCompanyResearchRun,
  updateDeepCompanyResearchRunStatus,
  insertDeepCompanyResearchAdminLog,
  getLatestDeepCompanyResearchRunWithLogs,
} from '@careersignal/db';
import { deepResearchCompany } from '@careersignal/agents';
import { complete } from '@careersignal/llm';
import { getDossierRunFolderName, createDossierDiskWriter } from '@/lib/dossier-disk';
import { runCompanyPageRag } from '@/lib/application-assistant-rag';

export const maxDuration = 1200; // 20 min for dossier pipeline

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-infobars',
  '--window-position=0,0',
  '--ignore-certificate-errors',
];

type LogEntry = { ts: string; level: string; message: string };

function writeLogLine(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  entry: LogEntry,
): void {
  writer.write(encoder.encode(JSON.stringify({ type: 'log', ...entry }) + '\n')).catch(() => {});
}

/** Write log to stream and persist to DB for reactive admin UI when returning to the page. */
async function writeLogLineAndPersist(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  entry: LogEntry,
  persist: (entry: LogEntry) => Promise<void>,
): Promise<void> {
  writeLogLine(writer, encoder, entry);
  await persist(entry).catch(() => {});
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
  const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : '';
  if (!companyName) {
    return NextResponse.json(
      { success: false, error: 'companyName is required', logs: [] },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    const t0 = Date.now();
    const db = getDb();
    const runRow = await insertDeepCompanyResearchRun(db, companyName);
    const runId = runRow.id;
    const persist = async (entry: LogEntry) => {
      await insertDeepCompanyResearchAdminLog(db, {
        runId,
        ts: new Date(entry.ts),
        level: entry.level,
        message: entry.message,
      });
    };

    const log = (entry: LogEntry) => {
      writeLogLine(writer, encoder, entry);
      persist(entry).catch(() => {});
    };

    try {
      await writeLogLineAndPersist(
        writer,
        encoder,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: `[Admin] Starting deep company research for: "${companyName}"`,
        },
        persist,
      );
      await writeLogLineAndPersist(
        writer,
        encoder,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: '[Admin] Using browser-based search (DuckDuckGo); no API key required.',
        },
        persist,
      );
      await writeLogLineAndPersist(
        writer,
        encoder,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: '[Admin] Launching visible browser...',
        },
        persist,
      );

      browser = await chromium.launch({ headless: false, args: STEALTH_ARGS });
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      await writeLogLineAndPersist(
        writer,
        encoder,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: '[Admin] Browser ready; running discovery and enrichment...',
        },
        persist,
      );

      // Pre-warm the GENERAL (32B) model so Ollama loads it before the pipeline.
      try {
        await writeLogLineAndPersist(
          writer,
          encoder,
          {
            ts: new Date().toISOString(),
            level: 'info',
            message: '[Admin] Pre-warming GENERAL model (may take 1–2 min on first run)...',
          },
          persist,
        );
        await complete('Reply with exactly: OK', 'GENERAL', { maxTokens: 5, timeout: 300_000 });
        await writeLogLineAndPersist(
          writer,
          encoder,
          {
            ts: new Date().toISOString(),
            level: 'info',
            message: '[Admin] Model ready.',
          },
          persist,
        );
      } catch (e) {
        await writeLogLineAndPersist(
          writer,
          encoder,
          {
            ts: new Date().toISOString(),
            level: 'warn',
            message: `[Admin] Pre-warm skipped or failed: ${e instanceof Error ? e.message : String(e)}`,
          },
          persist,
        );
      }

      const runFolderName = getDossierRunFolderName(companyName);
      const dossierWriter = createDossierDiskWriter();

      const deepResult = await deepResearchCompany({
        companyName,
        seedUrl: undefined,
        jobDescriptionText: undefined,
        log: ({ level, message }) =>
          log({
            ts: new Date().toISOString(),
            level,
            message,
          }),
        hardTimeoutMs: 20 * 60 * 1000, // 20 min max for full pipeline
        browserPage: page,
        runFolderName,
        dossierWriter,
        runCompanyPageRag,
      });

      await writeLogLineAndPersist(
        writer,
        encoder,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: `[Admin] Agent finished. Visited ${deepResult.visitedUrls.length} URLs, core coverage ${(deepResult.coreFieldCoverage * 100).toFixed(0)}%`,
        },
        persist,
      );
      if (deepResult.missingCoreFields.length > 0) {
        await writeLogLineAndPersist(
          writer,
          encoder,
          {
            ts: new Date().toISOString(),
            level: 'info',
            message: `[Admin] Missing core fields: ${deepResult.missingCoreFields.join(', ')}`,
          },
          persist,
        );
      }

      await writeLogLineAndPersist(
        writer,
        encoder,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: '[Admin] Upserting company to database...',
        },
        persist,
      );

      const upserted = await upsertCompanyEnrichment(db, {
        name: deepResult.companyName,
        normalizedName: deepResult.normalizedName,
        url: deepResult.primaryUrl ?? `https://${deepResult.websiteDomain ?? 'unknown'}`,
        origin: 'ADMIN_DEEP_RESEARCH',
        websiteDomain: deepResult.websiteDomain,
        descriptionText: deepResult.descriptionText,
        enrichmentSources: { urls: deepResult.visitedUrls },
        coreFieldCoverage: deepResult.coreFieldCoverage,
        missingCoreFields: deepResult.missingCoreFields,
        headquartersAndOffices: deepResult.headquartersAndOffices ?? undefined,
        foundedYear: deepResult.foundedYear ?? null,
        careersPageUrl: deepResult.careersPageUrl ?? undefined,
        linkedInCompanyUrl: deepResult.linkedInCompanyUrl ?? undefined,
        remotePolicy: deepResult.remotePolicy ?? undefined,
        sponsorshipRate: deepResult.sponsorshipRate ?? undefined,
        hiringProcessDescription: deepResult.hiringProcessDescription ?? undefined,
        hiringLocations: deepResult.hiringLocations ?? undefined,
        techStackHints: deepResult.techStackHints ?? undefined,
        enrichmentStatus: deepResult.coreFieldCoverage >= 0.5 ? 'DONE' : 'ERROR',
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      await writeLogLineAndPersist(
        writer,
        encoder,
        {
          ts: new Date().toISOString(),
          level: 'success',
          message: `[Admin] Done. Company id=${upserted.id}, elapsed=${elapsed}s`,
        },
        persist,
      );

      await updateDeepCompanyResearchRunStatus(db, runId, 'completed');
      await writer.write(
        encoder.encode(
          JSON.stringify({
            type: 'result',
            success: true,
            company: {
              id: upserted.id,
              name: upserted.name,
              normalizedName: upserted.normalizedName,
              websiteDomain: upserted.websiteDomain,
              headquartersAndOffices: upserted.headquartersAndOffices,
              sponsorshipRate: upserted.sponsorshipRate,
              enrichmentStatus: upserted.enrichmentStatus,
              lastEnrichedAt: upserted.lastEnrichedAt,
              visitedUrlsCount: deepResult.visitedUrls.length,
              coreFieldCoverage: deepResult.coreFieldCoverage,
            },
            runFolderName,
            fieldConfidence: deepResult.fieldConfidence ?? undefined,
          }) + '\n',
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await writeLogLineAndPersist(
        writer,
        encoder,
        {
          ts: new Date().toISOString(),
          level: 'error',
          message: `[Admin] Fatal: ${msg}`,
        },
        persist,
      ).catch(() => {});
      await updateDeepCompanyResearchRunStatus(db, runId, 'failed').catch(() => {});
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

/** Returns latest run + logs so the admin panel can restore state when returning to the page. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const data = await getLatestDeepCompanyResearchRunWithLogs(db);
  if (!data) {
    return NextResponse.json({ run: null, logs: [] });
  }

  return NextResponse.json({
    run: {
      id: data.run.id,
      status: data.run.status,
      companyName: data.run.companyName,
      startedAt:
        data.run.startedAt instanceof Date ? data.run.startedAt.toISOString() : data.run.startedAt,
      completedAt: data.run.completedAt
        ? data.run.completedAt instanceof Date
          ? data.run.completedAt.toISOString()
          : data.run.completedAt
        : null,
    },
    logs: data.logs.map((l) => ({
      ts: l.ts instanceof Date ? l.ts.toISOString() : l.ts,
      level: l.level,
      message: l.message,
    })),
  });
}
