import type { Db } from '@careersignal/db';
import { updateAnalysisRunState, type RunStatus } from '@careersignal/db';

/**
 * Canonical step identifiers for the single-URL Application Assistant pipeline.
 *
 * NOTE: This is intentionally small for V1. Future phases (company confirmation,
 * contacts, etc.) should extend this union in a controlled way.
 */
export type AssistantPipelineStep =
  | 'scraping'
  | 'extracting'
  | 'matching'
  | 'writing'
  | 'done'
  | 'error';

export interface AssistantPlan {
  id: string;
  steps: AssistantPipelineStep[];
}

/**
 * Deterministic plan for the Application Assistant run.
 *
 * For V1 this is a simple linear sequence. Later phases can branch based on
 * profile presence, company confirmation, or user settings.
 */
export function createAssistantPlan(options: { hasProfile: boolean }): AssistantPlan {
  const steps: AssistantPipelineStep[] = ['scraping', 'extracting'];

  if (options.hasProfile) {
    steps.push('matching', 'writing');
  }

  // Always end in a terminal "done" step when successful.
  steps.push('done');

  return {
    id: `aa-plan-${Date.now()}`,
    steps,
  };
}

/**
 * Helper to update the analysis run state for a given step.
 *
 * - Sets currentStep
 * - Ensures runStatus is consistent for terminal vs non-terminal steps
 * - Centralizes the DB update logic for step transitions
 */
export async function transitionAssistantStep(
  db: Db,
  analysisId: string,
  step: AssistantPipelineStep,
  opts: { runStatusOverride?: RunStatus } = {},
): Promise<void> {
  let runStatus: RunStatus | undefined = opts.runStatusOverride;

  if (!runStatus) {
    if (step === 'done') {
      runStatus = 'done';
    } else if (step === 'error') {
      runStatus = 'error';
    } else {
      runStatus = 'running';
    }
  }

  await updateAnalysisRunState(db, analysisId, {
    currentStep: step,
    runStatus,
  });
}
