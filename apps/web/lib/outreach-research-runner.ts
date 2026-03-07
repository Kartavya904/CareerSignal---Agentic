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
import {
  searchWebViaBrowser,
  cleanHtml,
  type SearchResult,
  type ContactArchetype,
  determineContactStrategy,
  type NormalizedJob,
  verifyContact,
  selectTopContacts,
  type Contact,
  type ContactSearchResult,
  inferEmailPattern,
} from '@careersignal/agents';
import {
  extractFromTeamPage,
  filterByArchetype,
  type ContactStrategy,
} from '@careersignal/agents';
// import type { NormalizedJob } from '@careersignal/agents'; // This was moved into the combined import

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
const DDG_DELAY_MIN_MS = 2500;
const DDG_DELAY_MAX_MS = 5000;
/** Randomized delay between search queries to avoid bot detection. */
function randomDelay(): Promise<void> {
  const ms = DDG_DELAY_MIN_MS + Math.random() * (DDG_DELAY_MAX_MS - DDG_DELAY_MIN_MS);
  return new Promise((r) => setTimeout(r, ms));
}

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
  /** Whether to save raw and cleaned HTML to disk per URL visited (default: false). */
  saveHtmlPerUrl?: boolean;
  /** Optional: called after major steps with current memory; return 'stop' to exit early, 'continue' to proceed (enables brain/retry integration). */
  onProgress?: (phase: string, memory: OutreachMemory) => Promise<OutreachProgressDecision>;
  /** How many ranked contacts to return (default 15). */
  maxRankedContacts?: number;
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
function parseJobBodyForContact(description: string): { email?: string; linkedinUrl?: string; teamLinks?: string[] } {
  const out: { email?: string; linkedinUrl?: string; teamLinks?: string[] } = {};
  if (!description || !description.trim()) return out;
  const emailMatches = description.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
  if (emailMatches) {
    const generic = /^(info|careers|jobs|privacy|contact|hello|support|hr|admin)@/i;
    const personalEmail = emailMatches.find((e) => !generic.test(e));
    if (personalEmail) out.email = personalEmail;
  }
  const linkedInMatch = description.match(
    /https?:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/,
  );
  if (linkedInMatch) out.linkedinUrl = linkedInMatch[0];

  const urlRegex = /https?:\/\/[^\s"'>]+/g;
  const urls = description.match(urlRegex) || [];
  const teamLinks = urls.filter((u) => /\/(team|about|people|leadership|careers)/i.test(u) && !u.includes('linkedin.com') && !u.includes('greenhouse.io') && !u.includes('lever.co'));
  if (teamLinks.length > 0) {
    out.teamLinks = Array.from(new Set(teamLinks)).slice(0, 3);
  }
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
  const { saveHtmlPerUrl, onProgress } = options;
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

  /** Candidates may include optional email or location. */
  const candidates: (ContactSearchResult & { email?: string; location?: string })[] = priorityContact
    ? [priorityContact]
    : [];
  const visitedUrls = new Set<string>(memory.visitedUrls);

  // 3. People search via DuckDuckGo: track all page-1 results, rank, visit top 2 per query; save HTML per URL when requested
  const searchResultTracking: SearchResultTrackingEntry[] = [];
  const discoveredUrlsList: string[] = [];
  const urlsToVisitList: string[] = [];
  const contactDiscoveryDeadline = deadline - RESERVE_FOR_FINAL_PHASE_MS;

  // 2c. Visit Job Page directly & Extract Contacts / Team links from it
  if (browserPage && job.sourceUrl) {
    try {
      log({ level: 'info', message: `Visiting job posting URL to find contacts and team links: ${job.sourceUrl.slice(0, 50)}...` });
      const key = normalizeUrlForDedupe(job.sourceUrl);
      if (!visitedUrls.has(key)) {
        await browserPage.goto(job.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        const rawHtml = await browserPage.content();
        visitedUrls.add(key);
        if (!discoveredUrlsList.includes(job.sourceUrl)) discoveredUrlsList.push(job.sourceUrl);

        const cleanResult = cleanHtml(rawHtml, job.sourceUrl);
        
        // Extract people directly from the job posting HTML
        const people = await extractFromTeamPage(cleanResult.html, job.companyName, job.sourceUrl);
        const filtered = filterByArchetype(people, strategy.targetArchetypes);
        for (const p of filtered) {
          if (!candidates.some((c) => c.name === p.name && c.evidenceUrl === p.evidenceUrl)) {
            candidates.push({ ...p, source: 'job_posting_page' });
          }
        }
        if (filtered.length > 0) {
          log({ level: 'info', message: `Found ${filtered.length} priority candidates directly on the job posting page!` });
        }

        // Try extracting team links from this DOM directly
        const pageTeamLinks = await browserPage.evaluate(() => {
          return Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => /\/(team|about|people|leadership|careers)/i.test(href) && !href.includes('linkedin.com') && !href.includes('greenhouse.io') && !href.includes('lever.co'));
        });
        
        if (pageTeamLinks.length > 0) {
           const newLinks = Array.from(new Set(pageTeamLinks)).slice(0, 3);
           jobContact.teamLinks = Array.from(new Set([...(jobContact.teamLinks || []), ...newLinks])).slice(0, 3);
        }
      }
    } catch {
       const key = normalizeUrlForDedupe(job.sourceUrl);
       visitedUrls.add(key);
    }
  }

  // 2d. Direct extraction from embedded "Team/About" links in job description or job page
  if (browserPage && jobContact.teamLinks && jobContact.teamLinks.length > 0) {
    log({
      level: 'info',
      message: `Found ${jobContact.teamLinks.length} embedded team/about link(s). Visiting directly...`,
    });
    for (const link of jobContact.teamLinks) {
      throwIfAborted();
      const key = normalizeUrlForDedupe(link);
      if (visitedUrls.has(key)) continue;
      try {
        await browserPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        const rawHtml = await browserPage.content();
        visitedUrls.add(key);
        if (!discoveredUrlsList.includes(link)) discoveredUrlsList.push(link);

        const cleanResult = cleanHtml(rawHtml, link);
        const people = await extractFromTeamPage(cleanResult.html, job.companyName, link);
        const filtered = filterByArchetype(people, strategy.targetArchetypes);
        
        for (const p of filtered) {
          if (!candidates.some((c) => c.name === p.name && c.evidenceUrl === p.evidenceUrl)) {
            candidates.push({ ...p, source: 'job_description_links' });
          }
        }
        log({
          level: 'info',
          message: `Visited embedded link ${link.slice(0, 50)}... found ${filtered.length} priority candidates`,
        });
      } catch {
        visitedUrls.add(key);
      }
    }
  }

  const startCandidatesCount = candidates.filter(c => c.source !== 'reuse').length;
  if (startCandidatesCount > 0) {
    log({ level: 'info', message: `Found ${startCandidatesCount} targeted contacts directly from job posting & team pages. Skipping fallback DDG/LinkedIn searches.` });
  }

  // 3. LinkedIn discovery: the primary targeted contact discovery engine
  if (browserPage) {
    const decision = await onProgress?.('before_linkedin', memory);
    if (decision !== 'stop') {
      const linkedInQueries = strategy.linkedInQueries?.length > 0 ? strategy.linkedInQueries : [
        `site:linkedin.com/in "${job.companyName}" "${job.title}"`,
      ];
      const archetypes = strategy.targetArchetypes;
      // Each archetype generates 2 queries, plus 1 catch-all at the end
      const queriesPerArchetype = 2;

      log({
        level: 'info',
        message: `Running targeted LinkedIn discovery (${linkedInQueries.length} queries across ${archetypes.length} contact types)...`,
      });

      for (let qi = 0; qi < linkedInQueries.length; qi++) {
        throwIfAborted();
        if (Date.now() >= contactDiscoveryDeadline) break;

        const query = linkedInQueries[qi]!;
        // Map query index to archetype (2 queries per archetype, last query is catch-all)
        const archetypeIndex = Math.floor(qi / queriesPerArchetype);
        const currentArchetype = (archetypeIndex < archetypes.length ? archetypes[archetypeIndex] : 'GENERAL') ?? 'GENERAL';

        // Log when we start searching for a new archetype
        if (qi % queriesPerArchetype === 0 && archetypeIndex < archetypes.length) {
          log({
            level: 'info',
            message: `Searching for ${currentArchetype} contacts...`,
          });
        }

        const results: SearchResult[] = await searchWebViaBrowser(browserPage, query);
        let foundThisQuery = 0;
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

          // Try to extract location from snippet (LinkedIn snippets often start with location: "City, State, Country · ...")
          const snippetParts = r.snippet?.split(' · ');
          const locationFromSnippet = snippetParts && snippetParts.length > 1 ? snippetParts[0] : undefined;

          candidates.push({
            name: nameFromTitle ?? 'LinkedIn profile',
            role: undefined,
            company: job.companyName,
            linkedinUrl: r.url,
            evidenceUrl: r.url,
            evidenceSnippet: r.snippet ?? `Found via: ${query}`,
            confidence: 0.6,
            source: `linkedin_${currentArchetype.toLowerCase()}`,
            location: locationFromSnippet,
          });
          foundThisQuery++;
        }

        if (foundThisQuery > 0) {
          log({
            level: 'info',
            message: `  └ Query ${qi + 1}/${linkedInQueries.length}: found ${foundThisQuery} profile(s) [${currentArchetype}]`,
          });
        }
        await randomDelay();
      }

      const totalLinkedIn = candidates.filter((c) => c.source?.startsWith('linkedin_')).length;
      log({
        level: 'info',
        message: `LinkedIn discovery complete: ${totalLinkedIn} profile(s) found across ${archetypes.length} contact types.`,
      });
      memory.discoveredUrls = [...discoveredUrlsList];
      memory.visitedUrls = Array.from(visitedUrls);
      await writeOutreachMemory(runFolderName, memory);
    }
  }

  // 4. Fallback: if still no candidates and time left, try extra LinkedIn recruiter searches
  if (
    browserPage &&
    candidates.length === 0 &&
    Date.now() < contactDiscoveryDeadline &&
    strategy.linkedInQueries.length > 0
  ) {
    const fallbackQueries = [
      `site:linkedin.com/in "${job.companyName}" recruiter`,
      `site:linkedin.com/in "${job.companyName}" hiring manager`,
      `site:linkedin.com/in "${job.companyName}" talent`,
      `site:linkedin.com/in "${job.companyName}" careers`,
    ];
    log({
      level: 'info',
      message: 'Running extra fallback LinkedIn queries...',
    });
    for (const query of fallbackQueries) {
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
          name: nameFromTitle ?? 'LinkedIn profile (fallback)',
          role: undefined,
          company: job.companyName,
          linkedinUrl: r.url,
          evidenceUrl: r.url,
          evidenceSnippet: r.snippet ?? `Found via fallback: ${query}`,
          confidence: 0.45,
          source: 'linkedin_fallback',
        });
      }
      await randomDelay();
    }
    memory.visitedUrls = Array.from(visitedUrls);
    memory.discoveredUrls = [...discoveredUrlsList];
    await writeOutreachMemory(runFolderName, memory);
  }

  // 4b. Last-resort fallback: add existing contacts from DB only if we found NOBODY
  const freshCandidateCount = candidates.filter(c => c.source !== 'reuse').length;
  const existingFromDb = options.existingContactsFromDb ?? [];
  if (freshCandidateCount === 0 && existingFromDb.length > 0) {
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
      message: `No contacts found via LinkedIn. Adding ${existingFromDb.length} existing company contact(s) from DB as last-resort fallback.`,
    });
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

  // 5. Contact verifier and ranking (best-first + list)
  const verified: Contact[] = [];
  for (const cand of candidates) {
    throwIfAborted();
    // Reconstruct archetype from source tag if possible
    let archetype: ContactArchetype = strategy.targetArchetypes[0] ?? 'HIRING_MANAGER';
    if (cand.source.startsWith('linkedin_')) {
      const archPart = cand.source.replace('linkedin_', '').toUpperCase();
      // Validate this is a known archetype
      if (['HIRING_MANAGER', 'ENG_MANAGER', 'TEAM_LEAD', 'TECH_RECRUITER', 'CAMPUS_RECRUITER', 'FOUNDER'].includes(archPart)) {
        archetype = archPart as ContactArchetype;
      }
    }
    
    const { contact, isVerified } = await verifyContact(cand, normalizedJob, archetype);
    if (isVerified || contact.confidence >= 0.35) {
      verified.push(contact);
    }
  }
  const maxRanked = Math.max(1, Math.min(options.maxRankedContacts ?? 15, verified.length || 15));
  const ranked = selectTopContacts(verified, maxRanked);
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
