/**
 * MiMo Core — MemoryStoreTool
 * ---------------------------
 * Stores a new memory entry. Used by agents that discover facts worth
 * remembering (e.g. the Memory Agent extracting preferences).
 */

import { memoryEngine } from '../memory/MemoryEngine';
import type { ContextObject, MemoryType, Schema } from '../types';
import type { Tool } from '../registry/types';
import { ToolError } from '../errors';
import { createLogger } from '../logger';

const log = createLogger('tool:memory_store');

export const MEMORY_STORE_TOOL_ID = 'memory_store';

interface StoreInput {
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
}

const VALID_TYPES: readonly MemoryType[] = [
  'fact',
  'preference',
  'event',
  'relation',
  'skill',
  'goal',
];

export const MemoryStoreTool: Tool = {
  id: MEMORY_STORE_TOOL_ID,
  name: 'Memory Store',
  description: 'Stores a new memory entry in the long-term memory engine.',
  category: 'memory',
  inputSchema: {
    type: 'object',
    description: 'Memory to store',
    properties: {
      type: { type: 'string', description: 'One of: fact, preference, event, relation, skill, goal' },
      content: { type: 'string', description: 'The memory content' },
      metadata: { type: 'object', description: 'Optional metadata' },
    },
    required: ['type', 'content'],
  },
  outputSchema: {
    type: 'object',
    description: 'The stored memory entry with id and timestamp',
  },
  permissions: ['memory:write'],
  async execute(input: unknown, _context: ContextObject): Promise<unknown> {
    const inp = input as StoreInput;
    if (!inp?.content || typeof inp.content !== 'string') {
      throw new ToolError('content is required', { input });
    }
    if (!inp.type || !VALID_TYPES.includes(inp.type)) {
      throw new ToolError(`type must be one of: ${VALID_TYPES.join(', ')}`, { input });
    }
    log.debug('storing', { type: inp.type, contentLen: inp.content.length });
    return memoryEngine.store({
      type: inp.type,
      content: inp.content,
      metadata: inp.metadata,
    });
  },
};
