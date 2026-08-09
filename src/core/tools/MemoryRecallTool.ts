/**
 * MiMo Core — MemoryRecallTool
 * ----------------------------
 * Lets an agent query the long-term memory without importing the engine
 * directly. This keeps the agent decoupled from the storage backend.
 */

import { memoryEngine } from '../memory/MemoryEngine';
import type { ContextObject, Schema } from '../types';
import type { Tool } from '../registry/types';
import { ToolError } from '../errors';
import { createLogger } from '../logger';

const log = createLogger('tool:memory_recall');

export const MEMORY_RECALL_TOOL_ID = 'memory_recall';

interface RecallInput {
  search?: string;
  type?: import('../types').MemoryType;
  limit?: number;
}

export const MemoryRecallTool: Tool = {
  id: MEMORY_RECALL_TOOL_ID,
  name: 'Memory Recall',
  description: 'Recalls relevant memories from the long-term memory engine.',
  category: 'memory',
  inputSchema: {
    type: 'object',
    description: 'Recall query',
    properties: {
      search: { type: 'string', description: 'Free-text search' },
      type: { type: 'string', description: 'Memory type filter' },
      limit: { type: 'number', description: 'Max results' },
    },
  },
  outputSchema: {
    type: 'array',
    description: 'Matching memory entries',
  },
  permissions: ['memory:read'],
  async execute(input: unknown, _context: ContextObject): Promise<unknown> {
    const inp = (input ?? {}) as RecallInput;
    if (inp.limit !== undefined && (typeof inp.limit !== 'number' || inp.limit < 0)) {
      throw new ToolError('limit must be a non-negative number', { input });
    }
    log.debug('recalling', { search: inp.search, type: inp.type, limit: inp.limit });
    return memoryEngine.recall({
      search: inp.search,
      type: inp.type,
      limit: inp.limit,
    }).then(r => [...r]);
  },
};
