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
  type ProfileSnapshot,
} from '@careersignal/agents';
import {
  getDb,
  getProfileByUserId,
  updateAnalysis,
  updateAnalysisRunState,
  insertAnalysisLog,
} from '@careersignal/db';
import { registerLoginWait } from '@/lib/login-wall-state';
import { registerCaptchaSolve } from '@/lib/captcha-state';
import { getScraperStatus } from '@/lib/scraper-state';
import { getRunFolderName, saveApplicationAssistantRun } from '@/lib/application-assistant-disk';

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

/**
 * Run the full Application Assistant pipeline for a single URL.
 * analysisId must refer to an existing row with run_status = 'running'.
 */
export async function runApplicationAssistantPipeline(
  userId: string,
  url: string,
  analysisId: string,
): Promise<void> {
  let browser: Browser | null = null;
  const db = getDb();

  try {
    if (getScraperStatus().running) {
      await dbLog(db, analysisId, 'Pipeline', 'Admin scraper is running. Cannot start.', {
        level: 'error',
      });
      await updateAnalysisRunState(db, analysisId, { runStatus: 'error' });
      return;
    }

    const profile = await getProfileByUserId(db, userId);
    const userName = profile?.name ?? null;

    const heartbeat = setInterval(() => {
      updateAnalysisRunState(db, analysisId, {}).catch(() => {});
    }, 30000);

    try {
      // 1. Launch visible browser
      await updateAnalysisRunState(db, analysisId, { currentStep: 'scraping' });
      await dbLog(db, analysisId, 'Browser', 'Launching visible browser...', { level: 'info' });
      browser = await chromium.launch({ headless: false, args: STEALTH_ARGS });
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

      // 2. Navigate to URL (allow network idle for SPAs like Citadel)
      await dbLog(db, analysisId, 'Browser', `Navigating to ${url}`, { level: 'info' });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // ignore
      }

      let html = await page.content();
      await dbLog(db, analysisId, 'Browser', `Page loaded: ${html.length} chars`, {
        level: 'success',
      });

      // 3. Clean + classify
      const cleanResult = cleanHtml(html);
      let classification = await classifyPage(cleanResult.html, url);
      dbLog(
        db,
        analysisId,
        'Classifier',
        `Page type: ${classification.type} (${classification.confidence.toFixed(2)})`,
        {
          level: 'info',
        },
      );

      // 3b. Persist run to disk for debugging and re-analysis
      const runFolderName = getRunFolderName(userName, userId);
      await saveApplicationAssistantRun(runFolderName, html, cleanResult.html, {
        url,
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
        classification = await classifyPage(reclean.html, url);
        await dbLog(db, analysisId, 'Classifier', `Post-login type: ${classification.type}`, {
          level: 'info',
        });
      }

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
        classification = await classifyPage(reclean.html, url);
      }

      // 6. URL resolution (depth 2) — only when URL does NOT look like a job page and classifier says not job
      let resolvedUrl = url;
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
        const found = await resolveToJobPage(page, html, url, 0, db, analysisId);
        if (found) {
          resolvedUrl = found.url;
          resolvedHtml = found.html;
          await dbLog(db, analysisId, 'Resolver', `Found job page at ${resolvedUrl}`, {
            level: 'success',
          });
        } else {
          dbLog(
            db,
            analysisId,
            'Resolver',
            'Could not find a job page within depth 2. Using original page.',
            { level: 'warn' },
          );
        }
      }

      // 7. Extract job detail (try cleaned first; fallback to raw HTML for JS-heavy pages)
      await updateAnalysisRunState(db, analysisId, { currentStep: 'extracting' });
      await dbLog(db, analysisId, 'Extractor', 'Extracting job details...', { level: 'info' });
      const cleanedForExtract = cleanHtml(resolvedHtml);
      let jobDetail = await extractJobDetail(cleanedForExtract.html, resolvedUrl);
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
        }
      }
      dbLog(
        db,
        analysisId,
        'Extractor',
        `Extracted: "${jobDetail.title}" at ${jobDetail.company}`,
        { level: 'success' },
      );

      // 8. Company research — fetch about/culture page and summarize before analysis
      // Use the job page origin only when it's the company's site; for ATS (Lever, Greenhouse, etc.)
      // origin + /about is the ATS's page, not the company's — so use a company-derived URL or skip.
      let companyResearchText: string | null = null;
      try {
        const jobOrigin = new URL(resolvedUrl).origin;
        const aboutPaths = ['/about', '/who-we-are', '/our-company', '/about-us', '/careers', '/'];
        let baseOrigin: string;
        if (isAtsJobOrigin(jobOrigin)) {
          // Derive company site from name, e.g. "Jobgether" -> https://jobgether.com
          const slug = jobDetail.company
            .replace(/\s*[(\[].*?[)\]]\s*$/g, '')
            .replace(/[^a-z0-9-]/gi, '')
            .toLowerCase()
            .slice(0, 50);
          if (slug) {
            baseOrigin = `https://${slug}.com`;
            await dbLog(
              db,
              analysisId,
              'CompanyResearch',
              `Job page is ATS; trying company site: ${baseOrigin}`,
              { level: 'info' },
            );
          } else {
            baseOrigin = '';
          }
        } else {
          baseOrigin = jobOrigin;
        }
        if (baseOrigin) {
          for (const aboutPath of aboutPaths) {
            const aboutUrl = `${baseOrigin}${aboutPath}`;
            if (aboutUrl === resolvedUrl && aboutPath !== '/') continue;
            try {
              await dbLog(
                db,
                analysisId,
                'CompanyResearch',
                `Fetching company context: ${aboutUrl}`,
                {
                  level: 'info',
                },
              );
              await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await page.waitForTimeout(2000);
              const aboutHtml = await page.content();
              const aboutClean = cleanHtml(aboutHtml);
              const research = await researchCompanyFromHtml(
                jobDetail.company,
                aboutClean.html,
                aboutUrl,
              );
              const parts = [research.summary, research.culture, research.norms].filter(Boolean);
              if (parts.length > 0) {
                companyResearchText = parts.join('\n\n');
                await dbLog(db, analysisId, 'CompanyResearch', 'Company summary captured.', {
                  level: 'success',
                });
                break;
              }
            } catch {
              continue;
            }
          }
        }
        if (!companyResearchText) {
          await dbLog(
            db,
            analysisId,
            'CompanyResearch',
            baseOrigin
              ? 'No company page content used.'
              : 'Skipped (job on ATS; no company site to research).',
            { level: 'info' },
          );
        }
      } catch (err) {
        dbLog(
          db,
          analysisId,
          'CompanyResearch',
          `Skipped: ${err instanceof Error ? err.message : String(err)}`,
          { level: 'warn' },
        );
      }

      // 9. Update analysis with job detail and company research (row was created at start)
      await updateAnalysis(db, analysisId, {
        url: resolvedUrl,
        jobSummary: jobDetail as unknown as Record<string, unknown>,
        companyResearch: companyResearchText,
        runFolderName,
      });

      // 10. Match and downstream (profile already loaded at start)
      await updateAnalysisRunState(db, analysisId, { currentStep: 'matching' });
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
        };

        // 10. Match
        await dbLog(db, analysisId, 'Match', 'Computing profile-job match...', { level: 'info' });
        matchResult = await matchProfileToJob(profileSnapshot, jobDetail);
        dbLog(
          db,
          analysisId,
          'Match',
          `Score: ${matchResult.overallScore}/100 (${matchResult.grade})`,
          { level: 'success' },
        );

        await updateAnalysis(db, analysisId, {
          matchScore: matchResult.overallScore,
          matchGrade: matchResult.grade,
          matchBreakdown: matchResult.breakdown as unknown as Record<string, unknown>,
        });

        // 11. Resume suggestions
        await updateAnalysisRunState(db, analysisId, { currentStep: 'writing' });
        await dbLog(db, analysisId, 'Resume', 'Generating resume suggestions...', {
          level: 'info',
        });
        resumeSuggestions = await generateResumeSuggestions(profileSnapshot, jobDetail);
        dbLog(
          db,
          analysisId,
          'Resume',
          `${resumeSuggestions.matches.length} matches, ${resumeSuggestions.improvements.length} improvements, ${resumeSuggestions.keywordsToAdd.length} keywords`,
          { level: 'success' },
        );

        await updateAnalysis(db, analysisId, {
          resumeSuggestions: resumeSuggestions as unknown as Record<string, unknown>,
          keywordsToAdd: resumeSuggestions.keywordsToAdd,
        });

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

        await updateAnalysis(db, analysisId, {
          coverLetters: coverLetters as unknown as Record<string, string>,
        });

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

        await updateAnalysis(db, analysisId, {
          salaryLevelCheck: salaryCheck,
          applicationChecklist: checklist as unknown as Record<string, unknown>[],
          contacts: { emails: [], linkedIn: [], others: [] },
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

      await updateAnalysisRunState(db, analysisId, { runStatus: 'done', currentStep: 'done' });
      await dbLog(db, analysisId, 'Pipeline', 'Analysis complete!', { level: 'success' });
    } finally {
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
    await dbLog(db, analysisId, 'Pipeline', `Error: ${msg}`, { level: 'error' });
    await updateAnalysisRunState(db, analysisId, { runStatus: 'error', currentStep: 'error' });
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
): Promise<{ url: string; html: string } | null> {
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
      );
      if (deeper) return deeper;
    } catch {
      continue;
    }
  }

  return null;
}
