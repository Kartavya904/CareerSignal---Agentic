import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { getSessionUser } from '@/lib/auth';
import { getDb, upsertCompanyEnrichment } from '@careersignal/db';
import { deepResearchCompany } from '@careersignal/agents';
import { complete } from '@careersignal/llm';
import { getDossierRunFolderName, createDossierDiskWriter } from '@/lib/dossier-disk';
import { runCompanyPageRag } from '@/lib/application-assistant-rag';

export const maxDuration = 300; // 5 min for dossier pipeline

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

    try {
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'info',
        message: `[Admin] Starting deep company research for: "${companyName}"`,
      });
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'info',
        message: '[Admin] Using browser-based search (DuckDuckGo); no API key required.',
      });
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'info',
        message: '[Admin] Launching visible browser...',
      });

      browser = await chromium.launch({ headless: false, args: STEALTH_ARGS });
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'info',
        message: '[Admin] Browser ready; running discovery and enrichment...',
      });

      // Pre-warm the GENERAL (32B) model so Ollama loads it before the pipeline.
      try {
        writeLogLine(writer, encoder, {
          ts: new Date().toISOString(),
          level: 'info',
          message: '[Admin] Pre-warming GENERAL model (may take 1–2 min on first run)...',
        });
        await complete('Reply with exactly: OK', 'GENERAL', { maxTokens: 5, timeout: 300_000 });
        writeLogLine(writer, encoder, {
          ts: new Date().toISOString(),
          level: 'info',
          message: '[Admin] Model ready.',
        });
      } catch (e) {
        writeLogLine(writer, encoder, {
          ts: new Date().toISOString(),
          level: 'warn',
          message: `[Admin] Pre-warm skipped or failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      const runFolderName = getDossierRunFolderName(companyName);
      const dossierWriter = createDossierDiskWriter();

      const deepResult = await deepResearchCompany({
        companyName,
        seedUrl: undefined,
        jobDescriptionText: undefined,
        log: ({ level, message }) =>
          writeLogLine(writer, encoder, {
            ts: new Date().toISOString(),
            level,
            message,
          }),
        hardTimeoutMs: 900_000, // 15 min for full pipeline (all discovered + fallback URLs)
        browserPage: page,
        runFolderName,
        dossierWriter,
        runCompanyPageRag,
      });

      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'info',
        message: `[Admin] Agent finished. Visited ${deepResult.visitedUrls.length} URLs, core coverage ${(deepResult.coreFieldCoverage * 100).toFixed(0)}%`,
      });
      if (deepResult.missingCoreFields.length > 0) {
        writeLogLine(writer, encoder, {
          ts: new Date().toISOString(),
          level: 'info',
          message: `[Admin] Missing core fields: ${deepResult.missingCoreFields.join(', ')}`,
        });
      }

      const db = getDb();
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'info',
        message: '[Admin] Upserting company to database...',
      });

      const upserted = await upsertCompanyEnrichment(db, {
        name: deepResult.companyName,
        normalizedName: deepResult.normalizedName,
        url: deepResult.primaryUrl ?? `https://${deepResult.websiteDomain ?? 'unknown'}`,
        origin: 'ADMIN_DEEP_RESEARCH',
        websiteDomain: deepResult.websiteDomain,
        descriptionText: deepResult.descriptionText,
        enrichmentSources: { urls: deepResult.visitedUrls },
        industries: deepResult.industries,
        hqLocation: deepResult.hqLocation,
        sizeRange: deepResult.sizeRange,
        foundedYear: deepResult.foundedYear ?? null,
        fundingStage: deepResult.fundingStage,
        publicCompany: deepResult.publicCompany ?? null,
        ticker: deepResult.ticker,
        remotePolicy: deepResult.remotePolicy,
        sponsorshipSignals: {
          ...(deepResult.sponsorshipSignals ?? {}),
          coreCoverage: deepResult.coreFieldCoverage,
          missingCoreFields: deepResult.missingCoreFields,
        },
        hiringLocations: deepResult.hiringLocations,
        techStackHints: deepResult.techStackHints,
        jobCountTotal: deepResult.jobCountTotal ?? undefined,
        jobCountOpen: deepResult.jobCountOpen ?? undefined,
        enrichmentStatus: deepResult.coreFieldCoverage >= 0.5 ? 'DONE' : 'ERROR',
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      writeLogLine(writer, encoder, {
        ts: new Date().toISOString(),
        level: 'success',
        message: `[Admin] Done. Company id=${upserted.id}, elapsed=${elapsed}s`,
      });

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
              hqLocation: upserted.hqLocation,
              sizeRange: upserted.sizeRange,
              fundingStage: upserted.fundingStage,
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
