/**
 * MiMo Core — Research Agent
 * --------------------------
 * Responsible for gathering information. Uses the web_search tool.
 * Does NOT write the final answer — only collects and summarises sources.
 */

import type { AgentResult, AgentTask, ContextObject } from '../types';
import type { Agent } from '../registry/types';
import { toolRegistry } from '../registry';
import { WEB_SEARCH_TOOL_ID } from '../tools/WebSearchTool';
import { AgentError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';

const log = createLogger('agent:research');

export const RESEARCH_AGENT_ID = 'research';

interface ResearchInput {
  query: string;
  num?: number;
}

export const ResearchAgent: Agent = {
  id: RESEARCH_AGENT_ID,
  name: 'Research Agent',
  description: 'Gathers information from the web and summarises sources.',
  capabilities: ['research', 'summarise'],
  requiredTools: [WEB_SEARCH_TOOL_ID],

  async execute(task: AgentTask, context: ContextObject): Promise<AgentResult> {
    // Resolve the search query in priority order:
    //   1. explicit input.query
    //   2. the original user input from the conversation context
    //   3. the step description (last resort, often generic)
    const input = (task.inputs as Partial<ResearchInput>) ?? {};
    const query =
      input.query ??
      context.task?.current ??
      context.conversation.history.at(-1)?.content ??
      task.description.replace(/^.*?:\s*/, '');
    if (!query) {
      throw new AgentError('research agent requires a query', { taskId: task.id });
    }
    const correlationId = context.conversation.id;
    mimoEvents.emit(
      createEvent(
        EVENT.AGENT_STARTED,
        { agentId: RESEARCH_AGENT_ID, task: task.description },
        'agent:research',
        correlationId,
      ),
    );
    try {
      const results = (await toolRegistry.invoke(
        WEB_SEARCH_TOOL_ID,
        { query, num: input.num ?? 6 },
        context,
      )) as Array<{ title: string; url: string; snippet: string; domain: string }>;

      const summary = results
        .slice(0, 5)
        .map((r, i) => `${i + 1}. ${r.title} (${r.domain})\n   ${r.snippet}`)
        .join('\n\n');

      log.info('research complete', { count: results.length, query });
      mimoEvents.emit(
        createEvent(
          EVENT.AGENT_COMPLETED,
          { agentId: RESEARCH_AGENT_ID, count: results.length },
          'agent:research',
          correlationId,
        ),
      );
      return {
        success: true,
        output: { results, summary },
        reasoning: `Found ${results.length} sources for "${query}".`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      mimoEvents.emit(
        createEvent(
          EVENT.AGENT_FAILED,
          { agentId: RESEARCH_AGENT_ID, error: msg },
          'agent:research',
          correlationId,
        ),
      );
      throw new AgentError(`research failed: ${msg}`, { query }, err);
    }
  },
};
