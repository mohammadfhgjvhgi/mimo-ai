/**
 * MiMo Core — Memory Intelligence Engine
 * ---------------------------------------
 * Phase 43-46: Memory lifecycle, consolidation, decay, conflict resolution.
 *
 * Memory Types:
 * - working: current session, ephemeral
 * - short_term: recent, high access
 * - long_term: persistent, important
 * - episodic: specific events
 * - semantic: derived facts
 * - procedural: how-to knowledge
 *
 * Lifecycle: capture → classify → score → consolidate → decay → archive → forget
 */

import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { memoryEngine } from '../memory/MemoryEngine';
import { upsertEntity } from '../knowledge/KnowledgeRepository';
import type { MemoryEntry } from '../types';

const log = createLogger('memory:intelligence');

export type MemoryTier = 'working' | 'short_term' | 'long_term' | 'episodic' | 'semantic' | 'procedural';

export interface MemoryScore {
  importance: number; // 0..1
  confidence: number; // 0..1
  recency: number; // 0..1 (1 = just now)
  frequency: number; // 0..1 (based on access count)
  centrality: number; // 0..1 (relationship to other memories)
  overall: number; // weighted score
}

export interface ConsolidationResult {
  merged: number;
  promoted: number; // memories promoted to knowledge
  archived: number;
  conflicts: Array<{ oldId: string; newId: string; resolution: string }>;
}

const HALFLIFE_DAYS = {
  working: 0.04, // ~1 hour
  short_term: 7,
  long_term: 365,
  episodic: 90,
  semantic: 365,
  procedural: 730,
};

/**
 * Score a memory based on importance, confidence, recency, frequency, centrality.
 */
export function scoreMemory(entry: MemoryEntry, accessCount = 0): MemoryScore {
  const ageDays = (Date.now() - entry.createdAt) / (1000 * 60 * 60 * 24);
  const tier = (entry.metadata?.tier as MemoryTier) ?? 'long_term';
  const halflife = HALFLIFE_DAYS[tier] ?? 90;

  const importance = (entry.metadata?.importance as number) ?? 0.5;
  const confidence = (entry.metadata?.confidence as number) ?? 0.5;
  const recency = Math.exp(-ageDays / halflife);
  const frequency = Math.min(1, accessCount / 10);
  const centrality = (entry.metadata?.centrality as number) ?? 0.3;

  // Weighted overall score
  const overall = (
    importance * 0.30 +
    confidence * 0.25 +
    recency * 0.20 +
    frequency * 0.15 +
    centrality * 0.10
  );

  return { importance, confidence, recency, frequency, centrality, overall };
}

/**
 * Classify a memory into a tier based on its type and content.
 */
export function classifyMemory(type: string, content: string): MemoryTier {
  if (type === 'fact') return 'semantic';
  if (type === 'skill') return 'procedural';
  if (type === 'goal') return 'long_term';
  if (type === 'event') return 'episodic';
  if (type === 'preference') return 'long_term';

  // Heuristic: short content = working, long = long_term
  if (content.length < 50) return 'short_term';
  return 'long_term';
}

/**
 * Consolidate memories: find duplicates, merge, promote to knowledge.
 */
export async function consolidateMemories(): Promise<ConsolidationResult> {
  const result: ConsolidationResult = { merged: 0, promoted: 0, archived: 0, conflicts: [] };

  try {
    // Get all non-deleted memories
    const memories = await memoryEngine.recall({ limit: 1000 });
    const memArray = [...memories];

    // 1. Find duplicates (same type + similar content)
    for (let i = 0; i < memArray.length; i++) {
      for (let j = i + 1; j < memArray.length; j++) {
        const a = memArray[i];
        const b = memArray[j];

        if (a.type !== b.type) continue;

        // Similarity: same content or high overlap
        if (a.content === b.content) {
          // Exact duplicate — merge into the older one, delete the newer
          try {
            await memoryEngine.delete(b.id);
            result.merged++;
            log.debug('merged duplicate', { kept: a.id, deleted: b.id });
          } catch {}
        } else if (contentSimilarity(a.content, b.content) > 0.85) {
          // High similarity — potential conflict
          result.conflicts.push({
            oldId: a.id,
            newId: b.id,
            resolution: 'kept both (similar but not identical)',
          });
        }
      }
    }

    // 2. Promote high-confidence, high-evidence memories to knowledge
    for (const m of memArray) {
      const score = scoreMemory(m);
      if (score.overall > 0.7 && (m.type === 'skill' || m.type === 'fact' || m.type === 'goal')) {
        try {
          await upsertEntity({
            type: m.type === 'skill' ? 'skill' : m.type === 'goal' ? 'goal' : 'concept',
            name: m.content.slice(0, 60),
            confidence: score.confidence,
            source: `memory:${m.id}`,
          });
          result.promoted++;
        } catch (err) {
          log.warn('failed to promote memory to knowledge', { memoryId: m.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    // 3. Archive low-score old memories (soft delete)
    for (const m of memArray) {
      const score = scoreMemory(m);
      const ageDays = (Date.now() - m.createdAt) / (1000 * 60 * 60 * 24);
      if (score.overall < 0.15 && ageDays > 30) {
        try {
          await memoryEngine.delete(m.id);
          result.archived++;
          log.debug('archived low-score memory', { id: m.id, score: score.overall });
        } catch {}
      }
    }

    log.info('consolidation complete', { merged: result.merged, promoted: result.promoted, archived: result.archived, conflicts: result.conflicts.length });
  } catch (err) {
    log.warn('consolidation failed', { error: err instanceof Error ? err.message : String(err) });
  }

  return result;
}

/**
 * Resolve conflicts between old and new memories.
 * If the new memory has higher confidence, it replaces the old.
 * If the old has higher confidence, the new is stored as a revision.
 */
export async function resolveConflict(
  oldMemory: MemoryEntry,
  newContent: string,
  newConfidence: number,
): Promise<{ action: 'replaced' | 'revision' | 'kept_both'; reason: string }> {
  const oldConfidence = (oldMemory.metadata?.confidence as number) ?? 0.5;

  if (newConfidence > oldConfidence + 0.2) {
    // New is significantly more confident — replace old
    try {
      await memoryEngine.update(oldMemory.id, { content: newContent, confidence: newConfidence });
      return { action: 'replaced', reason: `New confidence (${newConfidence}) > old (${oldConfidence})` };
    } catch {
      return { action: 'kept_both', reason: 'Update failed, kept both' };
    }
  } else if (newConfidence > oldConfidence) {
    // New is slightly more confident — store as revision
    return { action: 'revision', reason: `New slightly more confident (${newConfidence} vs ${oldConfidence})` };
  }

  // Old is more confident — keep both with conflict marker
  return { action: 'kept_both', reason: `Old more confident (${oldConfidence} vs ${newConfidence})` };
}

/**
 * Calculate content similarity (Jaccard on word sets).
 */
function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
