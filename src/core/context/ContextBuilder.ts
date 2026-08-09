/**
 * MiMo Core — Context Builder
 * ---------------------------
 * Builds the ContextObject that every other module uses. It does NOT
 * build a prompt — that is the Prompt Engine's job. It only assembles
 * the relevant pieces: user profile, conversation history, recalled
 * memory, knowledge graph (GraphRAG), environment, and arbitrary sources.
 *
 * The ContextObject is immutable once built.
 *
 * Phase 116 fix:
 *   - Removed hardcoded user identity "محمد عادل" (privacy + multi-user readiness).
 *     The default user is now neutral ("المستخدم") until the user adds their own
 *     identity via memory.
 *   - Wired GraphRagEngine into the production path: every buildContext call now
 *     runs entity detection + graph traversal + hybrid ranking + citation
 *     assembly. The retrieved knowledge is added as `web`-typed sources so
 *     the PromptEngine can include them with provenance.
 */

import type {
  ContextObject,
  ContextSource,
  ConversationTurn,
  MemoryEntry,
  PromptMode,
  UserProfile,
} from '../types';
import { memoryEngine } from '../memory/MemoryEngine';
import { graphRagRetrieve } from '../search/GraphRagEngine';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';

const log = createLogger('context');

export interface BuildContextOptions {
  user?: UserProfile;
  conversationId: string;
  history: readonly ConversationTurn[];
  /** The current user input, used to recall relevant memories + knowledge. */
  userInput: string;
  /** Optional pre-computed conversation summary. */
  summary?: string;
  /** Extra sources to include (e.g. file contents, web results). */
  extraSources?: readonly Omit<ContextSource, 'priority'>[];
  /** UI-selected mode, propagated to the Planner/Writer via context.task.mode. */
  mode?: PromptMode;
  /** Disable GraphRAG retrieval (e.g. for trivial queries). Default: false. */
  disableGraphRag?: boolean;
}

// Phase 116: neutral default user — no hardcoded personal identity.
const DEFAULT_USER: UserProfile = {
  id: 'user_mimo',
  name: 'المستخدم',
  preferences: {
    locale: 'ar',
    timezone: 'Asia/Jerusalem',
    style: 'direct',
  } as Readonly<Record<string, unknown>>,
};

export async function buildContext(options: BuildContextOptions): Promise<ContextObject> {
  const user = options.user ?? DEFAULT_USER;
  const now = Date.now();

  // Recall relevant memories based on the user input.
  let relevant: readonly MemoryEntry[] = [];
  try {
    relevant = await memoryEngine.recall({
      search: options.userInput,
      limit: 5,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('memory recall failed', { error: msg });
  }

  // Recent memories (last 3 regardless of relevance).
  let recent: readonly MemoryEntry[] = [];
  try {
    recent = await memoryEngine.recall({ limit: 3 });
  } catch {
    // ignore — recent is best-effort
  }

  // ── GraphRAG retrieval (Phase 116: wired into production path) ──
  // Entity detection → graph traversal → hybrid ranking → citation assembly.
  let graphRagResult: Awaited<ReturnType<typeof graphRagRetrieve>> | null = null;
  if (!options.disableGraphRag && options.userInput.trim().length > 0) {
    try {
      graphRagResult = await graphRagRetrieve(options.userInput, { budget: 4000 });
    } catch (err) {
      log.warn('graphrag retrieval failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Assemble sources, sorted by priority desc.
  const sources: ContextSource[] = [];

  // 1. Relevant memories (highest priority).
  for (const mem of relevant) {
    sources.push({
      id: mem.id,
      type: 'memory',
      priority: (mem.relevance ?? 0.5) * 100,
      content: mem,
    });
  }

  // 2. Knowledge-graph entities (from GraphRAG).
  if (graphRagResult) {
    for (const e of graphRagResult.entities) {
      sources.push({
        id: e.id,
        type: 'web', // 'web' is the closest semantic match for external knowledge
        priority: e.confidence * 70,
        content: { kind: 'knowledge-entity', entity: e },
      });
    }
    for (const e of graphRagResult.relatedEntities) {
      sources.push({
        id: 'rel_' + e.id,
        type: 'web',
        priority: e.confidence * 50,
        content: { kind: 'related-entity', entity: e },
      });
    }
  }

  // 3. Extra sources from the caller.
  if (options.extraSources) {
    for (const s of options.extraSources) {
      sources.push({ ...s, priority: 50 });
    }
  }
  sources.sort((a, b) => b.priority - a.priority);

  const ctx: ContextObject = {
    user,
    conversation: {
      id: options.conversationId,
      history: options.history,
      summary: options.summary,
    },
    memory: { recent, relevant },
    task: { mode: options.mode, current: options.userInput },
    environment: {
      timezone: (user.preferences.timezone as string) ?? 'Asia/Jerusalem',
      locale: String(user.preferences.locale ?? 'ar'),
      now,
    },
    sources,
  };

  mimoEvents.emit(
    createEvent(
      EVENT.CONTEXT_BUILT,
      {
        conversationId: ctx.conversation.id,
        memoryCount: relevant.length,
        sourceCount: sources.length,
        graphRagEntities: graphRagResult?.entities.length ?? 0,
        graphRagRelated: graphRagResult?.relatedEntities.length ?? 0,
        graphRagCitations: graphRagResult?.citations.length ?? 0,
        graphRagBudgetUsed: graphRagResult?.budgetUsed ?? 0,
      },
      'context',
      ctx.conversation.id,
    ),
  );
  log.debug('context built', {
    history: ctx.conversation.history.length,
    memories: relevant.length,
    sources: sources.length,
    graphRagEntities: graphRagResult?.entities.length ?? 0,
  });
  return ctx;
}

export { DEFAULT_USER };
