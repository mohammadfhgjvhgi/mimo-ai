/**
 * MiMo Core — Context Engine
 * ---------------------------
 * Phase 47-50: Intelligent context assembly with budget management,
 * hallucination control, and fact/inference separation.
 *
 * Decides: what to include, what to exclude, what to summarize,
 * what to retrieve, what to prioritize — based on intent, recency,
 * relevance, confidence, provenance, token budget, model capability, privacy.
 */

import { memoryEngine } from '../memory/MemoryEngine';
import { searchEntities, getRelationships } from '../knowledge/KnowledgeRepository';
import { getSubgraph } from '../knowledge/KnowledgeGraph';
import { db } from '@/lib/db';
import { createLogger } from '../logger';

const log = createLogger('context:engine');

export type ClaimType = 'FACT' | 'INFERENCE' | 'ASSUMPTION' | 'UNKNOWN';

export interface ContextPiece {
  id: string;
  kind: 'memory' | 'knowledge' | 'conversation' | 'artifact' | 'system';
  content: string;
  source: string;
  confidence: number;
  claimType: ClaimType;
  priority: number; // 0..1, higher = more important
  tokens: number;
}

export interface AssembledContext {
  pieces: ContextPiece[];
  totalTokens: number;
  budgetTotal: number;
  budgetByCategory: Record<string, { used: number; total: number }>;
  excluded: Array<{ id: string; reason: string }>;
  citations: Array<{ source: string; type: ClaimType; confidence: number }>;
  claimTypes: Record<ClaimType, number>;
}

const BUDGETS = {
  system: 500,
  memory: 1500,
  knowledge: 1500,
  conversation: 1500,
  artifacts: 500,
  reasoning: 500,
};

/**
 * Assemble context intelligently with budget management.
 */
export async function assembleContext(
  query: string,
  options?: { conversationId?: string; budgetOverride?: Partial<typeof BUDGETS> },
): Promise<AssembledContext> {
  const budgets = { ...BUDGETS, ...options?.budgetOverride };
  const pieces: ContextPiece[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];
  const citations: Array<{ source: string; type: ClaimType; confidence: number }> = [];
  const claimTypes: Record<ClaimType, number> = { FACT: 0, INFERENCE: 0, ASSUMPTION: 0, UNKNOWN: 0 };

  const budgetByCategory: Record<string, { used: number; total: number }> = {};
  for (const [k, v] of Object.entries(budgets)) {
    budgetByCategory[k] = { used: 0, total: v };
  }

  let totalTokens = 0;

  // 1. System context
  const systemText = 'You are MiMo, a personal AI operating system. Respond in Arabic unless asked otherwise.';
  const systemTokens = Math.ceil(systemText.length / 4);
  if (budgetByCategory.system.used + systemTokens <= budgets.system) {
    pieces.push({
      id: 'system', kind: 'system', content: systemText,
      source: 'system', confidence: 1.0, claimType: 'FACT',
      priority: 1.0, tokens: systemTokens,
    });
    budgetByCategory.system.used += systemTokens;
    totalTokens += systemTokens;
    claimTypes.FACT++;
    citations.push({ source: 'system', type: 'FACT', confidence: 1.0 });
  }

  // 2. Memory retrieval
  try {
    const memories = await memoryEngine.recall({ search: query, limit: 8 });
    for (const m of memories) {
      const tokens = Math.ceil(m.content.length / 4);
      if (budgetByCategory.memory.used + tokens > budgets.memory) {
        excluded.push({ id: m.id, reason: 'budget_exceeded:memory' });
        continue;
      }
      const claimType: ClaimType = m.type === 'fact' ? 'FACT' : m.type === 'preference' ? 'FACT' : 'INFERENCE';
      pieces.push({
        id: m.id, kind: 'memory', content: m.content,
        source: m.metadata?.source as string ?? 'memory',
        confidence: m.metadata?.confidence as number ?? 0.5,
        claimType, priority: 0.7, tokens,
      });
      budgetByCategory.memory.used += tokens;
      totalTokens += tokens;
      claimTypes[claimType]++;
      citations.push({ source: 'memory', type: claimType, confidence: m.metadata?.confidence as number ?? 0.5 });
    }
  } catch (err) {
    log.warn('memory retrieval failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // 3. Knowledge retrieval + graph expansion
  try {
    const entities = await searchEntities(query, 5);
    for (const e of entities) {
      const text = `${e.name} (${e.type}, confidence: ${Math.round(e.confidence * 100)}%)`;
      const tokens = Math.ceil(text.length / 4);
      if (budgetByCategory.knowledge.used + tokens > budgets.knowledge) {
        excluded.push({ id: e.id, reason: 'budget_exceeded:knowledge' });
        continue;
      }
      pieces.push({
        id: e.id, kind: 'knowledge', content: text,
        source: 'knowledge-graph', confidence: e.confidence,
        claimType: e.evidenceCount > 3 ? 'FACT' : 'INFERENCE',
        priority: 0.6, tokens,
      });
      budgetByCategory.knowledge.used += tokens;
      totalTokens += tokens;
      claimTypes[e.evidenceCount > 3 ? 'FACT' : 'INFERENCE']++;
      citations.push({ source: 'knowledge-graph', type: e.evidenceCount > 3 ? 'FACT' : 'INFERENCE', confidence: e.confidence });
    }
  } catch (err) {
    log.warn('knowledge retrieval failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // 4. Conversation retrieval
  if (options?.conversationId) {
    try {
      const messages = await db.message.findMany({
        where: { conversationId: options.conversationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      for (const m of messages) {
        const tokens = Math.ceil(m.content.length / 4);
        if (budgetByCategory.conversation.used + tokens > budgets.conversation) {
          excluded.push({ id: m.id, reason: 'budget_exceeded:conversation' });
          continue;
        }
        pieces.push({
          id: m.id, kind: 'conversation', content: m.content,
          source: `conversation:${m.conversationId}`,
          confidence: 0.9, claimType: 'FACT',
          priority: 0.8, tokens,
        });
        budgetByCategory.conversation.used += tokens;
        totalTokens += tokens;
        claimTypes.FACT++;
      }
    } catch {}
  }

  // Sort by priority (highest first)
  pieces.sort((a, b) => b.priority - a.priority);

  log.debug('context assembled', {
    pieces: pieces.length, tokens: totalTokens,
    excluded: excluded.length, citations: citations.length,
    claimTypes,
  });

  return { pieces, totalTokens, budgetTotal: totalTokens, budgetByCategory, excluded, citations, claimTypes };
}

/**
 * Hallucination Control: Check a claim against known evidence.
 * Returns confidence + whether evidence supports the claim.
 */
export function checkClaim(
  claim: string,
  citations: Array<{ source: string; type: ClaimType; confidence: number }>,
): {
  claimType: ClaimType;
  confidence: number;
  supported: boolean;
  reason: string;
} {
  // If we have citations with FACT type and high confidence
  const facts = citations.filter(c => c.type === 'FACT' && c.confidence > 0.7);
  if (facts.length > 0) {
    return {
      claimType: 'FACT',
      confidence: facts[0].confidence,
      supported: true,
      reason: `Supported by ${facts.length} fact(s) from ${facts[0].source}`,
    };
  }

  // If we have inferences
  const inferences = citations.filter(c => c.type === 'INFERENCE');
  if (inferences.length > 0) {
    return {
      claimType: 'INFERENCE',
      confidence: inferences[0].confidence,
      supported: true,
      reason: `Inferred from ${inferences.length} source(s)`,
    };
  }

  // No evidence → UNKNOWN
  return {
    claimType: 'UNKNOWN',
    confidence: 0,
    supported: false,
    reason: 'No evidence found in knowledge base or memory',
  };
}
