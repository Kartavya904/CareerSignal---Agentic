/**
 * Agent registry: maps workflow step agent names to executors.
 * Each executor receives step inputs and run context, returns updates to merge into context.
 */
import {
  getProfileByUserId,
  getPreferencesByUserId,
  getSourceById,
  getEnabledSourceIds,
} from '@careersignal/db';
import {
  validateSource,
  extractJobsFromHtml,
  normalizeJob,
  deduplicateJobs,
  scoreJobWithRules,
  batchScoreJobs,
  combineScores,
  selectTopK,
  buildPreferencesFromProfile,
} from '@careersignal/agents';
import type { RunContext, StepExecutor } from './types';
import type { NormalizedJob } from '@careersignal/agents';
import type { UserPreferences, ScoredJob } from '@careersignal/agents';

const AGENTS = [
  'profile/loader',
  'browser/source-validator',
  'browser/job-extractor',
  'normalize/job-normalizer',
  'normalize/entity-resolver',
  'rank/rule-scorer',
  'rank/llm-ranker',
  'rank/strict-filter',
  'rank/top-k-curator',
  'contacts/people-search',
  'contacts/verifier',
  'outreach/writer',
  'apply/blueprint',
] as const;

const registry = new Map<string, StepExecutor>();

async function profileLoader(
  _inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const db = ctx.db;
  const userId = ctx.userId;
  const profile = await getProfileByUserId(db, userId);
  if (!profile) {
    return { profile: null, preferences: {} };
  }

  const prefsRow = await getPreferencesByUserId(db, userId);
  let preferences: UserPreferences;

  if (prefsRow) {
    preferences = {
      workAuthorization: prefsRow.workAuthorization as UserPreferences['workAuthorization'],
      targetLocations: prefsRow.targetLocations ?? [],
      remotePreference: (prefsRow.remotePreference as UserPreferences['remotePreference']) ?? 'ANY',
      targetSeniority: prefsRow.targetSeniority ?? [],
      targetRoles: prefsRow.targetRoles ?? [],
      skills: prefsRow.skills ?? [],
      industries: prefsRow.industries ?? [],
      employmentTypes: prefsRow.employmentTypes ?? [],
      salaryMin: prefsRow.salaryMin != null ? Number(prefsRow.salaryMin) : undefined,
      salaryMax: prefsRow.salaryMax != null ? Number(prefsRow.salaryMax) : undefined,
      salaryCurrency: prefsRow.salaryCurrency ?? undefined,
      strictFilterLevel:
        (prefsRow.strictFilterLevel as UserPreferences['strictFilterLevel']) ?? 'STRICT',
      maxContactsPerJob: prefsRow.maxContactsPerJob as UserPreferences['maxContactsPerJob'],
      outreachTone: prefsRow.outreachTone ?? undefined,
    };
  } else {
    const prefsResult = await buildPreferencesFromProfile({
      name: profile.name,
      location: profile.location ?? undefined,
      workAuthorization: profile.workAuthorization ?? undefined,
      skills: (profile.skills as string[]) ?? [],
      experience: (profile.experience as { title: string; company: string }[]) ?? [],
      education: (profile.education as { institution: string; degree?: string }[]) ?? [],
      targetRoles: (profile.targetRoles as string[]) ?? [],
    });
    const rawLocs = prefsResult.preferences.targetLocations ?? [];
    const targetLocations = rawLocs.map((loc) =>
      typeof loc === 'string' ? { country: loc } : loc,
    ) as UserPreferences['targetLocations'];
    preferences = {
      workAuthorization:
        (profile.workAuthorization as UserPreferences['workAuthorization']) ?? 'OTHER',
      targetLocations,
      remotePreference: (profile.remotePreference as UserPreferences['remotePreference']) ?? 'ANY',
      targetSeniority: prefsResult.preferences.targetSeniority ?? [],
      targetRoles: (profile.targetRoles as string[]) ?? [],
      skills: (profile.skills as string[]) ?? [],
      industries: (profile.industries as string[]) ?? [],
      employmentTypes: (profile.employmentType as string[]) ?? [],
      strictFilterLevel: 'STRICT',
      maxContactsPerJob: 2,
    };
  }

  return {
    profile: profile as unknown,
    preferences: preferences as unknown,
  };
}

async function browserSourceValidator(
  inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const sourceIds = (inputs.sourceIds as string[]) ?? ctx.sourceIds ?? [];
  if (sourceIds.length === 0) {
    const db = ctx.db;
    const ids = await getEnabledSourceIds(db, ctx.userId);
    sourceIds.push(...ids);
  }
  const db = ctx.db;
  const results: { sourceId: string; url: string; isValid: boolean }[] = [];
  for (const id of sourceIds) {
    const source = await getSourceById(db, id, ctx.userId);
    if (!source) continue;
    const result = await validateSource(id, source.url);
    results.push({
      sourceId: result.sourceId,
      url: result.url,
      isValid: result.isValid,
    });
  }
  return { validatedSources: results };
}

async function browserJobExtractor(
  _inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const validated = ctx.validatedSources ?? [];
  const db = ctx.db;
  const allListings: unknown[] = [];
  for (const v of validated) {
    if (!v.isValid) continue;
    try {
      const res = await fetch(v.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CareerSignal/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      const html = await res.text();
      const out = await extractJobsFromHtml(html, v.url);
      for (const listing of out.listings) {
        allListings.push({
          ...listing,
          extractedFrom: v.url,
          sourceId: v.sourceId,
        });
      }
    } catch {
      // skip source on fetch error
    }
  }
  return { rawListings: allListings };
}

async function normalizeJobNormalizer(
  _inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const rawListings = (ctx.rawListings ?? []) as {
    title: string;
    company?: string;
    location?: string;
    url?: string;
    description?: string;
    extractedFrom: string;
    sourceId?: string;
  }[];
  const normalized: NormalizedJob[] = [];
  for (const raw of rawListings) {
    const r = raw as Record<string, unknown>;
    const sourceId = (r.sourceId as string) ?? 'unknown';
    const rawListing = {
      title: (r.title as string) ?? '',
      company: r.company as string | undefined,
      location: r.location as string | undefined,
      url: r.url as string | undefined,
      description: r.description as string | undefined,
      extractedFrom: (r.extractedFrom as string) ?? (r.url as string) ?? '',
      confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
    };
    const result = await normalizeJob(rawListing, ctx.runId, sourceId);
    normalized.push(result.job as NormalizedJob);
  }
  return { normalizedJobs: normalized };
}

function normalizeEntityResolver(
  _inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const jobs = (ctx.normalizedJobs ?? []) as NormalizedJob[];
  const { jobs: deduped } = deduplicateJobs(jobs);
  return Promise.resolve({ dedupedJobs: deduped });
}

async function rankRuleScorer(
  _inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const jobs = (ctx.dedupedJobs ?? []) as NormalizedJob[];
  const preferences = ctx.preferences as UserPreferences | undefined;
  if (!preferences) {
    return { scoredJobs: [] };
  }
  const scored: ScoredJob[] = [];
  for (const job of jobs) {
    const result = scoreJobWithRules(job, preferences);
    scored.push({
      jobId: job.id,
      matchScore: result.score,
      scoreBreakdown: result.breakdown as ScoredJob['scoreBreakdown'],
      strictFilterPass: result.passesStrictFilter,
    });
  }
  return { scoredJobs: scored };
}

async function rankLlmRanker(
  _inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const jobs = (ctx.dedupedJobs ?? []) as NormalizedJob[];
  const scored = (ctx.scoredJobs ?? []) as ScoredJob[];
  const preferences = ctx.preferences as UserPreferences | undefined;
  if (!preferences || jobs.length === 0) return {};
  const llmResults = await batchScoreJobs(jobs, preferences);
  const combined: ScoredJob[] = scored.map((s) => {
    const llm = llmResults.get(s.jobId);
    const finalScore = llm ? combineScores(s.matchScore, llm.score, 0.4, 0.6) : s.matchScore;
    return {
      ...s,
      matchScore: finalScore,
      scoreBreakdown: {
        ...s.scoreBreakdown,
        llmScore: llm?.score,
        finalScore,
      },
    };
  });
  return { scoredJobs: combined };
}

function rankStrictFilter(
  _inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const scored = (ctx.scoredJobs ?? []) as ScoredJob[];
  const filtered = scored.filter((s) => s.strictFilterPass);
  return Promise.resolve({ scoredJobs: filtered });
}

function rankTopKCurator(
  inputs: Record<string, unknown>,
  ctx: RunContext,
): Promise<Record<string, unknown>> {
  const scored = (ctx.scoredJobs ?? []) as ScoredJob[];
  const jobs = (ctx.dedupedJobs ?? []) as NormalizedJob[];
  const jobMap = new Map<string, NormalizedJob>();
  for (const j of jobs) jobMap.set(j.id, j);
  const topK = (inputs.topK as number) ?? 15;
  const result = selectTopK(scored, jobMap, {
    topK,
    groupBy: 'source',
    includeFilteredOut: false,
    diversityBoost: false,
  });
  return Promise.resolve({
    topJobs: result.selected.map((s) => ({
      ...s,
      job: jobMap.get(s.jobId),
    })),
  });
}

function contactsPeopleSearch(
  _inputs: Record<string, unknown>,
  _ctx: RunContext,
): Promise<Record<string, unknown>> {
  return Promise.resolve({});
}

function contactsVerifier(
  _inputs: Record<string, unknown>,
  _ctx: RunContext,
): Promise<Record<string, unknown>> {
  return Promise.resolve({});
}

function outreachWriter(
  _inputs: Record<string, unknown>,
  _ctx: RunContext,
): Promise<Record<string, unknown>> {
  return Promise.resolve({});
}

function applyBlueprint(
  _inputs: Record<string, unknown>,
  _ctx: RunContext,
): Promise<Record<string, unknown>> {
  return Promise.resolve({});
}

registry.set('profile/loader', profileLoader);
registry.set('browser/source-validator', browserSourceValidator);
registry.set('browser/job-extractor', browserJobExtractor);
registry.set('normalize/job-normalizer', normalizeJobNormalizer);
registry.set('normalize/entity-resolver', normalizeEntityResolver);
registry.set('rank/rule-scorer', rankRuleScorer);
registry.set('rank/llm-ranker', rankLlmRanker);
registry.set('rank/strict-filter', rankStrictFilter);
registry.set('rank/top-k-curator', rankTopKCurator);
registry.set('contacts/people-search', contactsPeopleSearch);
registry.set('contacts/verifier', contactsVerifier);
registry.set('outreach/writer', outreachWriter);
registry.set('apply/blueprint', applyBlueprint);

export function getExecutor(agentName: string): StepExecutor | undefined {
  return registry.get(agentName);
}

export function getAvailableAgents(): string[] {
  return [...AGENTS];
}
