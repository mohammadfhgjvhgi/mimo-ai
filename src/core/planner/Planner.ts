/**
 * MiMo Core — Planner (module)
 * ----------------------------
 * The Planner module is a thin façade over the PlannerAgent. It exposes
 * a `plan()` function that the Reasoner / Orchestrator use.
 *
 * The Planner UNDERSTANDS the task. It does NOT execute it.
 */

import type { ContextObject, Plan } from '../types';
import { agentRegistry } from '../registry';
import { PLANNER_AGENT_ID } from '../agents/PlannerAgent';
import { OrchestrationError } from '../errors';
import { createLogger } from '../logger';

const log = createLogger('planner');

export interface PlanInput {
  userInput: string;
}

/**
 * Ask the Planner agent to produce a Plan for the given user input.
 * Returns the Plan object (not executed).
 */
export async function plan(
  input: PlanInput,
  context: ContextObject,
): Promise<Plan> {
  const planner = agentRegistry.get(PLANNER_AGENT_ID);
  if (!planner) {
    throw new OrchestrationError('planner agent not registered', { id: PLANNER_AGENT_ID });
  }
  log.debug('planning', { input: input.userInput.slice(0, 50) });
  const result = await planner.execute(
    {
      id: 'task_plan_' + Date.now(),
      description: 'Plan the user request',
      inputs: { userInput: input.userInput },
    },
    context,
  );
  if (!result.success) {
    throw new OrchestrationError('planner returned failure', { input: input.userInput });
  }
  return result.output as Plan;
}
