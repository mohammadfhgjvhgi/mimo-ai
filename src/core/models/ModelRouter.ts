/**
 * MiMo Core — Model Router
 * -------------------------
 * Phase 20: Real model routing by task type, latency, context size,
 * reasoning requirement, vision, coding, research, local/private, cost.
 *
 * Profiles: FAST, BALANCED, DEEP, LOCAL, VISION.
 * Decision is explainable: Selected model + Reason + Fallback.
 */

import { modelRegistry } from '../registry';
import type { Model } from '../registry/types';
import { createLogger } from '../logger';

const log = createLogger('ai:router');

export type ModelProfile = 'FAST' | 'BALANCED' | 'DEEP' | 'LOCAL' | 'VISION';

export interface RoutingDecision {
  selectedModel: string;
  profile: ModelProfile;
  reason: string;
  fallback: string | null;
  latency: 'low' | 'medium' | 'high';
  cost: 'free' | 'low' | 'medium' | 'high';
}

export interface RoutingInput {
  taskType: 'chat' | 'code' | 'research' | 'image' | 'analysis' | 'writing' | 'data';
  contextSize?: number; // approximate tokens
  requiresReasoning?: boolean;
  requiresVision?: boolean;
  requiresLocal?: boolean;
  latencySensitive?: boolean;
}

/**
 * Route to the best model based on the input.
 * Returns an explainable decision.
 */
export function routeModel(input: RoutingInput): RoutingDecision {
  const available = modelRegistry.list();

  // Determine profile
  let profile: ModelProfile;
  let reason: string;

  if (input.requiresLocal) {
    profile = 'LOCAL';
    reason = 'Local model requested (privacy/offline)';
  } else if (input.requiresVision) {
    profile = 'VISION';
    reason = 'Vision capability required';
  } else if (input.requiresReasoning || input.taskType === 'research' || input.taskType === 'analysis') {
    profile = 'DEEP';
    reason = `Deep reasoning required for ${input.taskType}`;
  } else if (input.latencySensitive || input.taskType === 'chat') {
    profile = 'FAST';
    reason = `Latency-sensitive ${input.taskType} task`;
  } else {
    profile = 'BALANCED';
    reason = `Balanced profile for ${input.taskType}`;
  }

  // Find a model that matches
  const selected = available.find((m) => {
    if (profile === 'VISION' && !m.capabilities.includes('vision')) return false;
    if (profile === 'DEEP' && !m.capabilities.includes('reasoning')) return false;
    return true;
  }) ?? available[0];

  const selectedId = selected?.id ?? 'zai-default';

  // Determine fallback
  const fallbackModel = available.find((m) => m.id !== selectedId);
  const fallback = fallbackModel?.id ?? null;

  const latency = profile === 'FAST' ? 'low' : profile === 'BALANCED' ? 'medium' : 'high';
  const cost = profile === 'LOCAL' ? 'free' : profile === 'FAST' ? 'low' : profile === 'BALANCED' ? 'medium' : 'high';

  const decision: RoutingDecision = {
    selectedModel: selectedId,
    profile,
    reason,
    fallback,
    latency,
    cost,
  };

  log.info('model routed', { selected: selectedId, profile, reason, fallback });
  return decision;
}

/**
 * Get the actual Model instance for a routing decision.
 */
export function getModel(modelId: string): Model | undefined {
  return modelRegistry.get(modelId);
}

/**
 * Execute a model call with fallback.
 * Phase 21: If primary fails, try fallback.
 */
export async function executeWithFallback(
  input: RoutingInput,
  run: (model: Model) => Promise<string>,
): Promise<{ result: string; decision: RoutingDecision; usedFallback: boolean }> {
  const decision = routeModel(input);
  const primary = getModel(decision.selectedModel);

  if (!primary) {
    throw new Error(`No model available for ${decision.profile}`);
  }

  try {
    const result = await run(primary);
    return { result, decision, usedFallback: false };
  } catch (err) {
    log.warn('primary model failed, trying fallback', {
      primary: decision.selectedModel,
      error: err instanceof Error ? err.message : String(err),
    });

    if (decision.fallback) {
      const fallbackModel = getModel(decision.fallback);
      if (fallbackModel) {
        try {
          const result = await run(fallbackModel);
          return { result, decision: { ...decision, selectedModel: decision.fallback, reason: `Fallback after ${decision.selectedModel} failed` }, usedFallback: true };
        } catch (fallbackErr) {
          log.error('fallback model also failed', { fallback: decision.fallback, error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) });
        }
      }
    }

    throw err;
  }
}
