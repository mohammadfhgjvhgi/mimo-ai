/**
 * MiMo Core — Memory Engine (Database-backed)
 * -------------------------------------------
 * v2.0: Persistent memory via Prisma/SQLite. Data survives restarts.
 * Maintains the same interface as v1.0 so callers don't change.
 *
 * Emits memory.stored / memory.recalled events so other modules
 * (e.g. Context Builder) can react.
 *
 * IMPORTANT: store() and recall() are ASYNC now (database I/O).
 * Callers that used the sync v1.0 interface must await these calls.
 */

import type {
  MemoryEntry,
  MemoryQuery,
  MemoryType,
} from '../types';
import { MemoryError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import * as MemoryRepo from './MemoryRepository';

const log = createLogger('memory');

class MemoryEngine {
  /**
   * Store a new memory in the database.
   * Returns the created entry (with id + timestamp).
   */
  async store(input: {
    type: MemoryType;
    content: string;
    source?: string;
    metadata?: Record<string, unknown>;
    scope?: string;
    projectId?: string | null;
    confidence?: number;
  }): Promise<MemoryEntry> {
    try {
      const record = await MemoryRepo.createMemory({
        type: input.type,
        content: input.content,
        source: input.source ?? 'unknown',
        scope: input.scope,
        projectId: input.projectId,
        confidence: input.confidence,
        metadata: input.metadata,
      });

      log.debug('memory stored', { id: record.id, type: record.type });

      mimoEvents.emit(
        createEvent(
          EVENT.MEMORY_STORED,
          { id: record.id, type: record.type, content: record.content },
          'memory',
        ),
      );

      return {
        id: record.id,
        type: record.type,
        content: record.content,
        metadata: record.metadata,
        createdAt: record.createdAt,
        relevance: record.relevance,
      } as MemoryEntry;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new MemoryError('failed to store memory', { error: msg });
    }
  }

  /**
   * Recall memories matching a query. Returns entries sorted by
   * relevance (computed naively as substring match score) then recency.
   */
  async recall(query: MemoryQuery): Promise<readonly MemoryEntry[]> {
    try {
      const records = await MemoryRepo.searchMemories(query);
      // Score by naive relevance (substring match → 0.5, otherwise recency-based)
      const scored = records.map((r) => {
        let relevance = 0.5;
        if (query.search && r.content.toLowerCase().includes(query.search.toLowerCase())) {
          relevance = 0.8;
        }
        return { ...r, relevance };
      });

      scored.sort((a, b) => {
        const r = (b.relevance ?? 0) - (a.relevance ?? 0);
        if (r !== 0) return r;
        return b.createdAt - a.createdAt;
      });

      const limit = query.limit ?? 50;
      const results = scored.slice(0, limit).map((r) => ({
        id: r.id,
        type: r.type,
        content: r.content,
        metadata: r.metadata,
        createdAt: r.createdAt,
        relevance: r.relevance,
      })) as MemoryEntry[];

      if (results.length > 0) {
        mimoEvents.emit(
          createEvent(
            EVENT.MEMORY_RECALLED,
            { count: results.length, query },
            'memory',
          ),
        );
      }

      return results;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('memory recall failed', { error: msg });
      return [];
    }
  }

  /**
   * Get a single entry by id.
   */
  async get(id: string): Promise<MemoryEntry | null> {
    return MemoryRepo.getMemory(id);
  }

  /**
   * Update a memory's content, confidence, or metadata.
   */
  async update(
    id: string,
    updates: { content?: string; confidence?: number; metadata?: Record<string, unknown> },
  ): Promise<void> {
    await MemoryRepo.updateMemory(id, updates);
    mimoEvents.emit(
      createEvent(EVENT.MEMORY_STORED, { id, action: 'updated' }, 'memory'),
    );
  }

  /**
   * Soft-delete a memory (sets deletedAt). Recoverable until purge.
   */
  async delete(id: string): Promise<void> {
    await MemoryRepo.deleteMemory(id);
  }

  /**
   * Permanently delete a memory (irreversible).
   */
  async purge(id: string): Promise<void> {
    await MemoryRepo.purgeMemory(id);
  }

  /**
   * Count memories by type (for stats).
   */
  async stats(): Promise<{ total: number; byType: Record<string, number> }> {
    return MemoryRepo.countMemories();
  }
}

/** Singleton memory engine for the whole MiMo Core. */
export const memoryEngine = new MemoryEngine();
