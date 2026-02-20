/**
 * Planner Agent - Central brain that orchestrates scan workflows
 *
 * Responsibilities:
 * - Build workflow plans based on scan configuration
 * - Decide which agents to spawn and in what order
 * - Monitor progress and handle failures
 * - Re-plan when strategies fail
 *
 * LLM Usage: Heavy (strategy decisions, re-planning on failure)
 */

import { complete } from '@careersignal/llm';
import {
  type WorkflowPlan,
  type WorkflowStep,
  type ScanConfig,
  WorkflowPlanSchema,
} from './types.js';

export interface PlannerInput {
  config: ScanConfig;
  availableAgents: string[];
}

export interface PlannerOutput {
  plan: WorkflowPlan;
  reasoning: string;
}

const PLANNING_PROMPT = `You are a workflow planner for a job hunting system. Given a scan configuration, create an optimal execution plan.

Available agents: {agents}

Scan configuration:
- Sources to scan: {sourceCount}
- Include contact hunting: {includeContacts}
- Include outreach drafts: {includeDrafts}
- Include application blueprints: {includeBlueprints}
- Strict filter enabled: {strictFilter}
- Top K results: {topK}

Create a workflow plan with steps in the optimal order. Consider:
1. Profile must be loaded first
2. Sources must be validated before scanning
3. Jobs must be extracted before ranking
4. Ranking must complete before contact hunting
5. Contacts must be found before drafting outreach

Return a JSON workflow plan with steps array.`;

export async function createScanPlan(input: PlannerInput): Promise<PlannerOutput> {
  const { config, availableAgents } = input;

  // For V1, use a deterministic plan rather than LLM
  // LLM planning will be added in V2 for dynamic re-planning
  const plan = createDeterministicPlan(config);

  return {
    plan,
    reasoning: 'V1: Using deterministic workflow plan',
  };
}

function createDeterministicPlan(config: ScanConfig): WorkflowPlan {
  const now = new Date().toISOString();
  const steps: WorkflowStep[] = [];
  let stepId = 1;

  // Step 1: Load profile
  steps.push({
    id: `step-${stepId++}`,
    name: 'Load User Profile',
    agent: 'profile/loader',
    status: 'pending',
    inputs: { userId: config.userId },
  });

  // Step 2: Validate sources
  steps.push({
    id: `step-${stepId++}`,
    name: 'Validate Sources',
    agent: 'browser/source-validator',
    status: 'pending',
    inputs: { sourceIds: config.sourceIds },
  });

  // Step 3: Extract jobs from each source
  steps.push({
    id: `step-${stepId++}`,
    name: 'Extract Jobs',
    agent: 'browser/job-extractor',
    status: 'pending',
    inputs: { sourceIds: config.sourceIds },
  });

  // Step 4: Normalize jobs
  steps.push({
    id: `step-${stepId++}`,
    name: 'Normalize Jobs',
    agent: 'normalize/job-normalizer',
    status: 'pending',
  });

  // Step 5: Deduplicate
  steps.push({
    id: `step-${stepId++}`,
    name: 'Deduplicate Jobs',
    agent: 'normalize/entity-resolver',
    status: 'pending',
  });

  // Step 6: Score jobs (rule-based)
  steps.push({
    id: `step-${stepId++}`,
    name: 'Rule-Based Scoring',
    agent: 'rank/rule-scorer',
    status: 'pending',
  });

  // Step 7: Score jobs (LLM)
  steps.push({
    id: `step-${stepId++}`,
    name: 'LLM Ranking',
    agent: 'rank/llm-ranker',
    status: 'pending',
  });

  // Step 8: Apply strict filter
  if (config.strictFilterEnabled) {
    steps.push({
      id: `step-${stepId++}`,
      name: 'Apply Strict Filter',
      agent: 'rank/strict-filter',
      status: 'pending',
    });
  }

  // Step 9: Select top K
  steps.push({
    id: `step-${stepId++}`,
    name: 'Select Top Jobs',
    agent: 'rank/top-k-curator',
    status: 'pending',
    inputs: { topK: config.topK },
  });

  // Step 10: Contact hunting (optional)
  if (config.includeContactHunt) {
    steps.push({
      id: `step-${stepId++}`,
      name: 'Hunt Contacts',
      agent: 'contacts/people-search',
      status: 'pending',
    });

    steps.push({
      id: `step-${stepId++}`,
      name: 'Verify Contacts',
      agent: 'contacts/verifier',
      status: 'pending',
    });
  }

  // Step 11: Draft outreach (optional)
  if (config.includeDrafts) {
    steps.push({
      id: `step-${stepId++}`,
      name: 'Draft Outreach',
      agent: 'outreach/writer',
      status: 'pending',
    });
  }

  // Step 12: Application blueprints (optional)
  if (config.includeBlueprints) {
    steps.push({
      id: `step-${stepId++}`,
      name: 'Create Application Blueprints',
      agent: 'apply/blueprint',
      status: 'pending',
    });
  }

  return {
    id: `plan-${Date.now()}`,
    name: 'Scan & Rank Workflow',
    description: `Scan ${config.sourceIds?.length ?? 'all'} sources and find top ${config.topK} jobs`,
    steps,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

export async function replanOnFailure(
  currentPlan: WorkflowPlan,
  failedStep: WorkflowStep,
  error: string,
): Promise<WorkflowPlan> {
  // V2: Use LLM to analyze failure and suggest alternative strategies
  // For now, just mark as failed
  console.error(`[Planner] Step "${failedStep.name}" failed: ${error}`);

  return {
    ...currentPlan,
    status: 'failed',
    updatedAt: new Date().toISOString(),
  };
}
