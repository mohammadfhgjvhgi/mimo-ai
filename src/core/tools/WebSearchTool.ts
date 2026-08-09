/**
 * MiMo Core — WebSearchTool
 * -------------------------
 * Performs a live web search via the registered SearchProvider.
 * The tool itself never imports z-ai-web-dev-sdk — it asks the
 * SearchProvider (registered by the kernel) so the provider can be
 * swapped without touching the tool.
 */

import type { ContextObject, Schema } from '../types';
import type { Tool } from '../registry/types';
import { ToolError } from '../errors';
import { createLogger } from '../logger';
import { getSearchProvider } from '../search';

const log = createLogger('tool:websearch');

export const WEB_SEARCH_TOOL_ID = 'web_search';

interface SearchInput {
  query: string;
  num?: number;
}

export const WebSearchTool: Tool = {
  id: WEB_SEARCH_TOOL_ID,
  name: 'Web Search',
  description: 'Searches the live web for current information and returns ranked results.',
  category: 'research',
  inputSchema: {
    type: 'object',
    description: 'Search query and optional result count',
    properties: {
      query: { type: 'string', description: 'The search query' },
      num: { type: 'number', description: 'Max results (default 6)' },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'array',
    description: 'Ranked search results',
  },
  permissions: ['network:read'],
  async execute(input: unknown, _context: ContextObject): Promise<unknown> {
    const inp = input as SearchInput;
    if (!inp?.query || typeof inp.query !== 'string') {
      throw new ToolError('query is required', { input });
    }
    const num = inp.num ?? 6;
    log.debug('searching', { query: inp.query, num });
    try {
      const provider = getSearchProvider();
      return await provider.search(inp.query, num);
    } catch (err) {
      if (err instanceof ToolError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ToolError(`search error: ${msg}`, { query: inp.query }, err);
    }
  },
};
