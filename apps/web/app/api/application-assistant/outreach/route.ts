/**
 * POST /api/application-assistant/outreach
 * Run Deep Outreach Research for an existing analysis (from history).
 * Body: { analysisId: string }
 * Streams NDJSON: { type: 'log', ts, level, message } then { type: 'result', success, contacts, drafts, ... }
 * Persists each log line to application_assistant_analysis_logs for this analysisId so logs show in history.
 */

import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { getRequiredUserId } from '@/lib/auth';
import {
  getDb,
  getAnalysisById,
  findCompanyByNameOrDomain,
  updateAnalysis,
  insertAnalysisLog,
  getProfileByUserId,
  getPreferencesByUserId,
} from '@careersignal/db';
import { getOutreachRunFolderName } from '@/lib/outreach-research-disk';
import {
  runOutreachResearch,
  OUTREACH_PIPELINE_TIMEOUT_MS,
  type OutreachMemory,
} from '@/lib/outreach-research-runner';

export const maxDuration = 320;

type LogEntry = { ts: string; level: string; message: string };

function writeLogLine(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  entry: LogEntry,
): void {
  writer.write(encoder.encode(JSON.stringify({ type: 'log', ...entry }) + '\n')).catch(() => {});
}

export async function POST(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const body = await req.json().catch(() => ({}));
    const analysisId = typeof body?.analysisId === 'string' ? body.analysisId.trim() : '';
    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId is required' }, { status: 400 });
    }

    const db = getDb();
    const analysis = await getAnalysisById(db, analysisId);
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const jobSummary = (analysis.jobSummary as Record<string, unknown> | null) ?? {};
    const title = typeof jobSummary.title === 'string' ? jobSummary.title : 'Job';
    const companyName = typeof jobSummary.company === 'string' ? jobSummary.company : '';
    const description = typeof jobSummary.description === 'string' ? jobSummary.description : '';
    const url = typeof analysis.url === 'string' ? analysis.url : '';

    if (!companyName || !companyName.trim()) {
      return NextResponse.json(
        { error: 'Analysis has no company name; cannot run outreach.' },
        { status: 400 },
      );
    }

    const company = await findCompanyByNameOrDomain(db, { name: companyName });
    const profile = await getProfileByUserId(db, userId);
    const prefs = await getPreferencesByUserId(db, userId);

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    (async () => {
      let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
      try {
        writeLogLine(writer, encoder, {
          ts: new Date().toISOString(),
          level: 'info',
          message: '[Outreach] Starting Deep Outreach Research for this analysis...',
        });
        await insertAnalysisLog(db, {
          analysisId,
          ts: new Date(),
          agent: 'OutReachPipeline',
          level: 'info',
          message: 'Starting Deep Outreach Research (from history).',
        });

        const runFolderName = getOutreachRunFolderName(url);
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
            title,
            companyName,
            description,
            sourceUrl: url,
            applyUrl: url,
            id: analysisId,
          },
          company: company
            ? {
                id: company.id,
                name: company.name,
                websiteDomain: company.websiteDomain ?? undefined,
                descriptionText: company.descriptionText ?? undefined,
              }
            : null,
          profile: profile
            ? {
                name: profile.name,
                skills: (profile.skills as string[]) ?? [],
                targetRoles: (profile.targetRoles as string[]) ?? [],
              }
            : null,
          runFolderName,
          log: async ({ level, message }) => {
            writeLogLine(writer, encoder, {
              ts: new Date().toISOString(),
              level,
              message,
            });
            await insertAnalysisLog(db, {
              analysisId,
              ts: new Date(),
              agent: 'OutReachPipeline',
              level,
              message,
            });
          },
          browserPage: page,
          hardTimeoutMs: OUTREACH_PIPELINE_TIMEOUT_MS,
          maxRankedContacts:
            (prefs as { maxContactsPerJob?: number } | null)?.maxContactsPerJob ?? 2,
          saveHtmlPerUrl: true,
          onProgress: async (phase: string, memory: OutreachMemory) => {
            const msg = `[Progress] ${phase} | visited=${memory.visitedUrls?.length ?? 0} discovered=${memory.discoveredUrls?.length ?? 0} candidates=${(memory.candidates as unknown[])?.length ?? 0}`;
            writeLogLine(writer, encoder, {
              ts: new Date().toISOString(),
              level: 'info',
              message: msg,
            });
            await insertAnalysisLog(db, {
              analysisId,
              ts: new Date(),
              agent: 'OutReachPipeline',
              level: 'info',
              message: msg,
            });
            return 'continue';
          },
        });

        await updateAnalysis(db, analysisId, {
          contacts: {
            bestFirst: result.bestFirst ?? null,
            ranked: result.rankedContacts ?? result.contacts ?? [],
            drafts: result.drafts ?? [],
          },
          contactsEvidence: {
            model: 'outreach_pipeline',
            summary: `Contacts: ${(result.contacts ?? []).length}, Drafts: ${(result.drafts ?? []).length}`,
          },
        });

        writeLogLine(writer, encoder, {
          ts: new Date().toISOString(),
          level: result.success ? 'success' : 'error',
          message: result.success
            ? `[Outreach] Done. ${result.contacts?.length ?? 0} contact(s), ${result.drafts?.length ?? 0} draft(s).`
            : `[Outreach] Failed: ${result.error ?? 'Unknown error'}`,
        });
        await insertAnalysisLog(db, {
          analysisId,
          ts: new Date(),
          agent: 'OutReachPipeline',
          level: result.success ? 'success' : 'error',
          message: result.success
            ? `Done. ${result.contacts?.length ?? 0} contact(s), ${result.drafts?.length ?? 0} draft(s).`
            : `Failed: ${result.error ?? 'Unknown error'}`,
        });

        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: 'result',
              success: result.success,
              error: result.error,
              contacts: result.contacts,
              drafts: result.drafts,
              visitedUrls: result.visitedUrls,
            }) + '\n',
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try {
          writeLogLine(writer, encoder, {
            ts: new Date().toISOString(),
            level: 'error',
            message: `[Outreach] Fatal: ${msg}`,
          });
          await insertAnalysisLog(db, {
            analysisId,
            ts: new Date(),
            agent: 'OutReachPipeline',
            level: 'error',
            message: `Fatal: ${msg}`,
          });
          await writer.write(
            encoder.encode(JSON.stringify({ type: 'result', success: false, error: msg }) + '\n'),
          );
        } catch {
          // best-effort: still send result so client can show error
          try {
            await writer.write(
              encoder.encode(JSON.stringify({ type: 'result', success: false, error: msg }) + '\n'),
            );
          } catch {
            // ignore
          }
        }
      } finally {
        if (browser) {
          try {
            await browser.close();
          } catch {
            // ignore
          }
        }
        try {
          await writer.close();
        } catch {
          // ignore
        }
      }
    })();

    return new Response(readable, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to start outreach' },
      { status: 500 },
    );
  }
}
