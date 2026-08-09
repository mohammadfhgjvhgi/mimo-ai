/**
 * MiMo Core — Knowledge Entity Repository
 * ----------------------------------------
 * Phase 15: Knowledge Foundation.
 * Entities are derived from memory (not user-created).
 * Each entity has: type, name, confidence, evidence, provenance.
 *
 * Phase 116 fix: migrated from raw SQL to proper Prisma models
 * (KnowledgeEntity + KnowledgeRelationship) so they are under migration
 * control. The toEntityId index now exists (was missing — caused
 * slow getNeighbors queries). ID generation uses Prisma's cuid().
 */

import { db } from '@/lib/db';
import { createLogger } from '../logger';

const log = createLogger('knowledge:repository');

export type EntityType =
  | 'person'
  | 'project'
  | 'place'
  | 'organization'
  | 'document'
  | 'concept'
  | 'event'
  | 'skill'
  | 'goal'
  | 'artifact';

export interface KnowledgeEntity {
  id: string;
  type: EntityType;
  name: string;
  confidence: number;
  evidenceCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * No-op backward-compat stub. Tables are now created by Prisma migrations
 * (db:push) — no runtime creation needed. Kept so existing callers
 * (KnowledgeGraph, tests) don't break.
 */
export async function ensureTables(): Promise<void> {
  /* tables are managed by Prisma schema — nothing to do at runtime */
}

/**
 * Upsert an entity by (type, name). On conflict, bump confidence + evidence count.
 */
export async function upsertEntity(input: {
  type: EntityType;
  name: string;
  confidence?: number;
  source?: string;
}): Promise<KnowledgeEntity | null> {
  try {
    // findFirst because we don't have a unique constraint on (type, name) —
    // we could add one, but there may be pre-existing duplicates from raw SQL era.
    const existing = await db.knowledgeEntity.findFirst({
      where: { name: input.name, type: input.type },
    });

    if (existing) {
      const newConfidence = Math.min(1.0, existing.confidence + 0.1);
      const updated = await db.knowledgeEntity.update({
        where: { id: existing.id },
        data: {
          confidence: newConfidence,
          evidenceCount: existing.evidenceCount + 1,
        },
      });
      log.debug('entity updated', { id: updated.id, name: input.name });
      return toKnowledgeEntity(updated);
    }

    const created = await db.knowledgeEntity.create({
      data: {
        type: input.type,
        name: input.name,
        confidence: input.confidence ?? 0.5,
        evidenceCount: 1,
      },
    });
    log.debug('entity created', { id: created.id, name: input.name, type: input.type });
    return toKnowledgeEntity(created);
  } catch (err) {
    log.warn('failed to upsert entity', {
      name: input.name,
      type: input.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Get a single entity by ID. Used by retrieveKnowledge to resolve entity IDs.
 */
export async function getEntityById(id: string): Promise<KnowledgeEntity | null> {
  try {
    const row = await db.knowledgeEntity.findUnique({ where: { id } });
    return row ? toKnowledgeEntity(row) : null;
  } catch {
    return null;
  }
}

export async function searchEntities(query: string, limit = 20): Promise<KnowledgeEntity[]> {
  try {
    const rows = await db.knowledgeEntity.findMany({
      where: { name: { contains: query } },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
    return rows.map(toKnowledgeEntity);
  } catch {
    return [];
  }
}

export async function getEntitiesByType(type: EntityType): Promise<KnowledgeEntity[]> {
  try {
    const rows = await db.knowledgeEntity.findMany({
      where: { type },
      orderBy: { confidence: 'desc' },
    });
    return rows.map(toKnowledgeEntity);
  } catch {
    return [];
  }
}

export async function countEntities(): Promise<{ total: number; byType: Record<string, number> }> {
  try {
    const [total, groups] = await Promise.all([
      db.knowledgeEntity.count(),
      db.knowledgeEntity.groupBy({ by: ['type'], _count: { type: true } }),
    ]);
    const byType: Record<string, number> = {};
    for (const g of groups) byType[g.type] = g._count.type;
    return { total, byType };
  } catch {
    return { total: 0, byType: {} };
  }
}

/**
 * Create a relationship. Idempotent on (fromEntityId, toEntityId, type)
 * via the unique constraint. On conflict, does nothing (no confidence bump
 * — relationships are binary facts, not accumulators).
 */
export async function createRelationship(input: {
  fromEntityId: string;
  toEntityId: string;
  type: string;
  confidence?: number;
}): Promise<void> {
  try {
    await db.knowledgeRelationship.upsert({
      where: {
        fromEntityId_toEntityId_type: {
          fromEntityId: input.fromEntityId,
          toEntityId: input.toEntityId,
          type: input.type,
        },
      },
      update: {},
      create: {
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
        type: input.type,
        confidence: input.confidence ?? 0.5,
      },
    });
    log.debug('relationship ensured', {
      from: input.fromEntityId,
      to: input.toEntityId,
      type: input.type,
    });
  } catch (err) {
    log.warn('failed to create relationship', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getRelationships(
  entityId: string,
): Promise<
  { id: string; fromEntityId: string; toEntityId: string; type: string; createdAt: number }[]
> {
  try {
    const rows = await db.knowledgeRelationship.findMany({
      where: { OR: [{ fromEntityId: entityId }, { toEntityId: entityId }] },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      fromEntityId: r.fromEntityId,
      toEntityId: r.toEntityId,
      type: r.type,
      createdAt: r.createdAt.getTime(),
    }));
  } catch {
    return [];
  }
}

// ─── Helpers ───

type PrismaKnowledgeEntityRow = {
  id: string;
  type: string;
  name: string;
  description: string | null;
  confidence: number;
  evidenceCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toKnowledgeEntity(row: PrismaKnowledgeEntityRow): KnowledgeEntity {
  return {
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
