/**
 * Application Assistant Pipeline Runner.
 *
 * Launches a visible Playwright browser, navigates to the URL, handles
 * login/captcha, extracts job details, runs match/resume/cover-letter agents,
 * and persists the analysis.
 */

import { chromium, type Browser, type Page } from 'playwright';
import {
  cleanHtml,
  classifyPage,
  extractLinksFromHtml,
  extractJobDetail,
  matchProfileToJob,
  generateResumeSuggestions,
  generateCoverLetters,
  generateInterviewPrep,
  researchCompanyFromHtml,
  normalizeUrl,
  verifyCleaning,
  resolveCompanyIdentity,
  deepResearchCompany,
  type ProfileSnapshot,
} from '@careersignal/agents';
import {
  getDb,
  getProfileByUserId,
  getPreferencesByUserId,
  getAnalysisById,
  updateAnalysis,
  updateAnalysisRunState,
  insertAnalysisLog,
  findCompanyByNameOrDomain,
  needsCompanyRefresh,
  upsertCompanyEnrichment,
} from '@careersignal/db';
import { registerLoginWait } from '@/lib/login-wall-state';
import { registerCaptchaSolve } from '@/lib/captcha-state';
import { getScraperStatus } from '@/lib/scraper-state';
import { clearAssistantAbortController } from '@/lib/application-assistant-state';
import {
  getRunFolderName,
  getRunFolderPath,
  saveApplicationAssistantRun,
  saveHtmlVariant,
  saveJsonArtifact,
  updateOrchestratorMemory,
} from '@/lib/application-assistant-disk';
import { runRagPipeline, runCompanyPageRag } from '@/lib/application-assistant-rag';
import path from 'path';
import { transitionAssistantStep } from '@/lib/application-assistant-planner';
import { getDossierRunFolderName, createDossierDiskWriter } from '@/lib/dossier-disk';

/** Build a serializable company snapshot for the analysis (all DB company fields for the UI card). */
function toCompanySnapshot(row: {
  name: string;
  url?: string | null;
  descriptionText?: string | null;
  industries?: string[] | null;
  hqLocation?: string | null;
  sizeRange?: string | null;
  foundedYear?: number | null;
  fundingStage?: string | null;
  publicCompany?: boolean | null;
  ticker?: string | null;
  remotePolicy?: string | null;
  sponsorshipSignals?: Record<string, unknown> | null;
  hiringLocations?: string[] | null;
  techStackHints?: string[] | null;
  jobCountTotal?: number | null;
  jobCountOpen?: number | null;
  websiteDomain?: string | null;
  enrichmentSources?: { urls?: string[] } | null;
  lastEnrichedAt?: Date | null;
}): Record<string, unknown> {
  return {
    name: row.name ?? null,
    url: row.url ?? null,
    descriptionText: row.descriptionText ?? null,
    industries: row.industries ?? null,
    hqLocation: row.hqLocation ?? null,
    sizeRange: row.sizeRange ?? null,
    foundedYear: row.foundedYear ?? null,
    fundingStage: row.fundingStage ?? null,
    publicCompany: row.publicCompany ?? null,
    ticker: row.ticker ?? null,
    remotePolicy: row.remotePolicy ?? null,
    sponsorshipSignals: row.sponsorshipSignals ?? null,
    hiringLocations: row.hiringLocations ?? null,
    techStackHints: row.techStackHints ?? null,
    jobCountTotal: row.jobCountTotal ?? null,
    jobCountOpen: row.jobCountOpen ?? null,
    websiteDomain: row.websiteDomain ?? null,
    enrichmentSources: row.enrichmentSources ?? null,
    lastEnrichedAt: row.lastEnrichedAt instanceof Date ? row.lastEnrichedAt.toISOString() : null,
  };
}

async function dbLog(
  db: ReturnType<typeof getDb>,
  analysisId: string,
  agent: string,
  message: string,
  opts?: { level?: string; detail?: string },
): Promise<void> {
  try {
    await insertAnalysisLog(db, {
      analysisId,
      ts: new Date(),
      agent,
      level: opts?.level ?? 'info',
      message,
      detail: opts?.detail,
    });
  } catch (err) {
    console.error('[ApplicationAssistant] insertAnalysisLog failed:', err);
  }
}

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-infobars',
  '--window-position=0,0',
  '--ignore-certificate-errors',
];

/** Application Assistant pipeline timeouts (wrap-up starts before hard deadline). */
const APP_ASSISTANT_BASE_TIMEOUT_MS = 15 * 60 * 1000; // 15 min default
const APP_ASSISTANT_DOSSIER_EXTRA_MS = 10 * 60 * 1000; // +10 min when deep dossier runs
const APP_ASSISTANT_MAX_TIMEOUT_MS = 40 * 60 * 1000; // cap for future pipelines (e.g. +15 contact)
const DOSSIER_INSIDE_ASSISTANT_TIMEOUT_MS = 10 * 60 * 1000; // 10 min for dossier when run inside assistant
const WRAP_UP_BUFFER_MS = 60 * 1000; // start wrapping up 1 min before deadline

const MAX_RESOLVE_DEPTH = 2;

function isJobPage(pageType: string): boolean {
  return ['detail', 'listing', 'company_careers', 'external_apply'].includes(pageType);
}

/** Known ATS/aggregator hosts where /about is the ATS's page, not the hiring company's. */
function isAtsJobOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host.includes('lever.co') ||
      host.includes('greenhouse.io') ||
      host.includes('workable.com') ||
      host.includes('ashbyhq.com') ||
      host.includes('smartrecruiters.com') ||
      host.includes('jobvite.com') ||
      host.includes('icims.com') ||
      host.includes('taleo') ||
      host.includes('workday.com') ||
      host.includes('myworkdayjobs.com')
    );
  } catch {
    return false;
  }
}

/** If the URL path clearly indicates a job/application page, trust it and skip resolver. */
function urlLooksLikeJobPage(url: string): boolean {
  try {
    const u = new URL(url);
    const pathLower = u.pathname.toLowerCase();
    if (/\/careers?\/details?\//.test(pathLower)) return true;
    if (/\/job\/[^/]+/.test(pathLower) || /\/jobs\/[^/]+/.test(pathLower)) return true;
    if (/\/position\/[^/]+/.test(pathLower)) return true;
    if (/\/opening\/[^/]+/.test(pathLower)) return true;
    if (/\/vacancy\/[^/]+/.test(pathLower)) return true;
    if (/\/career\/[^/]+/.test(pathLower)) return true;
    if (/\/apply\/?/.test(pathLower) && pathLower.length > 8) return true;
    return false;
  } catch {
    return false;
  }
}

/** Error message when the user clicks Stop (so we can log a friendly message). */
export const STOPPED_BY_USER_MSG = 'STOPPED_BY_USER';

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    const err = new Error(STOPPED_BY_USER_MSG);
    err.name = 'AbortError';
    throw err;
  }
}

/**
 * Fetch-first helper: resolves redirects and performs a cheap HTML fetch
 * before launching the browser. This is used for URL normalization and
 * early diagnostics; the Playwright browser still drives the main flow.
 */
async function fetchFinalUrl(
  originalUrl: string,
  db: ReturnType<typeof getDb>,
  analysisId: string,
  signal?: AbortSignal | null,
): Promise<string> {
  try {
    throwIfAborted(signal);
    await dbLog(db, analysisId, 'Fetcher', `Fetching URL via HTTP: ${originalUrl}`, {
      level: 'info',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        controller.abort();
      });
    }
    const res = await fetch(originalUrl, {
      redirect: 'follow',
      signal: controller.signal,
    }).catch((err) => {
      throw err;
    });
    clearTimeout(timeout);

    if (!res) {
      await dbLog(db, analysisId, 'Fetcher', 'Fetch failed (no response). Using original URL.', {
        level: 'warn',
      });
      return originalUrl;
    }

    const finalUrl = res.url || originalUrl;
    await dbLog(
      db,
      analysisId,
      'Fetcher',
      `Fetch completed with status ${res.status}. Final URL: ${finalUrl}`,
      { level: 'info' },
    );
    return finalUrl;
  } catch (err) {
    await dbLog(
      db,
      analysisId,
      'Fetcher',
      `Fetch failed. Using original URL. Error: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { level: 'warn' },
    );
    return originalUrl;
  }
}

/**
 * Run the full Application Assistant pipeline for a single URL.
 * analysisId must refer to an existing row with run_status = 'running'.
 * When abortSignal is aborted (user clicked Stop), the pipeline exits at the next check.
 */
export async function runApplicationAssistantPipeline(
  userId: string,
  url: string,
  analysisId: string,
  abortSignal?: AbortSignal | null,
): Promise<void> {
  let browser: Browser | null = null;
  const db = getDb();
  const timings: Record<string, number> = {};
  const t0 = Date.now();

  // Combined abort: user stop OR pipeline timeout (15 min base; +10 min when dossier runs; cap 40 min).
  const pipelineStart = Date.now();
  let deadlineMs = pipelineStart + APP_ASSISTANT_BASE_TIMEOUT_MS;
  const mergedController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(
    () => mergedController.abort(),
    APP_ASSISTANT_BASE_TIMEOUT_MS,
  );
  abortSignal?.addEventListener?.('abort', () => mergedController.abort());

  const getRemainingMs = () => Math.max(0, deadlineMs - Date.now());
  const isWrappingUp = () => getRemainingMs() < WRAP_UP_BUFFER_MS;
  const extendDeadlineForDossier = () => {
    const newDeadline =
      pipelineStart + APP_ASSISTANT_BASE_TIMEOUT_MS + APP_ASSISTANT_DOSSIER_EXTRA_MS;
    deadlineMs = Math.min(newDeadline, pipelineStart + APP_ASSISTANT_MAX_TIMEOUT_MS);
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => mergedController.abort(), Math.max(0, deadlineMs - Date.now()));
  };

  const effectiveSignal = mergedController.signal;

  try {
    throwIfAborted(effectiveSignal);
    if (getScraperStatus().running) {
      await dbLog(db, analysisId, 'Pipeline', 'Admin scraper is running. Cannot start.', {
        level: 'error',
      });
      await updateAnalysisRunState(db, analysisId, { runStatus: 'error' });
      return;
    }

    const profile = await getProfileByUserId(db, userId);
    const preferences = await getPreferencesByUserId(db, userId);
    const userName = profile?.name ?? null;

    const heartbeat = setInterval(() => {
      updateAnalysisRunState(db, analysisId, {}).catch(() => {});
    }, 30000);

    try {
      // 0. Fetch-first URL normalization (resolve redirects, keep original for reference)
      const finalUrl = await fetchFinalUrl(url, db, analysisId, effectiveSignal);
      timings.fetchMs = Date.now() - t0;
      throwIfAborted(effectiveSignal);

      // 1. Launch visible browser
      await transitionAssistantStep(db, analysisId, 'scraping');
      const tBrowserStart = Date.now();
      await dbLog(db, analysisId, 'Browser', 'Launching visible browser...', { level: 'info' });
      throwIfAborted(effectiveSignal);
      browser = await chromium.launch({ headless: false, args: STEALTH_ARGS });
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      throwIfAborted(effectiveSignal);

      // 2. Navigate to URL (allow network idle for SPAs like Citadel)
      await dbLog(db, analysisId, 'Browser', `Navigating to ${finalUrl}`, { level: 'info' });
      await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // ignore
      }

      let html = await page.content();
      timings.browserMs = Date.now() - tBrowserStart;
      throwIfAborted(effectiveSignal);
      await dbLog(db, analysisId, 'Browser', `Page loaded: ${html.length} chars`, {
        level: 'success',
      });

      // 3. Clean + classify
      const tClassifyStart = Date.now();
      throwIfAborted(effectiveSignal);
      const cleanResult = cleanHtml(html);
      let classification = await classifyPage(cleanResult.html, finalUrl);
      throwIfAborted(effectiveSignal);
      dbLog(
        db,
        analysisId,
        'Classifier',
        `Page type: ${classification.type} (${classification.confidence.toFixed(2)})`,
        {
          level: 'info',
        },
      );
      try {
        const verification = verifyCleaning(html, cleanResult.html);
        const confidencePct = Math.round(verification.coverageRatio * 100);
        await dbLog(
          db,
          analysisId,
          'CleanerVerifier',
          `Cleaning confidence: ${confidencePct}%` +
            (verification.manualReviewRequired ? ' (manual review recommended)' : ''),
          { level: verification.manualReviewRequired ? 'warn' : 'info' },
        );
      } catch {
        await dbLog(
          db,
          analysisId,
          'CleanerVerifier',
          'Cleaning verification failed (non-fatal).',
          { level: 'warn' },
        );
      }

      // 3b. Persist run to disk for debugging and re-analysis
      const runFolderName = getRunFolderName(userName, userId);
      await saveApplicationAssistantRun(runFolderName, html, cleanResult.html, {
        url: finalUrl,
        userId,
        userName,
        folderName: runFolderName,
        classificationType: classification.type,
        classificationConfidence: classification.confidence,
        timestamp: new Date().toISOString(),
      })
        .then(async (dir) => {
          await dbLog(db, analysisId, 'Pipeline', `Run saved to ${dir}`, { level: 'info' });
        })
        .catch(async (err) => {
          await dbLog(
            db,
            analysisId,
            'Pipeline',
            `Could not save run to disk: ${err instanceof Error ? err.message : String(err)}`,
            { level: 'warn' },
          );
        });
      await updateOrchestratorMemory(runFolderName, { currentStep: 'scraping' });
      // Initial screenshot
      try {
        const screenshotPath = path.join(getRunFolderPath(runFolderName), 'screenshot-initial.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await dbLog(db, analysisId, 'Browser', `Initial screenshot saved.`, { level: 'info' });
      } catch {
        // ignore screenshot failures
      }
      timings.classifyMs = Date.now() - tClassifyStart;

      throwIfAborted(effectiveSignal);
      // 4. Handle login wall
      if (classification.type === 'login_wall') {
        await dbLog(
          db,
          analysisId,
          'Browser',
          'Login required — please log in in the browser window',
          {
            level: 'warn',
          },
        );
        await updateAnalysisRunState(db, analysisId, { waitingForLogin: true });
        const loginHtml = await registerLoginWait(page);
        await updateAnalysisRunState(db, analysisId, { waitingForLogin: false });
        await dbLog(db, analysisId, 'Browser', 'Login completed, re-capturing page...', {
          level: 'success',
        });
        html = loginHtml;
        const reclean = cleanHtml(html);
        classification = await classifyPage(reclean.html, finalUrl);
        try {
          const verification = verifyCleaning(loginHtml, reclean.html);
          const confidencePct = Math.round(verification.coverageRatio * 100);
          await dbLog(
            db,
            analysisId,
            'CleanerVerifier',
            `Post-login cleaning confidence: ${confidencePct}%` +
              (verification.manualReviewRequired ? ' (manual review recommended)' : ''),
            { level: verification.manualReviewRequired ? 'warn' : 'info' },
          );
        } catch {
          await dbLog(
            db,
            analysisId,
            'CleanerVerifier',
            'Post-login cleaning verification failed (non-fatal).',
            { level: 'warn' },
          );
        }
        await dbLog(db, analysisId, 'Classifier', `Post-login type: ${classification.type}`, {
          level: 'info',
        });
        throwIfAborted(effectiveSignal);
        // Save post-login HTML variant and screenshot
        try {
          await saveHtmlVariant(runFolderName, 'post-login', loginHtml, reclean.html);
          const screenshotPath = path.join(
            getRunFolderPath(runFolderName),
            'screenshot-post-login.png',
          );
          await page.screenshot({ path: screenshotPath, fullPage: true });
          await dbLog(db, analysisId, 'Browser', 'Post-login artifacts saved.', { level: 'info' });
        } catch {
          // ignore disk/screenshot failures
        }
      }

      throwIfAborted(effectiveSignal);
      // 5. Handle captcha
      if (classification.type === 'captcha_challenge') {
        dbLog(
          db,
          analysisId,
          'Browser',
          'Captcha detected — please solve it in the browser window',
          { level: 'warn' },
        );
        await updateAnalysisRunState(db, analysisId, { waitingForCaptcha: true });
        const captchaHtml = await registerCaptchaSolve(page);
        await updateAnalysisRunState(db, analysisId, { waitingForCaptcha: false });
        await dbLog(db, analysisId, 'Browser', 'Captcha solved, re-capturing page...', {
          level: 'success',
        });
        html = captchaHtml;
        const reclean = cleanHtml(html);
        classification = await classifyPage(reclean.html, finalUrl);
        try {
          const verification = verifyCleaning(captchaHtml, reclean.html);
          const confidencePct = Math.round(verification.coverageRatio * 100);
          await dbLog(
            db,
            analysisId,
            'CleanerVerifier',
            `Post-captcha cleaning confidence: ${confidencePct}%` +
              (verification.manualReviewRequired ? ' (manual review recommended)' : ''),
            { level: verification.manualReviewRequired ? 'warn' : 'info' },
          );
        } catch {
          await dbLog(
            db,
            analysisId,
            'CleanerVerifier',
            'Post-captcha cleaning verification failed (non-fatal).',
            { level: 'warn' },
          );
        }
        try {
          await saveHtmlVariant(runFolderName, 'post-captcha', captchaHtml, reclean.html);
          const screenshotPath = path.join(
            getRunFolderPath(runFolderName),
            'screenshot-post-captcha.png',
          );
          await page.screenshot({ path: screenshotPath, fullPage: true });
          await dbLog(db, analysisId, 'Browser', 'Post-captcha artifacts saved.', {
            level: 'info',
          });
        } catch {
          // ignore
        }
      }

      throwIfAborted(effectiveSignal);
      // 6. URL resolution (depth 2) — only when URL does NOT look like a job page and classifier says not job
      let resolvedUrl = finalUrl;
      let resolvedHtml = html;
      const trustUrlAsJobPage = urlLooksLikeJobPage(url);
      if (trustUrlAsJobPage) {
        dbLog(
          db,
          analysisId,
          'Resolver',
          'URL looks like a job/application page — using it directly.',
          { level: 'info' },
        );
      } else if (!isJobPage(classification.type)) {
        await dbLog(
          db,
          analysisId,
          'Resolver',
          'Page is not a job page. Searching for job links...',
          {
            level: 'info',
          },
        );
        const found = await resolveToJobPage(page, html, url, 0, db, analysisId, effectiveSignal);
        if (found) {
          resolvedUrl = found.url;
          resolvedHtml = found.html;
          await dbLog(db, analysisId, 'Resolver', `Found job page at ${resolvedUrl}`, {
            level: 'success',
          });
        } else {
          await dbLog(
            db,
            analysisId,
            'Resolver',
            'Could not find a job page within depth 2. Hard-stopping as non-job page.',
            {
              level: 'error',
            },
          );
          await transitionAssistantStep(db, analysisId, 'error', { runStatusOverride: 'error' });
          return;
        }
      }

      throwIfAborted(effectiveSignal);
      // 7. Extract job detail (RAG-focused content first when enabled, then cleaned/raw fallback)
      await transitionAssistantStep(db, analysisId, 'extracting');
      await dbLog(db, analysisId, 'Extractor', 'Extracting job details...', { level: 'info' });
      const tExtractStart = Date.now();
      const cleanedForExtract = cleanHtml(resolvedHtml);
      let jobDetail: Awaited<ReturnType<typeof extractJobDetail>>;

      const useRag = process.env.DISABLE_JOB_RAG !== '1' && process.env.DISABLE_JOB_RAG !== 'true';
      let focusedHtml: string | null = null;
      let extractionSource: 'rag_focused' | 'cleaned_html' | 'raw_html' = 'cleaned_html';
      if (useRag) {
        throwIfAborted(effectiveSignal);
        const ragResult = await runRagPipeline(runFolderName, resolvedHtml, (msg) =>
          dbLog(db, analysisId, 'RAG', msg, { level: 'info' }),
        );
        throwIfAborted(effectiveSignal);
        focusedHtml = ragResult.focusedHtml;
        if (focusedHtml && ragResult.keptCount > 0) {
          await dbLog(
            db,
            analysisId,
            'RAG',
            `Using ${ragResult.keptCount} focused chunks for extraction.`,
            { level: 'info' },
          );
        }
      }

      if (focusedHtml && focusedHtml.length > 100) {
        jobDetail = await extractJobDetail(focusedHtml, resolvedUrl);
        if (jobDetail.title === 'Untitled' || jobDetail.company === 'Unknown') {
          await dbLog(
            db,
            analysisId,
            'Extractor',
            'RAG-focused extraction missed; trying full cleaned HTML.',
            {
              level: 'info',
            },
          );
          jobDetail = await extractJobDetail(cleanedForExtract.html, resolvedUrl);
          extractionSource = 'cleaned_html';
        }
        if (jobDetail.title !== 'Untitled' && jobDetail.company !== 'Unknown') {
          extractionSource = 'rag_focused';
        }
      } else {
        jobDetail = await extractJobDetail(cleanedForExtract.html, resolvedUrl);
        extractionSource = 'cleaned_html';
      }

      if (
        (jobDetail.title === 'Untitled' || jobDetail.company === 'Unknown') &&
        resolvedHtml.length > 5000
      ) {
        await dbLog(db, analysisId, 'Extractor', 'Cleaned HTML yielded little — trying raw HTML.', {
          level: 'info',
        });
        const rawJob = await extractJobDetail(resolvedHtml, resolvedUrl);
        if (rawJob.title !== 'Untitled' || rawJob.company !== 'Unknown') {
          jobDetail = rawJob;
          extractionSource = 'raw_html';
        }
      }
      if (jobDetail.title === 'Untitled' || jobDetail.company === 'Unknown') {
        await dbLog(
          db,
          analysisId,
          'Extractor',
          'Failed to extract a concrete job (Untitled / Unknown). Stopping analysis.',
          { level: 'error' },
        );
        timings.extractMs = Date.now() - tExtractStart;
        await transitionAssistantStep(db, analysisId, 'error', { runStatusOverride: 'error' });
        return;
      }
      timings.extractMs = Date.now() - tExtractStart;
      dbLog(
        db,
        analysisId,
        'Extractor',
        `Extracted: "${jobDetail.title}" at ${jobDetail.company}`,
        { level: 'success' },
      );
      await updateOrchestratorMemory(runFolderName, {
        currentStep: 'extracting',
        step: {
          step: 'extract',
          completedAt: new Date().toISOString(),
          model: 'GENERAL',
          outputSummary: `"${jobDetail.title}" at ${jobDetail.company}`,
          payload: { jobTitle: jobDetail.title, company: jobDetail.company },
        },
      });

      throwIfAborted(effectiveSignal);
      // 7b. Company identity resolver (multi-signal, DB-aware at app layer)
      const companyResolution = resolveCompanyIdentity({
        pageUrl: resolvedUrl,
        extractedCompany: jobDetail.company,
        jobTitle: jobDetail.title,
        jobDescription: jobDetail.description,
        cleanedHtml: cleanedForExtract.html,
      });
      jobDetail.company = companyResolution.canonicalName;
      await dbLog(
        db,
        analysisId,
        'CompanyResolver',
        `Resolved company: "${companyResolution.canonicalName}" (confidence ${(
          companyResolution.confidence * 100
        ).toFixed(0)}%)`,
        { level: 'info' },
      );

      throwIfAborted(effectiveSignal);
      // 8. Deep Company Dossier (Phase 12) — DB-backed; blocks until enrichment for first-time
      //    companies; reuses cached record when fresh, refreshes when stale (e.g. >30 days).
      let companyResearchText: string | null = null;
      let companySnapshotData: Record<string, unknown> | null = null;
      try {
        throwIfAborted(effectiveSignal);
        await dbLog(
          db,
          analysisId,
          'DeepCompanyDossier',
          'Starting deep company enrichment (DB lookup + web research)...',
          { level: 'info' },
        );

        const jobOrigin = new URL(resolvedUrl).origin;
        const originHost = new URL(resolvedUrl).hostname.toLowerCase();
        const atsOrigin = isAtsJobOrigin(jobOrigin);
        let websiteDomainHint: string | null = null;

        if (!atsOrigin) {
          websiteDomainHint = originHost.startsWith('www.') ? originHost.slice(4) : originHost;
        }

        // 8a. DB lookup: reuse existing company record when not stale.
        const existingCompany = await findCompanyByNameOrDomain(db, {
          name: companyResolution.canonicalName,
          websiteDomainHint,
        });

        if (existingCompany && !needsCompanyRefresh(existingCompany)) {
          await dbLog(
            db,
            analysisId,
            'DeepCompanyDossier',
            `Using existing company record (id=${existingCompany.id}) without refresh.`,
            { level: 'info' },
          );
          companyResearchText = existingCompany.descriptionText ?? null;
          companySnapshotData = toCompanySnapshot(existingCompany);
        } else if (isWrappingUp()) {
          await dbLog(
            db,
            analysisId,
            'DeepCompanyDossier',
            'Skipping deep company research (pipeline wrapping up before deadline).',
            { level: 'warn' },
          );
          companyResearchText = existingCompany?.descriptionText ?? null;
          companySnapshotData = existingCompany ? toCompanySnapshot(existingCompany) : null;
        } else {
          extendDeadlineForDossier();
          await dbLog(
            db,
            analysisId,
            'DeepCompanyDossier',
            `Running deep company dossier (${DOSSIER_INSIDE_ASSISTANT_TIMEOUT_MS / 60_000} min timeout; total pipeline deadline extended).`,
            { level: 'info' },
          );
          // Match admin exactly: dedicated page for DuckDuckGo discovery, no seedUrl/jobDescriptionText
          // so URL discovery and filtering are identical to admin (company-name-only search).
          const dossierPage = await browser.newPage();
          try {
            await dossierPage.setViewportSize({ width: 1280, height: 720 });
            await dossierPage.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
          } catch {
            // ignore
          }
          let deepResult: Awaited<ReturnType<typeof deepResearchCompany>>;
          try {
            deepResult = await deepResearchCompany({
              companyName: companyResolution.canonicalName,
              seedUrl: undefined,
              jobDescriptionText: undefined,
              log: ({ level, message }) =>
                dbLog(db, analysisId, 'DeepCompanyDossier', message, { level }),
              hardTimeoutMs: DOSSIER_INSIDE_ASSISTANT_TIMEOUT_MS, // 10 min when run inside assistant
              browserPage: dossierPage,
              runFolderName: getDossierRunFolderName(companyResolution.canonicalName),
              dossierWriter: createDossierDiskWriter(),
              runCompanyPageRag,
            });
          } finally {
            await dossierPage.close().catch(() => {});
          }

          const upserted = await upsertCompanyEnrichment(db, {
            name: deepResult.companyName,
            normalizedName: deepResult.normalizedName,
            url: deepResult.primaryUrl ?? resolvedUrl,
            origin: jobOrigin,
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

          await dbLog(
            db,
            analysisId,
            'DeepCompanyDossier',
            `Company enrichment upserted (id=${upserted.id}, coverage=${(
              deepResult.coreFieldCoverage * 100
            ).toFixed(0)}%).`,
            { level: 'success' },
          );

          companyResearchText = upserted.descriptionText ?? deepResult.descriptionText;
          companySnapshotData = toCompanySnapshot(upserted);
        }
      } catch (err) {
        dbLog(
          db,
          analysisId,
          'DeepCompanyDossier',
          `Deep company dossier failed (non-fatal): ${
            err instanceof Error ? err.message : String(err)
          }`,
          { level: 'warn' },
        );
      }

      // 9. Update analysis with job detail and company research (row was created at start)
      await updateAnalysis(db, analysisId, {
        url: resolvedUrl,
        jobSummary: jobDetail as unknown as Record<string, unknown>,
        companyResearch: companyResearchText,
        companySnapshot: companySnapshotData,
        runFolderName,
      });
      // Persist extracted job detail JSON artifact for debugging
      try {
        await saveJsonArtifact(runFolderName, 'job-detail.json', jobDetail);
      } catch {
        // ignore
      }

      throwIfAborted(effectiveSignal);
      // 10. Match and downstream (profile already loaded at start)
      await transitionAssistantStep(db, analysisId, 'matching');
      let matchResult = null;
      let resumeSuggestions = null;

      if (profile && profile.name) {
        const profileSnapshot: ProfileSnapshot = {
          name: profile.name,
          location: profile.location ?? null,
          workAuthorization: profile.workAuthorization ?? null,
          seniority: profile.seniority ?? null,
          targetRoles: (profile.targetRoles as string[]) ?? [],
          skills: (profile.skills as string[]) ?? [],
          experience:
            (profile.experience as {
              title: string;
              company: string;
              startDate?: string;
              endDate?: string;
            }[]) ?? [],
          education:
            (profile.education as { institution: string; degree?: string; field?: string }[]) ?? [],
          resumeRawText: profile.resumeRawText ?? null,
        } as ProfileSnapshot & {
          willingToRelocate?: boolean;
          hasCar?: boolean;
          remotePreference?: string;
          targetLocations?: { country: string; state?: string; city?: string }[];
        };
        (profileSnapshot as any).willingToRelocate = preferences?.willingToRelocate ?? undefined;
        (profileSnapshot as any).hasCar = preferences?.hasCar ?? undefined;
        (profileSnapshot as any).remotePreference = preferences?.remotePreference ?? undefined;
        (profileSnapshot as any).targetLocations =
          (preferences?.targetLocations as {
            country: string;
            state?: string;
            city?: string;
          }[]) ?? undefined;

        // 10. Match
        await dbLog(db, analysisId, 'Match', 'Computing profile-job match...', { level: 'info' });
        const tMatchStart = Date.now();
        throwIfAborted(effectiveSignal);
        matchResult = await matchProfileToJob(profileSnapshot, jobDetail);
        throwIfAborted(effectiveSignal);
        dbLog(
          db,
          analysisId,
          'Match',
          `Score: ${matchResult.overallScore}/100 (${matchResult.grade})`,
          { level: 'success' },
        );

        const matchEvidence = {
          model: 'GENERAL',
          summary:
            matchResult.rationale || `Score ${matchResult.overallScore}/100 (${matchResult.grade})`,
          breakdown: matchResult.breakdown,
          strengths: matchResult.strengths,
          gaps: matchResult.gaps,
          strictFilterRejects: matchResult.strictFilterRejects,
        };
        await updateAnalysis(db, analysisId, {
          matchScore: matchResult.overallScore,
          matchGrade: matchResult.grade,
          matchRationale: matchResult.rationale || null,
          matchBreakdown: {
            ...(matchResult.breakdown as unknown as Record<string, unknown>),
            strengths: matchResult.strengths,
            gaps: matchResult.gaps,
          } as Record<string, unknown>,
          strictFilterRejects: matchResult.strictFilterRejects?.length
            ? matchResult.strictFilterRejects
            : null,
          matchEvidence,
        });
        await updateOrchestratorMemory(runFolderName, {
          currentStep: 'matching',
          step: {
            step: 'match',
            completedAt: new Date().toISOString(),
            model: 'GENERAL',
            outputSummary: `Score ${matchResult.overallScore}/100 (${matchResult.grade})`,
            payload: matchEvidence,
          },
        });
        timings.matchMs = Date.now() - tMatchStart;

        // 11. Resume suggestions
        await transitionAssistantStep(db, analysisId, 'writing');
        throwIfAborted(effectiveSignal);
        await dbLog(db, analysisId, 'Resume', 'Generating resume suggestions...', {
          level: 'info',
        });
        const tWritingStart = Date.now();
        resumeSuggestions = await generateResumeSuggestions(profileSnapshot, jobDetail);
        throwIfAborted(effectiveSignal);
        dbLog(
          db,
          analysisId,
          'Resume',
          `${resumeSuggestions.matches.length} matches, ${resumeSuggestions.improvements.length} improvements, ${resumeSuggestions.keywordsToAdd.length} keywords`,
          { level: 'success' },
        );

        const resumeEvidence = {
          model: 'GENERAL',
          summary: `${resumeSuggestions.matches.length} matches, ${resumeSuggestions.improvements.length} improvements, ${resumeSuggestions.keywordsToAdd.length} keywords`,
          matchCount: resumeSuggestions.matches.length,
          improvementCount: resumeSuggestions.improvements.length,
          keywordCount: resumeSuggestions.keywordsToAdd.length,
        };
        await updateAnalysis(db, analysisId, {
          resumeSuggestions: resumeSuggestions as unknown as Record<string, unknown>,
          keywordsToAdd: resumeSuggestions.keywordsToAdd,
          resumeEvidence,
        });
        await updateOrchestratorMemory(runFolderName, {
          currentStep: 'writing',
          step: {
            step: 'resume',
            completedAt: new Date().toISOString(),
            model: 'GENERAL',
            outputSummary: resumeEvidence.summary,
            payload: resumeEvidence,
          },
        });

        throwIfAborted(effectiveSignal);
        // 12. Cover letters (with company research for tailoring)
        await dbLog(db, analysisId, 'CoverLetter', 'Generating cover letters (3 styles)...', {
          level: 'info',
        });
        const coverLetters = await generateCoverLetters(profileSnapshot, jobDetail, {
          companyResearch: companyResearchText ?? undefined,
        });
        await dbLog(
          db,
          analysisId,
          'CoverLetter',
          'Cover letters ready (formal, conversational, bold)',
          {
            level: 'success',
          },
        );

        const coverLettersEvidence = {
          model: 'GENERAL',
          summary: 'Cover letters ready (formal, conversational, bold)',
          styles: ['formal', 'conversational', 'bold'],
        };
        await updateAnalysis(db, analysisId, {
          coverLetters: coverLetters as unknown as Record<string, string>,
          coverLettersEvidence,
        });
        await updateOrchestratorMemory(runFolderName, {
          step: {
            step: 'coverLetters',
            completedAt: new Date().toISOString(),
            model: 'GENERAL',
            outputSummary: coverLettersEvidence.summary,
            payload: coverLettersEvidence,
          },
        });

        throwIfAborted(effectiveSignal);
        // 13. Interview prep (with company research)
        await dbLog(db, analysisId, 'InterviewPrep', 'Generating interview talking points...', {
          level: 'info',
        });
        const interviewBullets = await generateInterviewPrep(profileSnapshot, jobDetail, {
          companyResearch: companyResearchText ?? undefined,
        });
        await dbLog(
          db,
          analysisId,
          'InterviewPrep',
          `${interviewBullets.length} talking points ready`,
          {
            level: 'success',
          },
        );

        await updateAnalysis(db, analysisId, {
          interviewPrepBullets: interviewBullets,
        });
        timings.writingMs = Date.now() - tWritingStart;

        // 14. Salary / level check
        let salaryCheck: string | null = null;
        if (jobDetail.salary || jobDetail.seniority) {
          const parts: string[] = [];
          if (jobDetail.salary) parts.push(`Job salary: ${jobDetail.salary}`);
          if (jobDetail.seniority && profile.seniority) {
            parts.push(
              jobDetail.seniority.toLowerCase().includes(profile.seniority.toLowerCase())
                ? `Seniority matches your level (${profile.seniority})`
                : `Job level: ${jobDetail.seniority}, your level: ${profile.seniority}`,
            );
          }
          salaryCheck = parts.join('. ');
        }

        // 15. Application checklist (simple)
        const checklist = [
          { item: 'Resume tailored to this role', done: false },
          { item: 'Cover letter prepared', done: true },
          { item: 'Review job requirements', done: false },
          ...(jobDetail.requirements.length > 0
            ? [
                {
                  item: `Address ${jobDetail.requirements.length} listed requirements`,
                  done: false,
                },
              ]
            : []),
          { item: 'Research the company', done: false },
          { item: 'Prepare for interview questions', done: true },
        ];

        const contactsEvidence = {
          model: 'N/A',
          summary: 'Contact pipeline not yet run (Phase 16 placeholder).',
          emails: 0,
          linkedIn: 0,
          others: 0,
        };
        await updateAnalysis(db, analysisId, {
          salaryLevelCheck: salaryCheck,
          applicationChecklist: checklist as unknown as Record<string, unknown>[],
          contacts: { emails: [], linkedIn: [], others: [] },
          contactsEvidence,
        });
        await updateOrchestratorMemory(runFolderName, {
          step: {
            step: 'contacts',
            completedAt: new Date().toISOString(),
            outputSummary: contactsEvidence.summary,
            payload: contactsEvidence,
          },
        });
      } else {
        dbLog(
          db,
          analysisId,
          'Match',
          'No profile found — skipping match, resume suggestions, and cover letters. Add a profile for personalized results.',
          { level: 'warn' },
        );

        await updateAnalysis(db, analysisId, {
          matchScore: null,
          contacts: { emails: [], linkedIn: [], others: [] },
        });
      }

      // Phase 16: Outreach pipeline placeholder — will be built next
      await dbLog(
        db,
        analysisId,
        'OutReachPipeline',
        'OutReachPipeline has started. Yet to build.',
        { level: 'info' },
      );
      await updateOrchestratorMemory(runFolderName, {
        currentStep: 'outreach_placeholder',
        step: {
          step: 'outreach_placeholder',
          completedAt: new Date().toISOString(),
          outputSummary: 'Yet to build',
          payload: { status: 'placeholder' },
        },
      });

      await transitionAssistantStep(db, analysisId, 'done', { runStatusOverride: 'done' });
      await dbLog(db, analysisId, 'Pipeline', 'Analysis complete!', { level: 'success' });
      timings.totalMs = Date.now() - t0;
      // Save timings and a compact summary artifact
      try {
        await saveJsonArtifact(runFolderName, 'timings.json', timings);
        await saveJsonArtifact(runFolderName, 'analysis-summary.json', {
          url: resolvedUrl,
          matchScore: matchResult?.overallScore ?? null,
          matchGrade: matchResult?.grade ?? null,
          matchRationale: matchResult?.rationale ?? null,
          strictFilterRejects: matchResult?.strictFilterRejects ?? null,
          hasResumeSuggestions: !!resumeSuggestions,
          hasCoverLetters: !!(profile && profile.name),
          hasInterviewPrep: Array.isArray(
            (await getAnalysisById(db, analysisId))?.interviewPrepBullets,
          )
            ? true
            : false,
        });
        await saveJsonArtifact(runFolderName, 'provenance.json', {
          jobDetail: {
            source: extractionSource,
            ragEnabled: useRag,
            resolvedUrl,
            createdAt: new Date().toISOString(),
          },
        });
      } catch {
        // ignore
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(heartbeat);
      if (browser) {
        try {
          await browser.close();
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stoppedByUser =
      msg === STOPPED_BY_USER_MSG || (typeof msg === 'string' && msg.includes('Stopped by user'));
    await dbLog(db, analysisId, 'Pipeline', stoppedByUser ? 'Stopped by user.' : `Error: ${msg}`, {
      level: 'error',
    });
    await transitionAssistantStep(db, analysisId, 'error', { runStatusOverride: 'error' });
  } finally {
    clearAssistantAbortController(analysisId);
  }
}

/**
 * Try to find a job page by following links up to MAX_RESOLVE_DEPTH.
 */
async function resolveToJobPage(
  page: Page,
  html: string,
  currentUrl: string,
  depth: number,
  db: ReturnType<typeof getDb>,
  analysisId: string,
  abortSignal?: AbortSignal | null,
): Promise<{ url: string; html: string } | null> {
  throwIfAborted(abortSignal);
  if (depth >= MAX_RESOLVE_DEPTH) return null;

  const cleaned = cleanHtml(html);
  const links = extractLinksFromHtml(cleaned.html, currentUrl);

  const jobPatterns = [
    /\/jobs?\//i,
    /\/careers?\//i,
    /\/openings?\//i,
    /\/position/i,
    /\/apply/i,
    /\/vacancy/i,
  ];
  const jobLinks = links.filter((link) => {
    try {
      const u = new URL(link, currentUrl);
      if (u.origin !== new URL(currentUrl).origin) return false;
      return jobPatterns.some((p) => p.test(u.pathname));
    } catch {
      return false;
    }
  });

  const seen = new Set<string>();
  const candidates = jobLinks.filter((l) => {
    const n = normalizeUrl(l);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  for (const candidate of candidates.slice(0, 5)) {
    throwIfAborted(abortSignal);
    try {
      await dbLog(db, analysisId, 'Resolver', `Trying: ${candidate} (depth ${depth + 1})`, {
        level: 'info',
      });
      await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const candidateHtml = await page.content();
      const candidateClean = cleanHtml(candidateHtml);
      const candidateType = await classifyPage(candidateClean.html, candidate);

      if (isJobPage(candidateType.type)) {
        return { url: candidate, html: candidateHtml };
      }

      const deeper = await resolveToJobPage(
        page,
        candidateHtml,
        candidate,
        depth + 1,
        db,
        analysisId,
        abortSignal,
      );
      if (deeper) return deeper;
    } catch {
      continue;
    }
  }

  return null;
}
