/**
 * MiMo Core — Memory Repository
 * ------------------------------
 * The persistence layer for Memory. Uses Prisma (SQLite).
 * This is the ONLY module that writes to the Memory table directly.
 * Other modules use MemoryService (which uses this repository).
 *
 * Phase 116 fix: metadata is now persisted as a JSON-encoded string column
 * (previously silently dropped). Round-trips through JSON.parse/stringify.
 */

import { db } from '@/lib/db';
import type { MemoryEntry, MemoryType, MemoryQuery } from '../types';
import { createLogger } from '../logger';

const log = createLogger('memory:repository');

export interface CreateMemoryInput {
  type: MemoryType;
  content: string;
  scope?: string; // 'global' | 'project' | 'conversation' | 'temporary'
  projectId?: string | null;
  source: string; // provenance — who created this memory
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  scope: string;
  projectId: string | null;
  source: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  metadata: Readonly<Record<string, unknown>>;
  relevance?: number;
  deletedAt: number | null;
}

/**
 * Create a memory in the database. Idempotent on (type, content, scope) via
 * the schema's @@unique constraint — uses upsert to handle duplicates gracefully
 * (callers may re-seed the same content without error).
 */
export async function createMemory(input: CreateMemoryInput): Promise<MemoryRecord> {
  const metadataJson = input.metadata ? safeStringify(input.metadata) : null;
  const record = await db.memory.upsert({
    where: {
      type_content_scope: {
        type: input.type,
        content: input.content,
        scope: input.scope ?? 'global',
      },
    },
    update: {
      source: input.source,
      confidence: input.confidence ?? 0.5,
      ...(metadataJson !== null && { metadata: metadataJson }),
    },
    create: {
      type: input.type,
      content: input.content,
      scope: input.scope ?? 'global',
      projectId: input.projectId ?? null,
      source: input.source,
      confidence: input.confidence ?? 0.5,
      metadata: metadataJson,
    },
  });
  log.debug('memory created', { id: record.id, type: record.type });
  return toMemoryRecord(record);
}

/**
 * Read a single memory by ID.
 */
export async function getMemory(id: string): Promise<MemoryRecord | null> {
  const record = await db.memory.findUnique({ where: { id } });
  return record ? toMemoryRecord(record) : null;
}

/**
 * Search memories by query (substring match on content + type filter).
 * For multi-word queries, splits into keywords and matches ANY.
 * Only returns non-deleted memories.
 */
export async function searchMemories(query: MemoryQuery): Promise<MemoryRecord[]> {
  const where: Record<string, unknown> = {
    deletedAt: null,
  };
  if (query.type) where.type = query.type;
  if (query.search) {
    // Split into keywords and match any (OR) for better recall
    const keywords = query.search.split(/\s+/).filter((w) => w.length > 1);
    if (keywords.length === 1) {
      where.content = { contains: keywords[0] };
    } else if (keywords.length > 1) {
      where.OR = keywords.map((kw) => ({ content: { contains: kw } }));
    }
  }

  const records = await db.memory.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: query.limit ?? 50,
  });

  return records.map(toMemoryRecord);
}

/**
 * Update a memory's content or confidence.
 */
export async function updateMemory(
  id: string,
  updates: { content?: string; confidence?: number; metadata?: Record<string, unknown> },
): Promise<MemoryRecord | null> {
  const data: Record<string, unknown> = {};
  if (updates.content !== undefined) data.content = updates.content;
  if (updates.confidence !== undefined) data.confidence = updates.confidence;
  if (updates.metadata !== undefined) data.metadata = safeStringify(updates.metadata);
  const record = await db.memory.update({ where: { id }, data });
  return toMemoryRecord(record);
}

/**
 * Soft-delete a memory (sets deletedAt timestamp).
 * Memory is recoverable until purge.
 */
export async function deleteMemory(id: string): Promise<void> {
  await db.memory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  log.debug('memory soft-deleted', { id });
}

/**
 * Permanently delete a memory (irreversible).
 */
export async function purgeMemory(id: string): Promise<void> {
  await db.memory.delete({ where: { id } });
  log.debug('memory purged', { id });
}

/**
 * Count memories by type (for stats). Uses Prisma groupBy (not findMany).
 */
export async function countMemories(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  const [total, groups] = await Promise.all([
    db.memory.count({ where: { deletedAt: null } }),
    db.memory.groupBy({
      by: ['type'],
      where: { deletedAt: null },
      _count: { type: true },
    }),
  ]);
  const byType: Record<string, number> = {};
  for (const g of groups) byType[g.type] = g._count.type;
  return { total, byType };
}

// ─── Helpers ───

function safeStringify(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function safeParse(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

type PrismaMemoryRow = {
  id: string;
  type: string;
  content: string;
  scope: string;
  projectId: string | null;
  source: string;
  confidence: number;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function toMemoryRecord(record: PrismaMemoryRow): MemoryRecord {
  return {
    id: record.id,
    type: record.type as MemoryType,
    content: record.content,
    scope: record.scope,
    projectId: record.projectId,
    source: record.source,
    confidence: record.confidence,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
    metadata: Object.freeze(safeParse(record.metadata)),
    relevance: undefined,
    deletedAt: record.deletedAt?.getTime() ?? null,
  };
}
