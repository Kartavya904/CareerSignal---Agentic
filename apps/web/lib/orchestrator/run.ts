/**
 * Orchestrator: executes a workflow plan for a run.
 * Loads run, creates plan, runs each step via registry, updates run/step status.
 */
import { getDb, getRunById, updateRunStatus, updateRunPlanSnapshot } from '@careersignal/db';
import { createScanPlan, replanOnFailure } from '@careersignal/agents';
import type { WorkflowPlan, WorkflowStep } from '@careersignal/agents';
import { getExecutor } from './registry';
import type { RunContext } from './types';
import { isPauseRequested } from '@/lib/session-activity';

export async function runOrchestrator(runId: string, userId: string): Promise<void> {
  const db = getDb();
  const run = await getRunById(db, runId, userId);
  if (!run) return;

  const sourceIds = (run.sourceIds as string[]) ?? [];
  const config = {
    userId,
    sourceIds: sourceIds.length > 0 ? sourceIds : undefined,
    includeContactHunt: true,
    includeDrafts: true,
    includeBlueprints: false,
    strictFilterEnabled: true,
    topK: 15,
  };

  const { plan: initialPlan } = await createScanPlan({
    config,
    availableAgents: [
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
    ],
  });

  await updateRunStatus(db, runId, userId, 'RUNNING');
  await updateRunPlanSnapshot(db, runId, userId, serializePlan(initialPlan));

  const context: RunContext = {
    userId,
    runId,
    db,
    sourceIds,
  };

  let plan: WorkflowPlan = {
    ...initialPlan,
    status: 'running',
    updatedAt: new Date().toISOString(),
  };

  for (let i = 0; i < plan.steps.length; i++) {
    if (isPauseRequested(userId, runId)) {
      await updateRunStatus(db, runId, userId, 'PAUSED');
      await updateRunPlanSnapshot(db, runId, userId, serializePlan(plan));
      return;
    }

    const step = plan.steps[i];
    if (!step) continue;
    const executor = getExecutor(step.agent);

    const stepRunning: WorkflowStep = {
      ...step,
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    plan = patchStepInPlan(plan, i, stepRunning);
    await updateRunPlanSnapshot(db, runId, userId, serializePlan(plan));

    if (!executor) {
      const failed = {
        ...stepRunning,
        status: 'failed' as const,
        error: `Unknown agent: ${step.agent}`,
      };
      plan = patchStepInPlan(plan, i, failed);
      const replanned = await replanOnFailure(plan, failed, failed.error ?? '');
      plan = replanned;
      await updateRunPlanSnapshot(db, runId, userId, serializePlan(plan));
      await updateRunStatus(db, runId, userId, 'FAILED', failed.error);
      return;
    }

    try {
      const inputs = (step.inputs ?? {}) as Record<string, unknown>;
      const out = await executor(inputs, context);
      Object.assign(context, out);
      const completed: WorkflowStep = {
        ...stepRunning,
        status: 'completed',
        completedAt: new Date().toISOString(),
        outputs: out as Record<string, unknown>,
      };
      plan = patchStepInPlan(plan, i, completed);
      plan = {
        ...plan,
        updatedAt: new Date().toISOString(),
      };
      await updateRunPlanSnapshot(db, runId, userId, serializePlan(plan));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const failed: WorkflowStep = {
        ...stepRunning,
        status: 'failed',
        error: errorMessage,
        completedAt: new Date().toISOString(),
      };
      plan = patchStepInPlan(plan, i, failed);
      const replanned = await replanOnFailure(plan, failed, errorMessage);
      plan = replanned;
      await updateRunPlanSnapshot(db, runId, userId, serializePlan(plan));
      await updateRunStatus(db, runId, userId, 'FAILED', errorMessage);
      return;
    }
  }

  plan = {
    ...plan,
    status: 'completed',
    updatedAt: new Date().toISOString(),
  };
  await updateRunPlanSnapshot(db, runId, userId, serializePlan(plan));
  await updateRunStatus(db, runId, userId, 'COMPLETED');
}

function patchStepInPlan(plan: WorkflowPlan, index: number, step: WorkflowStep): WorkflowPlan {
  const steps = [...plan.steps];
  steps[index] = step;
  return { ...plan, steps };
}

function serializePlan(plan: WorkflowPlan): unknown {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    steps: plan.steps.map((s) => ({
      id: s.id,
      name: s.name,
      agent: s.agent,
      status: s.status,
      error: s.error,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    })),
    status: plan.status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}
