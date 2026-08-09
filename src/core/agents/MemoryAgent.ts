/**
 * MiMo Core — Memory Agent
 * ------------------------
 * Responsible for recalling and storing long-term memories. Uses the
 * memory_recall + memory_store tools. Other agents may ask it to
 * "remember this" or "what do we know about X".
 */

import type { AgentResult, AgentTask, ContextObject, MemoryType } from '../types';
import type { Agent } from '../registry/types';
import { toolRegistry } from '../registry';
import { MEMORY_RECALL_TOOL_ID } from '../tools/MemoryRecallTool';
import { MEMORY_STORE_TOOL_ID } from '../tools/MemoryStoreTool';
import { AgentError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';

const log = createLogger('agent:memory');

export const MEMORY_AGENT_ID = 'memory';

type MemoryAgentAction =
  | { action: 'recall'; search?: string; type?: MemoryType; limit?: number }
  | {
      action: 'store';
      type: MemoryType;
      content: string;
      metadata?: Record<string, unknown>;
    };

export const MemoryAgent: Agent = {
  id: MEMORY_AGENT_ID,
  name: 'Memory Agent',
  description: 'Recalls and stores long-term memories about the user.',
  capabilities: ['recall', 'store', 'relate'],
  requiredTools: [MEMORY_RECALL_TOOL_ID, MEMORY_STORE_TOOL_ID],

  async execute(task: AgentTask, context: ContextObject): Promise<AgentResult> {
    // Tolerate being called with just a description (from the orchestrator
    // when no structured inputs were provided). Default to recall using
    // the task description as the search query.
    let input = task.inputs as MemoryAgentAction | Partial<MemoryAgentAction>;
    if (!input?.action) {
      // Default to recall using the original user input from the context.
      input = {
        action: 'recall',
        search: context.task?.current ?? task.description,
        limit: 5,
      };
    }
    const correlationId = context.conversation.id;
    mimoEvents.emit(
      createEvent(
        EVENT.AGENT_STARTED,
        { agentId: MEMORY_AGENT_ID, action: input.action },
        'agent:memory',
        correlationId,
      ),
    );
    try {
      if (input.action === 'recall') {
        const results = await toolRegistry.invoke(
          MEMORY_RECALL_TOOL_ID,
          {
            search: (input as Extract<MemoryAgentAction, { action: 'recall' }>).search,
            type: (input as Extract<MemoryAgentAction, { action: 'recall' }>).type,
            limit: (input as Extract<MemoryAgentAction, { action: 'recall' }>).limit ?? 5,
          },
          context,
        );
        log.info('recall complete', { count: Array.isArray(results) ? results.length : 0 });
        mimoEvents.emit(
          createEvent(
            EVENT.AGENT_COMPLETED,
            { agentId: MEMORY_AGENT_ID, action: 'recall' },
            'agent:memory',
            correlationId,
          ),
        );
        return {
          success: true,
          output: results,
          reasoning: 'Recalled matching memories.',
        };
      }
      // store — narrow to the 'store' variant
      const storeInput = input as { type: MemoryType; content: string; metadata?: Record<string, unknown> };
      const stored = await toolRegistry.invoke(
        MEMORY_STORE_TOOL_ID,
        { type: storeInput.type, content: storeInput.content, metadata: storeInput.metadata },
        context,
      );
      log.info('store complete', { type: storeInput.type });
      mimoEvents.emit(
        createEvent(
          EVENT.AGENT_COMPLETED,
          { agentId: MEMORY_AGENT_ID, action: 'store' },
          'agent:memory',
          correlationId,
        ),
      );
      return {
        success: true,
        output: stored,
        reasoning: `Stored a ${storeInput.type} memory.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      mimoEvents.emit(
        createEvent(
          EVENT.AGENT_FAILED,
          { agentId: MEMORY_AGENT_ID, error: msg },
          'agent:memory',
          correlationId,
        ),
      );
      throw new AgentError(`memory agent failed: ${msg}`, { action: input.action }, err);
    }
  },
};
