/**
 * Top-K Curator Agent - Selects top K jobs per source/company
 *
 * Responsibilities:
 * - Sort jobs by score
 * - Group by source or company
 * - Select top K from each group
 * - Maintain diversity (optional)
 *
 * LLM Usage: None (pure sorting/filtering logic)
 */

import type { ScoredJob } from './types.js';
import type { NormalizedJob } from '../normalize/types.js';

export interface CurationConfig {
  topK: number;
  groupBy: 'source' | 'company' | 'none';
  includeFilteredOut: boolean;
  diversityBoost: boolean;
}

export interface CurationResult {
  selected: ScoredJob[];
  overflow: ScoredJob[];
  stats: {
    totalJobs: number;
    selectedJobs: number;
    filteredOutJobs: number;
    groupCount: number;
  };
}

const DEFAULT_CONFIG: CurationConfig = {
  topK: 15,
  groupBy: 'source',
  includeFilteredOut: false,
  diversityBoost: false,
};

/**
 * Select top K jobs from scored jobs
 */
export function selectTopK(
  scoredJobs: ScoredJob[],
  jobs: Map<string, NormalizedJob>,
  config: CurationConfig = DEFAULT_CONFIG,
): CurationResult {
  // Filter out jobs that didn't pass strict filter (unless configured to include)
  const eligibleJobs = config.includeFilteredOut
    ? scoredJobs
    : scoredJobs.filter((sj) => sj.strictFilterPass);

  // Sort by score descending
  const sortedJobs = [...eligibleJobs].sort((a, b) => b.matchScore - a.matchScore);

  // Group jobs if needed
  if (config.groupBy === 'none') {
    const selected = sortedJobs.slice(0, config.topK);
    const overflow = sortedJobs.slice(config.topK);

    // Assign ranks
    selected.forEach((job, idx) => {
      job.rank = idx + 1;
    });

    return {
      selected,
      overflow,
      stats: {
        totalJobs: scoredJobs.length,
        selectedJobs: selected.length,
        filteredOutJobs: scoredJobs.length - eligibleJobs.length,
        groupCount: 1,
      },
    };
  }

  // Group by source or company
  const groups = new Map<string, ScoredJob[]>();

  for (const scoredJob of sortedJobs) {
    const job = jobs.get(scoredJob.jobId);
    if (!job) continue;

    const groupKey = config.groupBy === 'source' ? job.sourceId : job.companyName;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(scoredJob);
  }

  // Select top K from each group
  const selected: ScoredJob[] = [];
  const overflow: ScoredJob[] = [];

  for (const [groupKey, groupJobs] of groups) {
    const topK = groupJobs.slice(0, config.topK);
    const rest = groupJobs.slice(config.topK);

    // Assign ranks within group
    topK.forEach((job, idx) => {
      job.rank = idx + 1;
    });

    selected.push(...topK);
    overflow.push(...rest);
  }

  // Sort final selected by score
  selected.sort((a, b) => b.matchScore - a.matchScore);

  return {
    selected,
    overflow,
    stats: {
      totalJobs: scoredJobs.length,
      selectedJobs: selected.length,
      filteredOutJobs: scoredJobs.length - eligibleJobs.length,
      groupCount: groups.size,
    },
  };
}

/**
 * Get next job to surface when one is processed
 */
export function surfaceNextJob(
  overflow: ScoredJob[],
  groupKey: string,
  jobs: Map<string, NormalizedJob>,
  groupBy: 'source' | 'company',
): ScoredJob | null {
  // Find the highest-scoring overflow job from the same group
  for (const scoredJob of overflow) {
    const job = jobs.get(scoredJob.jobId);
    if (!job) continue;

    const jobGroupKey = groupBy === 'source' ? job.sourceId : job.companyName;
    if (jobGroupKey === groupKey) {
      return scoredJob;
    }
  }

  return null;
}

/**
 * Merge multiple curated results (e.g., from multiple sources)
 */
export function mergeResults(results: CurationResult[]): CurationResult {
  const allSelected: ScoredJob[] = [];
  const allOverflow: ScoredJob[] = [];
  let totalJobs = 0;
  let filteredOutJobs = 0;
  let groupCount = 0;

  for (const result of results) {
    allSelected.push(...result.selected);
    allOverflow.push(...result.overflow);
    totalJobs += result.stats.totalJobs;
    filteredOutJobs += result.stats.filteredOutJobs;
    groupCount += result.stats.groupCount;
  }

  // Sort merged by score
  allSelected.sort((a, b) => b.matchScore - a.matchScore);
  allOverflow.sort((a, b) => b.matchScore - a.matchScore);

  return {
    selected: allSelected,
    overflow: allOverflow,
    stats: {
      totalJobs,
      selectedJobs: allSelected.length,
      filteredOutJobs,
      groupCount,
    },
  };
}
