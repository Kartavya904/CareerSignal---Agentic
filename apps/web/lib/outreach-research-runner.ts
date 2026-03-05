/**
 * Deep Outreach Research Pipeline runner.
 * Shared by admin (contact-outreach API) and Application Assistant.
 * Flow: parse job → priority contact → strategy → people search (DDG, LinkedIn) → verify → rank → email pattern → outreach drafts.
 */

import type { Page } from 'playwright';
import {
  ensureOutreachRunFolder,
  readOutreachMemory,
  writeOutreachMemory,
  writeOutreachPageRawAndCleaned,
  getOutreachPageDir,
  urlToOutreachSlug,
  type OutreachMemory,
  type SearchResultTrackingEntry,
} from './outreach-research-disk';

export type { OutreachMemory } from './outreach-research-disk';
import { searchWebViaBrowser, cleanHtml, type SearchResult } from '@careersignal/agents';
import {
  determineContactStrategy,
  extractFromTeamPage,
  filterByArchetype,
  verifyContact,
  selectTopContacts,
  inferEmailPattern,
  type ContactSearchResult,
  type ContactStrategy,
  type Contact,
} from '@careersignal/agents';
import type { NormalizedJob } from '@careersignal/agents';

/**
 * Timeout for the full outreach pipeline (admin or assistant).
 * Run folder: data_outreach_research/ (see outreach-research-disk.ts).
 * For the 5 admin test jobs, company must exist in DB so dossier is not triggered.
 */
export const OUTREACH_PIPELINE_TIMEOUT_MS = 15 * 60 * 1000; // 15 min

/** Max pages to actually visit for contact extraction (team/company pages). Use full budget. */
const MAX_PAGES_TO_VISIT = 30;
/** Reserve this much time (ms) for LinkedIn + verify + ranking + drafts. Rest is for DDG + visiting. */
const RESERVE_FOR_FINAL_PHASE_MS = 4 * 60 * 1000; // 4 min
const DDG_DELAY_MS = 1500;

export interface OutreachJobInput {
  title: string;
  companyName: string;
  description?: string;
  sourceUrl: string;
  applyUrl?: string;
  id?: string;
}

export interface OutreachCompanyInput {
  id: string;
  name: string;
  websiteDomain?: string | null;
  descriptionText?: string | null;
  [key: string]: unknown;
}

export interface OutreachProfileInput {
  name: string | null;
  skills?: string[];
  targetRoles?: string[];
  [key: string]: unknown;
}

/** Existing contact from DB (same company) to suggest as fallback for this position. */
export interface ExistingContactFromDb {
  name: string;
  role?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  archetype?: string | null;
}

/** Return value for onProgress: continue running, retry current phase, or stop. */
export type OutreachProgressDecision = 'continue' | 'retry' | 'stop';

export interface RunOutreachResearchOptions {
  job: OutreachJobInput;
  company: OutreachCompanyInput | null;
  profile: OutreachProfileInput | null;
  runFolderName: string;
  log: (opts: { level: string; message: string }) => void;
  browserPage?: Page | null;
  hardTimeoutMs: number;
  abortSignal?: AbortSignal | null;
  /** Fallback: existing contacts for the same company from DB (reuse for this role). */
  existingContactsFromDb?: ExistingContactFromDb[];
  /** When true, save raw + cleaned HTML per visited URL under pages/<urlSlug>/ and optionally run RAG. */
  saveHtmlPerUrl?: boolean;
  /** When set with saveHtmlPerUrl, run RAG (chunk, embed, focused content) for each visited page. */
  runRagForVisitedPages?: (
    outputDir: string,
    cleanedHtml: string,
    onLog?: (msg: string) => void,
  ) => Promise<{ focusedHtml: string | null }>;
  /** Optional: called after major steps with current memory; return 'stop' to exit early, 'continue' to proceed (enables brain/retry integration). */
  onProgress?: (phase: string, memory: OutreachMemory) => Promise<OutreachProgressDecision>;
}

export interface RunOutreachResearchResult {
  success: boolean;
  error?: string;
  contacts: unknown[];
  drafts: unknown[];
  visitedUrls: string[];
  runFolderName: string;
  bestFirst?: unknown;
  rankedContacts?: unknown[];
}

function now(): string {
  return new Date().toISOString();
}

/** Parse job description for email or LinkedIn URL (priority contact). */
function parseJobBodyForContact(description: string): { email?: string; linkedinUrl?: string } {
  const out: { email?: string; linkedinUrl?: string } = {};
  if (!description || !description.trim()) return out;
  const emailMatch = description.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) out.email = emailMatch[0];
  const linkedInMatch = description.match(
    /https?:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/,
  );
  if (linkedInMatch) out.linkedinUrl = linkedInMatch[0];
  return out;
}

/** Build a minimal NormalizedJob for contact/outreach agents. */
function toNormalizedJob(job: OutreachJobInput, runFolderName: string): NormalizedJob {
  const t = now();
  return {
    id: job.id ?? runFolderName,
    runId: runFolderName,
    sourceId: job.sourceUrl,
    title: job.title,
    companyName: job.companyName,
    sourceUrl: job.sourceUrl,
    description: job.description,
    applyUrl: job.applyUrl ?? job.sourceUrl,
    dedupeKey: job.sourceUrl,
    createdAt: t,
    updatedAt: t,
  } as NormalizedJob;
}

/** Normalize URL for dedupe (lowercase, strip trailing slash). */
function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url);
    let s = u.href.toLowerCase().replace(/\/$/, '');
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/** Check if URL looks like company/team/careers (for visiting). */
function isRelevantForPeopleSearch(
  url: string,
  companyName: string,
  websiteDomain?: string | null,
): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.toLowerCase();
    if (host.includes('linkedin.com')) return true;
    if (websiteDomain && host.includes(websiteDomain.replace(/^www\./, ''))) return true;
    if (/\/team|\/about|\/careers|\/people|\/leadership|\/our-team/i.test(path)) return true;
    if (host.includes(companyName.toLowerCase().replace(/\s+/g, ''))) return true;
    return false;
  } catch {
    return false;
  }
}

/** Keywords in title/snippet that suggest the page may contain contacts (team, about, etc.). */
const CONTACT_PAGE_SIGNALS = [
  'team',
  'about us',
  'about ',
  'people',
  'leadership',
  'our team',
  'meet the team',
  'careers',
  'contact',
  'management',
  'staff',
  'who we are',
  'company',
  'culture',
];

/**
 * Score a search result by how likely its title/snippet indicates a contact-rich page (0 = low, higher = better).
 * Used to rank page-1 results and pick the top 2 URLs to visit.
 */
function scoreResultForContactLikelihood(r: SearchResult, companyName: string): number {
  const companySlug = companyName.toLowerCase().replace(/\s+/g, '');
  const text = `${(r.title ?? '').toLowerCase()} ${(r.snippet ?? '').toLowerCase()}`;
  let score = 0;
  for (const signal of CONTACT_PAGE_SIGNALS) {
    if (text.includes(signal)) score += 2;
  }
  if (companySlug && text.includes(companySlug)) score += 1;
  return score;
}

/**
 * Rank page-1 search results by contact likelihood (best first). Tie-break: prefer shorter titles (often more specific).
 */
function rankSearchResultsForContacts(
  results: SearchResult[],
  companyName: string,
): SearchResult[] {
  return [...results].sort((a, b) => {
    const sa = scoreResultForContactLikelihood(a, companyName);
    const sb = scoreResultForContactLikelihood(b, companyName);
    if (sb !== sa) return sb - sa;
    return (a.title?.length ?? 0) - (b.title?.length ?? 0);
  });
}

/**
 * Run the Deep Outreach Research pipeline.
 * Phase 3: parse job, strategy, DDG people search, persist candidates and visitedUrls.
 */
export async function runOutreachResearch(
  options: RunOutreachResearchOptions,
): Promise<RunOutreachResearchResult> {
  const { job, company, profile, runFolderName, log, browserPage, hardTimeoutMs, abortSignal } =
    options;
  const deadline = Date.now() + hardTimeoutMs;
  const throwIfAborted = () => {
    if (abortSignal?.aborted) throw new Error('Stopped by user');
    if (Date.now() > deadline) throw new Error('Outreach pipeline timeout');
  };

  await ensureOutreachRunFolder(runFolderName);
  const { saveHtmlPerUrl, runRagForVisitedPages, onProgress } = options;
  let memory: OutreachMemory = {
    updatedAt: now(),
    runFolderName,
    visitedUrls: [],
    urlsToVisit: [],
    discoveredUrls: [],
    steps: {},
  };
  await writeOutreachMemory(runFolderName, memory);

  log({
    level: 'info',
    message: `Starting Deep Outreach Research for "${job.title}" at ${job.companyName}`,
  });
  throwIfAborted();

  const normalizedJob = toNormalizedJob(job, runFolderName);
  const companySize = undefined; // could derive from company later

  // 1. Parse job body for email/LinkedIn → priority contact
  const jobContact = parseJobBodyForContact(job.description ?? '');
  let priorityContact: ContactSearchResult | null = null;
  if (jobContact.email || jobContact.linkedinUrl) {
    priorityContact = {
      name: 'Contact from job posting',
      role: undefined,
      company: job.companyName,
      linkedinUrl: jobContact.linkedinUrl,
      evidenceUrl: job.sourceUrl,
      evidenceSnippet: jobContact.email
        ? `Email in job description: ${jobContact.email}`
        : 'LinkedIn URL in job description',
      confidence: 0.95,
      source: 'job_posting',
    };
    if (jobContact.email) (priorityContact as Record<string, unknown>).email = jobContact.email;
    log({
      level: 'info',
      message: `Priority contact from job body: ${jobContact.email ?? jobContact.linkedinUrl}`,
    });
  }

  // 2. Contact strategy
  log({ level: 'info', message: 'Computing contact strategy...' });
  const strategy: ContactStrategy = await determineContactStrategy(normalizedJob, companySize);
  memory.strategy = strategy;
  memory.priorityContact = priorityContact ?? undefined;
  memory.updatedAt = now();
  await writeOutreachMemory(runFolderName, memory);
  throwIfAborted();

  const strategyDecision = await onProgress?.('after_strategy', memory);
  if (strategyDecision === 'stop') {
    memory.steps = {
      ...memory.steps,
      contact_discovery: {
        step: 'contact_discovery',
        completedAt: now(),
        outputSummary: 'Stopped by brain/onProgress after strategy',
        payload: { stopped: true },
      },
    };
    memory.updatedAt = now();
    await writeOutreachMemory(runFolderName, memory);
    return {
      success: true,
      contacts: [],
      drafts: [],
      visitedUrls: memory.visitedUrls ?? [],
      runFolderName,
    };
  }

  /** Candidates may include optional email (e.g. from DB reuse). */
  const candidates: (ContactSearchResult & { email?: string })[] = priorityContact
    ? [priorityContact]
    : [];
  const visitedUrls = new Set<string>(memory.visitedUrls);

  // 2b. Fallback: add existing contacts for this company from DB (reuse for this position)
  const existingFromDb = options.existingContactsFromDb ?? [];
  if (existingFromDb.length > 0) {
    for (const ec of existingFromDb) {
      candidates.push({
        name: ec.name,
        role: ec.role ?? undefined,
        company: job.companyName,
        email: ec.email ?? undefined,
        linkedinUrl: ec.linkedinUrl ?? undefined,
        evidenceUrl: 'db',
        evidenceSnippet: 'Same company contact from DB (reuse)',
        confidence: 0.5,
        source: 'reuse',
      });
    }
    log({
      level: 'info',
      message: `Added ${existingFromDb.length} existing company contact(s) from DB as fallback.`,
    });
  }

  // 3. People search via DuckDuckGo: track all page-1 results, rank, visit top 2 per query; save HTML per URL when requested
  const searchResultTracking: SearchResultTrackingEntry[] = [];
  const discoveredUrlsList: string[] = [];
  const urlsToVisitList: string[] = [];
  const contactDiscoveryDeadline = deadline - RESERVE_FOR_FINAL_PHASE_MS;

  if (browserPage && strategy.searchQueries.length > 0) {
    log({
      level: 'info',
      message: `Running DuckDuckGo people search (${strategy.searchQueries.length} queries); visiting up to ${MAX_PAGES_TO_VISIT} pages until ${new Date(contactDiscoveryDeadline).toISOString()} then LinkedIn.`,
    });
    let pagesVisited = 0;
    for (let i = 0; i < strategy.searchQueries.length; i++) {
      throwIfAborted();
      if (Date.now() >= contactDiscoveryDeadline) {
        log({ level: 'info', message: 'Contact discovery time budget used; moving to LinkedIn.' });
        break;
      }
      const decision = await onProgress?.('ddg_people_search', memory);
      if (decision === 'stop') break;

      const query = strategy.searchQueries[i]!;
      const results: SearchResult[] = await searchWebViaBrowser(browserPage, query);

      const page1Snapshot = results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.snippet,
      }));
      const entry: SearchResultTrackingEntry = {
        query,
        page1Results: page1Snapshot,
        topPickedUrls: [],
      };
      searchResultTracking.push(entry);

      for (const r of results) {
        const key = normalizeUrlForDedupe(r.url);
        visitedUrls.add(key);
        if (!discoveredUrlsList.includes(key)) discoveredUrlsList.push(r.url);
      }

      const relevant = results.filter((r) => {
        if (r.url.includes('linkedin.com')) return false;
        return isRelevantForPeopleSearch(r.url, job.companyName, company?.websiteDomain ?? null);
      });
      const ranked = rankSearchResultsForContacts(relevant, job.companyName);
      const top2 = ranked.slice(0, 2);
      entry.topPickedUrls = top2.map((r) => r.url);
      for (const r of top2) urlsToVisitList.push(r.url);

      for (const r of top2) {
        if (pagesVisited >= MAX_PAGES_TO_VISIT) break;
        throwIfAborted();
        try {
          await browserPage.goto(r.url, {
            waitUntil: 'domcontentloaded',
            timeout: 15_000,
          });
          const rawHtml = await browserPage.content();
          pagesVisited++;

          const cleanResult = cleanHtml(rawHtml, r.url);
          const cleanedHtml = cleanResult.html;
          let htmlForExtract = cleanedHtml;

          if (saveHtmlPerUrl) {
            const urlSlug = urlToOutreachSlug(r.url, pagesVisited - 1);
            await writeOutreachPageRawAndCleaned(runFolderName, urlSlug, rawHtml, cleanedHtml);
            if (runRagForVisitedPages) {
              const pageDir = getOutreachPageDir(runFolderName, urlSlug);
              const ragResult = await runRagForVisitedPages(pageDir, cleanedHtml, (msg) =>
                log({ level: 'info', message: msg }),
              );
              if (ragResult?.focusedHtml) htmlForExtract = ragResult.focusedHtml;
            }
          }

          const people = await extractFromTeamPage(htmlForExtract, job.companyName, r.url);
          const filtered = filterByArchetype(people, strategy.targetArchetypes);
          for (const p of filtered) {
            if (!candidates.some((c) => c.name === p.name && c.evidenceUrl === p.evidenceUrl)) {
              candidates.push(p);
            }
          }
          log({
            level: 'info',
            message: `Visited (top pick) ${r.url.slice(0, 50)}... found ${filtered.length} candidates`,
          });
        } catch {
          // already in visitedUrls
        }
      }

      memory.searchResultTracking = searchResultTracking;
      memory.discoveredUrls = [...discoveredUrlsList];
      memory.urlsToVisit = [...urlsToVisitList];
      memory.visitedUrls = Array.from(visitedUrls);
      await writeOutreachMemory(runFolderName, memory);

      if (i < strategy.searchQueries.length - 1) {
        await new Promise((r) => setTimeout(r, DDG_DELAY_MS));
      }
    }
  }

  // 4. LinkedIn discovery: always run when we have a browser (not only when DDG people search ran)
  if (browserPage) {
    const decision = await onProgress?.('before_linkedin', memory);
    if (decision !== 'stop') {
      const linkedInQueries = [
        `site:linkedin.com/in "${job.companyName}"`,
        `linkedin "${job.companyName}" ${job.title}`,
        `linkedin "${job.companyName}" recruiter`,
        `linkedin "${job.companyName}" hiring`,
        `"${job.companyName}" site:linkedin.com/in`,
      ];
      log({
        level: 'info',
        message: `Running LinkedIn discovery (${linkedInQueries.length} queries)...`,
      });
      for (const query of linkedInQueries) {
        throwIfAborted();
        if (Date.now() >= contactDiscoveryDeadline) break;
        const results: SearchResult[] = await searchWebViaBrowser(browserPage, query);
        for (const r of results) {
          if (!r.url.includes('linkedin.com/in/')) continue;
          const key = normalizeUrlForDedupe(r.url);
          if (visitedUrls.has(key)) continue;
          visitedUrls.add(key);
          discoveredUrlsList.push(r.url);
          const nameFromTitle =
            r.title && r.title !== 'LinkedIn'
              ? r.title.replace(/\s*\|\s*LinkedIn.*$/i, '').trim()
              : undefined;
          candidates.push({
            name: nameFromTitle ?? 'LinkedIn profile',
            role: undefined,
            company: job.companyName,
            linkedinUrl: r.url,
            evidenceUrl: r.url,
            evidenceSnippet: r.snippet ?? `Found via: ${query}`,
            confidence: 0.6,
            source: 'linkedin_search',
          });
        }
        await new Promise((r) => setTimeout(r, DDG_DELAY_MS));
      }
      log({
        level: 'info',
        message: `LinkedIn discovery: ${candidates.filter((c) => c.source === 'linkedin_search').length} profile(s) found.`,
      });
      memory.discoveredUrls = [...discoveredUrlsList];
      memory.visitedUrls = Array.from(visitedUrls);
      await writeOutreachMemory(runFolderName, memory);
    }
  }

  // 4b. Fallback: if still no candidates and time left, try extra DDG queries (recruiter, hiring manager, careers contact)
  if (
    browserPage &&
    candidates.length === 0 &&
    Date.now() < contactDiscoveryDeadline &&
    strategy.searchQueries.length > 0
  ) {
    const fallbackQueries = [
      `"${job.companyName}" recruiter`,
      `"${job.companyName}" hiring manager`,
      `"${job.companyName}" talent team`,
      `"${job.companyName}" careers contact`,
    ];
    log({
      level: 'info',
      message: `No candidates yet; running ${fallbackQueries.length} fallback DDG queries until ${new Date(contactDiscoveryDeadline).toISOString()}...`,
    });
    let pagesVisitedFallback = 0;
    const maxFallbackVisits = Math.min(8, MAX_PAGES_TO_VISIT - 0); // up to 8 more pages (we already counted visits above)
    for (const query of fallbackQueries) {
      throwIfAborted();
      if (Date.now() >= contactDiscoveryDeadline || pagesVisitedFallback >= maxFallbackVisits)
        break;
      const results: SearchResult[] = await searchWebViaBrowser(browserPage, query);
      const relevant = results.filter((r) => {
        if (r.url.includes('linkedin.com')) return false;
        return isRelevantForPeopleSearch(r.url, job.companyName, company?.websiteDomain ?? null);
      });
      const ranked = rankSearchResultsForContacts(relevant, job.companyName);
      const top2 = ranked.slice(0, 2);
      for (const r of top2) {
        if (pagesVisitedFallback >= maxFallbackVisits) break;
        const key = normalizeUrlForDedupe(r.url);
        if (visitedUrls.has(key)) continue;
        throwIfAborted();
        try {
          await browserPage.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
          const rawHtml = await browserPage.content();
          pagesVisitedFallback++;
          visitedUrls.add(key);
          discoveredUrlsList.push(r.url);

          const cleanResult = cleanHtml(rawHtml, r.url);
          const cleanedHtml = cleanResult.html;
          let htmlForExtract = cleanedHtml;
          if (saveHtmlPerUrl) {
            const urlSlug = urlToOutreachSlug(
              r.url,
              memory.visitedUrls.length + pagesVisitedFallback - 1,
            );
            await writeOutreachPageRawAndCleaned(runFolderName, urlSlug, rawHtml, cleanedHtml);
            if (runRagForVisitedPages) {
              const pageDir = getOutreachPageDir(runFolderName, urlSlug);
              const ragResult = await runRagForVisitedPages(pageDir, cleanedHtml, (msg) =>
                log({ level: 'info', message: msg }),
              );
              if (ragResult?.focusedHtml) htmlForExtract = ragResult.focusedHtml;
            }
          }
          const people = await extractFromTeamPage(htmlForExtract, job.companyName, r.url);
          const filtered = filterByArchetype(people, strategy.targetArchetypes);
          for (const p of filtered) {
            if (!candidates.some((c) => c.name === p.name && c.evidenceUrl === p.evidenceUrl)) {
              candidates.push(p);
            }
          }
          log({
            level: 'info',
            message: `Fallback visit ${r.url.slice(0, 50)}... found ${filtered.length} candidates`,
          });
        } catch {
          visitedUrls.add(key);
        }
      }
      await new Promise((r) => setTimeout(r, DDG_DELAY_MS));
    }
    memory.visitedUrls = Array.from(visitedUrls);
    memory.discoveredUrls = [...discoveredUrlsList];
    await writeOutreachMemory(runFolderName, memory);
  }

  memory.candidates = candidates;
  memory.visitedUrls = Array.from(visitedUrls);
  memory.urlsToVisit = urlsToVisitList.length > 0 ? urlsToVisitList : memory.urlsToVisit;
  memory.discoveredUrls =
    discoveredUrlsList.length > 0 ? discoveredUrlsList : memory.discoveredUrls;
  memory.steps = {
    ...memory.steps,
    contact_discovery: {
      step: 'contact_discovery',
      completedAt: now(),
      outputSummary: `${candidates.length} candidate(s) (priority + DDG + LinkedIn)`,
      payload: { count: candidates.length, strategy: strategy.reasoning },
    },
  };
  memory.updatedAt = now();
  await writeOutreachMemory(runFolderName, memory);
  throwIfAborted();

  // 5. Contact verifier and ranking (best-first + list max 3)
  const verified: Contact[] = [];
  const archetypeOrder = strategy.targetArchetypes;
  for (const cand of candidates) {
    throwIfAborted();
    const archetype = archetypeOrder[0] ?? 'HIRING_MANAGER';
    const { contact, isVerified } = await verifyContact(cand, normalizedJob, archetype);
    if (isVerified || contact.confidence >= 0.35) {
      verified.push(contact);
    }
  }
  const ranked = selectTopContacts(verified, 3);
  const bestFirst = ranked[0] ?? null;
  memory.contacts = ranked;
  memory.steps = {
    ...memory.steps,
    verify_rank: {
      step: 'verify_rank',
      completedAt: now(),
      outputSummary: `Ranked ${ranked.length} contact(s); best-first: ${bestFirst ? bestFirst.name : 'none'}`,
      payload: { bestFirst, ranked },
    },
  };
  memory.updatedAt = now();
  await writeOutreachMemory(runFolderName, memory);
  log({
    level: 'info',
    message: `Ranked ${ranked.length} contact(s). Best: ${bestFirst ? bestFirst.name : '—'}.`,
  });
  throwIfAborted();

  // 6. Email-pattern agent (infer emails for contacts without one)
  const contactsWithEmail: unknown[] = [];
  for (const c of ranked) {
    const contact = c as Contact & {
      email?: string;
      candidateEmails?: string[];
      fallbackLinkedInSearchUrl?: string;
    };
    if (contact.email) {
      contactsWithEmail.push(contact);
      continue;
    }
    try {
      const inferred = inferEmailPattern({
        companyDomain: company?.websiteDomain ?? undefined,
        personName: contact.name,
      });
      if (inferred.candidateEmails?.length) {
        (contact as Record<string, unknown>).candidateEmails = inferred.candidateEmails;
        (contact as Record<string, unknown>).email = inferred.candidateEmails[0];
      }
      if (inferred.fallbackLinkedInSearchUrl) {
        (contact as Record<string, unknown>).fallbackLinkedInSearchUrl =
          inferred.fallbackLinkedInSearchUrl;
      }
    } catch {
      // skip
    }
    contactsWithEmail.push(contact);
  }
  memory.contacts = contactsWithEmail;
  memory.updatedAt = now();
  await writeOutreachMemory(runFolderName, memory);
  throwIfAborted();

  // 7. Outreach drafts: not generated in pipeline; user creates on-demand per contact from the UI
  const drafts: unknown[] = [];
  memory.drafts = drafts;
  memory.steps = {
    ...memory.steps,
    done: {
      step: 'done',
      completedAt: now(),
      outputSummary: `Contacts: ${contactsWithEmail.length}`,
      payload: { contacts: contactsWithEmail, drafts },
    },
  };
  memory.updatedAt = now();
  await writeOutreachMemory(runFolderName, memory);

  log({
    level: 'success',
    message: `Outreach pipeline complete. ${contactsWithEmail.length} contact(s). Create drafts on demand from the contacts list.`,
  });

  return {
    success: true,
    contacts: contactsWithEmail,
    drafts,
    visitedUrls: Array.from(visitedUrls),
    runFolderName,
    bestFirst: bestFirst ?? undefined,
    rankedContacts: ranked,
  };
}
