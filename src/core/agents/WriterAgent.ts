/**
 * MiMo Core — Writer Agent
 * ------------------------
 * The agent that produces the final text answer. It is the only agent
 * that talks to the Model (via the Model registry). It receives a task
 * description + collected context, builds the prompt through the Prompt
 * Engine, and returns the model's response.
 *
 * In v1.0 the Writer also handles "answer directly" cases.
 */

import type { AgentResult, AgentTask, ContextObject } from '../types';
import type { Agent } from '../registry/types';
import { modelRegistry } from '../registry';
import { executeWithFallback, type RoutingInput } from '../models/ModelRouter';
import { ModelError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import { buildPrompt } from '../prompts/PromptEngine';

const log = createLogger('agent:writer');

export const WRITER_AGENT_ID = 'writer';

interface WriterInput {
  /** The original user request. */
  userInput: string;
  /** Free-form gathered context from other agents (research, memory). */
  gatheredContext?: string;
  /** Instruction mode: 'answer' | 'summarise' | 'plan'. */
  instruction?: 'answer' | 'summarise' | 'plan';
}

export const WriterAgent: Agent = {
  id: WRITER_AGENT_ID,
  name: 'Writer Agent',
  description: 'Produces the final text answer using the Model. The only agent that calls the model.',
  capabilities: ['write', 'summarise', 'plan'],
  requiredTools: [],

  async execute(task: AgentTask, context: ContextObject): Promise<AgentResult> {
    const input = (task.inputs as Partial<WriterInput>) ?? {};
    // The Writer may receive dependency step outputs under keys like "s1",
    // "s2" (deposited by the Orchestrator as the .output of each finished
    // step). The shape depends on the producing agent:
    //   - Memory agent   → readonly MemoryEntry[]
    //   - Research agent → { results: SearchResult[], summary: string }
    //   - Writer agent   → string (final text)
    const gatheredParts: string[] = [];
    for (const [key, value] of Object.entries(task.inputs ?? {})) {
      if (!key.startsWith('s')) continue;
      if (typeof value === 'string' && value.length > 0) {
        gatheredParts.push(value);
        continue;
      }
      if (!value || typeof value !== 'object') continue;
      const obj = value as {
        summary?: string;
        results?: unknown[];
        content?: string;
      };
      if (obj.summary) {
        gatheredParts.push(obj.summary);
      } else if (Array.isArray(obj.results) && obj.results.length > 0) {
        gatheredParts.push(
          'نتائج البحث:\n' +
            obj.results
              .slice(0, 5)
              .map((r, i) => {
                const x = r as { title?: string; snippet?: string; url?: string };
                return `${i + 1}. ${x.title ?? ''}${x.snippet ? ' — ' + x.snippet : ''}${x.url ? ' (' + x.url + ')' : ''}`;
              })
              .join('\n'),
        );
      } else if (Array.isArray(value) && value.length > 0) {
        // memory entries array
        gatheredParts.push(
          'ذكريات ذات صلة:\n' +
            value
              .slice(0, 5)
              .map((m, i) => {
                const x = m as { type?: string; content?: string };
                return `${i + 1}. [${x.type ?? '?'}] ${x.content ?? ''}`;
              })
              .join('\n'),
        );
      }
    }
    const userInput =
      input.userInput ??
      context.task?.current ??
      context.conversation.history.at(-1)?.content ??
      task.description;
    if (!userInput) {
      throw new ModelError('writer requires userInput', { taskId: task.id });
    }
    const correlationId = context.conversation.id;
    mimoEvents.emit(
      createEvent(
        EVENT.AGENT_STARTED,
        { agentId: WRITER_AGENT_ID, instruction: input.instruction ?? 'answer' },
        'agent:writer',
        correlationId,
      ),
    );

    const gatheredContext =
      input.gatheredContext ??
      (gatheredParts.length > 0 ? gatheredParts.join('\n\n') : undefined);

    // Resolve the prompt mode: explicit instruction > context.task.mode > 'answer'.
    // This lets the UI-selected mode flow through without bypassing the pipeline.
    const instruction = input.instruction ?? context.task?.mode ?? 'answer';

    // Phase 116: Route through ModelRouter instead of bypassing it.
    // The router selects the best model for the task type + provides fallback.
    const routingInput: RoutingInput = {
      taskType: instruction === 'plan' ? 'analysis'
        : instruction === 'research' ? 'research'
        : instruction === 'code' ? 'code'
        : 'chat',
      requiresReasoning: instruction === 'plan',
      latencySensitive: instruction === 'answer',
    };

    const { messages } = buildPrompt(context, {
      user: userInput,
      mode: instruction,
      extraContext: gatheredContext,
    });

    try {
      // executeWithFallback handles primary failure → fallback model.
      const { result: content, decision, usedFallback } = await executeWithFallback(
        routingInput,
        (model) => model.chat({ messages, thinking: instruction === 'plan' }).then((r) => r.content),
      );
      log.info('answer produced', {
        length: content.length,
        model: decision.selectedModel,
        profile: decision.profile,
        usedFallback,
      });
      mimoEvents.emit(
        createEvent(
          EVENT.AGENT_COMPLETED,
          {
            agentId: WRITER_AGENT_ID,
            length: content.length,
            model: decision.selectedModel,
            profile: decision.profile,
            usedFallback,
            fallbackModel: usedFallback ? decision.fallback : null,
          },
          'agent:writer',
          correlationId,
        ),
      );
      return {
        success: true,
        output: content,
        reasoning: `Generated via ${decision.selectedModel} (${decision.profile}).${usedFallback ? ' Used fallback.' : ''}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      mimoEvents.emit(
        createEvent(
          EVENT.AGENT_FAILED,
          { agentId: WRITER_AGENT_ID, error: msg },
          'agent:writer',
          correlationId,
        ),
      );
      throw new ModelError(`writer failed: ${msg}`, { taskId: task.id }, err);
    }
  },
};
