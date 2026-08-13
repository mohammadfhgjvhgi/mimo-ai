// ===================================================================
// MiMo AI — Advanced Intelligence Layer
// ===================================================================
// Implements research gaps from R1/R2 capability map:
// - Adaptive Personality (persona registry)
// - Dual-stream Memory (implicit learning)
// - Offline Consolidation (dreaming)
// - Personal World Model
// - Dynamic Agent Creation
// - Debate Pattern
// - Entity Resolution
// - Contradiction Detection
// - ExpeL (experience-based learning)
// ===================================================================

import { db } from "@/lib/db";
import { chat } from "./model";
import type { ChatMessage as ZaiChatMessage } from "z-ai-web-dev-sdk";

// ─── 1. Adaptive Personality ────────────────────────────────────────

export interface PersonaProfile {
  tone: "formal" | "casual" | "balanced";
  verbosity: "terse" | "verbose" | "balanced";
  modality: "text" | "code" | "mixed";
  decisionStyle: "analytical" | "intuitive" | "balanced";
}

const DEFAULT_PERSONA: PersonaProfile = {
  tone: "balanced",
  verbosity: "balanced",
  modality: "mixed",
  decisionStyle: "balanced",
};

/**
 * Load or infer the user's persona profile from past interactions.
 */
export async function loadPersonaProfile(conversationId?: string): Promise<PersonaProfile> {
  if (!conversationId) return DEFAULT_PERSONA;

  try {
    const preferences = await db.memory.findMany({
      where: {
        type: "preference",
        OR: [{ conversationId }, { conversationId: null }],
      },
      take: 10,
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    });

    const profile: PersonaProfile = { ...DEFAULT_PERSONA };
    for (const pref of preferences) {
      const content = pref.content.toLowerCase();
      if (content.includes("formal") || content.includes("رسمي")) profile.tone = "formal";
      if (content.includes("casual") || content.includes("غير رسمي")) profile.tone = "casual";
      if (content.includes("terse") || content.includes("مختصر")) profile.verbosity = "terse";
      if (content.includes("verbose") || content.includes("تفصيلي")) profile.verbosity = "verbose";
      if (content.includes("code") || content.includes("كود")) profile.modality = "code";
      if (content.includes("analytical") || content.includes("تحليلي")) profile.decisionStyle = "analytical";
    }

    return profile;
  } catch {
    return DEFAULT_PERSONA;
  }
}

/**
 * Build a persona-adjusted system prompt fragment.
 */
export function applyPersona(profile: PersonaProfile, basePrompt: string): string {
  const fragments: string[] = [basePrompt];

  const toneMap = {
    formal: "Use a formal, professional tone.",
    casual: "Use a casual, friendly tone.",
    balanced: "Match the user's tone.",
  };

  const verbosityMap = {
    terse: "Be concise. No fluff.",
    verbose: "Be thorough. Explain in detail.",
    balanced: "Be clear and appropriately detailed.",
  };

  const modalityMap = {
    text: "Prefer text explanations.",
    code: "Prefer code examples.",
    mixed: "Use both text and code as appropriate.",
  };

  fragments.push(`\n\n## Communication Style\n- ${toneMap[profile.tone]}\n- ${verbosityMap[profile.verbosity]}\n- ${modalityMap[profile.modality]}`);

  return fragments.join("");
}

// ─── 2. Dual-Stream Memory (Implicit Learning) ──────────────────────

/**
 * Extract implicit preferences from conversation history.
 * Scans past messages for patterns the user didn't explicitly state.
 */
export async function extractImplicitPreferences(
  conversationId: string
): Promise<Array<{ type: string; content: string; confidence: number }>> {
  try {
    const messages = await db.message.findMany({
      where: { conversationId, role: "user" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { content: true },
    });

    if (messages.length < 5) return [];

    const patterns: Array<{ type: string; content: string; confidence: number }> = [];

    // Detect language preference
    const arabicCount = messages.filter((m) => /[\u0600-\u06FF]/.test(m.content)).length;
    if (arabicCount > messages.length * 0.7) {
      patterns.push({
        type: "preference",
        content: "User communicates primarily in Arabic",
        confidence: 0.9,
      });
    } else if (arabicCount < messages.length * 0.1) {
      patterns.push({
        type: "preference",
        content: "User communicates primarily in English",
        confidence: 0.9,
      });
    }

    // Detect code preference
    const codeCount = messages.filter((m) => m.content.includes("```") || m.content.includes("function") || m.content.includes("class")).length;
    if (codeCount > messages.length * 0.3) {
      patterns.push({
        type: "preference",
        content: "User frequently discusses code — prefer code examples",
        confidence: 0.7,
      });
    }

    // Detect verbosity preference
    const avgLength = messages.reduce((s, m) => s + m.content.length, 0) / messages.length;
    if (avgLength < 50) {
      patterns.push({
        type: "preference",
        content: "User sends short messages — prefer concise responses",
        confidence: 0.6,
      });
    } else if (avgLength > 300) {
      patterns.push({
        type: "preference",
        content: "User sends detailed messages — prefer thorough responses",
        confidence: 0.6,
      });
    }

    return patterns;
  } catch {
    return [];
  }
}

// ─── 3. Offline Consolidation (Dreaming) ────────────────────────────

/**
 * Periodically re-process memories to extract patterns, compress redundant episodes,
 * and refine the knowledge graph.
 * Research: R2 — Red Hat "From Context to Dreams"
 */
export async function consolidateMemory(conversationId: string): Promise<{
  patternsExtracted: number;
  memoriesCompressed: number;
  entitiesCreated: number;
}> {
  try {
    // 1. Get all episodic memories for this conversation
    const episodicMemories = await db.memory.findMany({
      where: { conversationId, type: "episodic" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    // 2. Get all short-term memories
    const shortTermMemories = await db.memory.findMany({
      where: { conversationId, type: "short_term" },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    let patternsExtracted = 0;
    let memoriesCompressed = 0;

    // 3. Promote high-importance short-term to long-term
    for (const mem of shortTermMemories) {
      if (mem.importance >= 0.7 && mem.accessCount >= 2) {
        await db.memory.update({
          where: { id: mem.id },
          data: { type: "long_term", scope: "global" },
        });
        memoriesCompressed++;
      }
    }

    // 4. Extract patterns from episodic memories using LLM
    if (episodicMemories.length >= 5) {
      const memoryText = episodicMemories
        .map((m) => `[${m.createdAt.toISOString()}] ${m.content.slice(0, 200)}`)
        .join("\n");

      const messages: ZaiChatMessage[] = [
        {
          role: "system",
          content: "You are a memory consolidation system. Analyze the episodic memories and extract recurring patterns. Return a JSON array of {pattern: string, confidence: number}.",
        },
        {
          role: "user",
          content: `Memories:\n${memoryText}\n\nExtract patterns:`,
        },
      ];

      try {
        const result = await chat(messages, { temperature: 0.3, maxTokens: 500 });
        // Try to parse patterns
        const match = result.content.match(/\[[\s\S]*\]/);
        if (match) {
          const patterns = JSON.parse(match[0]) as Array<{ pattern: string; confidence: number }>;
          for (const p of patterns.slice(0, 5)) {
            await db.memory.create({
              data: {
                type: "procedural",
                content: `Pattern: ${p.pattern}`,
                importance: p.confidence,
                scope: "conversation",
                conversationId,
                source: "consolidation",
                tags: JSON.stringify(["pattern", "consolidated"]),
              },
            });
            patternsExtracted++;
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return { patternsExtracted, memoriesCompressed, entitiesCreated: 0 };
  } catch (err) {
    console.warn("[consolidation] Failed:", err);
    return { patternsExtracted: 0, memoriesCompressed: 0, entitiesCreated: 0 };
  }
}

// ─── 4. Personal World Model ────────────────────────────────────────

/**
 * Predict what the user would likely do based on their past behavior.
 * Research: R2 — ICML 2025, "LLMs as Personal World Models"
 */
export async function predictUserBehavior(
  conversationId: string,
  currentContext: string
): Promise<{ prediction: string; confidence: number; reasoning: string }> {
  try {
    const memories = await db.memory.findMany({
      where: { conversationId, type: { in: ["episodic", "procedural", "preference"] } },
      orderBy: [{ importance: "desc" }],
      take: 20,
      select: { content: true, type: true },
    });

    if (memories.length < 3) {
      return { prediction: "Insufficient data for prediction", confidence: 0, reasoning: "Need more conversation history" };
    }

    const memoryContext = memories.map((m) => `[${m.type}] ${m.content}`).join("\n");

    const messages: ZaiChatMessage[] = [
      {
        role: "system",
        content: "You are a personal world model. Based on the user's past behavior, predict what they would likely do next. Return JSON: {prediction: string, confidence: 0-1, reasoning: string}",
      },
      {
        role: "user",
        content: `User's past:\n${memoryContext}\n\nCurrent context: ${currentContext}\n\nPredict next action:`,
      },
    ];

    const result = await chat(messages, { temperature: 0.4, maxTokens: 300 });
    try {
      return JSON.parse(result.content);
    } catch {
      return { prediction: result.content.slice(0, 200), confidence: 0.5, reasoning: "LLM prediction" };
    }
  } catch {
    return { prediction: "Prediction failed", confidence: 0, reasoning: "Error" };
  }
}

// ─── 5. Dynamic Agent Creation ─────────────────────────────────────

/**
 * Create a specialized agent on-the-fly for a unique task.
 * Research: R2 Base — "Dynamic Creation"
 */
export async function createDynamicAgent(
  taskDescription: string,
  requiredCapabilities: string[]
): Promise<{
  name: string;
  systemPrompt: string;
  recommendedTools: string[];
}> {
  const messages: ZaiChatMessage[] = [
    {
      role: "system",
      content: "You are an agent designer. Create a specialized agent for the given task. Return JSON: {name: string, systemPrompt: string, recommendedTools: string[]}. Tools available: web_search, web_reader, file_read, file_write, file_edit, file_delete, file_rename, file_search, code_search, patch, diff, dir_create, dir_list, memory_store, knowledge_search, browser_navigate, tool_chain, dry_run.",
    },
    {
      role: "user",
      content: `Task: ${taskDescription}\nRequired capabilities: ${requiredCapabilities.join(", ")}\n\nCreate agent:`,
    },
  ];

  const result = await chat(messages, { temperature: 0.4, maxTokens: 500 });
  try {
    return JSON.parse(result.content);
  } catch {
    return {
      name: "dynamic_agent",
      systemPrompt: `You are a specialized agent for: ${taskDescription}`,
      recommendedTools: ["file_read", "web_search"],
    };
  }
}

// ─── 6. Debate Pattern ─────────────────────────────────────────────

/**
 * Multiple agents debate a topic, then synthesize the best answer.
 * Research: R2 Base — "Debate Pattern"
 */
export async function debatePattern(
  topic: string,
  perspectives: string[] = ["optimist", "pessimist", "pragmatist"]
): Promise<{ synthesis: string; perspectives: Array<{ role: string; argument: string }> }> {
  const arguments_ = await Promise.all(
    perspectives.map(async (role) => {
      const messages: ZaiChatMessage[] = [
        {
          role: "system",
          content: `You are a ${role}. Argue your perspective on the topic. Be concise (max 200 words).`,
        },
        { role: "user", content: `Topic: ${topic}` },
      ];
      const result = await chat(messages, { temperature: 0.7, maxTokens: 300 });
      return { role, argument: result.content };
    })
  );

  // Synthesize
  const synthMessages: ZaiChatMessage[] = [
    {
      role: "system",
      content: "You are a synthesizer. Combine the arguments into a balanced conclusion.",
    },
    {
      role: "user",
      content: `Topic: ${topic}\n\nArguments:\n${arguments_.map((a) => `[${a.role}] ${a.argument}`).join("\n\n")}\n\nSynthesis:`,
    },
  ];
  const synth = await chat(synthMessages, { temperature: 0.3, maxTokens: 300 });

  return { synthesis: synth.content, perspectives: arguments_ };
}

// ─── 7. Entity Resolution ──────────────────────────────────────────

/**
 * Resolve duplicate entities in the knowledge graph.
 * Merges entities with similar names.
 */
export async function resolveEntities(projectId?: string): Promise<{ merged: number }> {
  try {
    const where = projectId ? { projectId } : {};
    const entities = await db.knowledgeEntity.findMany({
      where,
      select: { id: true, name: true, type: true },
    });

    // Group by normalized name
    const groups = new Map<string, typeof entities>();
    for (const e of entities) {
      const key = e.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    let merged = 0;
    for (const [, group] of groups) {
      if (group.length > 1) {
        // Keep first, merge rest
        const [keep, ...dups] = group;
        for (const dup of dups) {
          // Update relations to point to keep
          await db.knowledgeRelation.updateMany({
            where: { fromId: dup.id },
            data: { fromId: keep.id },
          }).catch(() => {});
          await db.knowledgeRelation.updateMany({
            where: { toId: dup.id },
            data: { toId: keep.id },
          }).catch(() => {});
          // Delete duplicate
          await db.knowledgeEntity.delete({ where: { id: dup.id } }).catch(() => {});
          merged++;
        }
      }
    }

    return { merged };
  } catch {
    return { merged: 0 };
  }
}

// ─── 8. Contradiction Detection ────────────────────────────────────

/**
 * Detect contradictions between knowledge entries or memories.
 */
export async function detectContradictions(
  conversationId: string
): Promise<Array<{ entry1: string; entry2: string; reason: string }>> {
  try {
    const memories = await db.memory.findMany({
      where: { conversationId },
      take: 30,
      orderBy: [{ importance: "desc" }],
      select: { id: true, content: true, type: true },
    });

    if (memories.length < 2) return [];

    const contradictions: Array<{ entry1: string; entry2: string; reason: string }> = [];

    // Simple contradiction detection: look for negation patterns
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const m1 = memories[i].content.toLowerCase();
        const m2 = memories[j].content.toLowerCase();

        // Check if one contains "not" or "don't" while the other affirms
        const hasNegation1 = /\b(not|don't|no|never|won't|cannot|لا|ليس|لا يمكن)\b/.test(m1);
        const hasNegation2 = /\b(not|don't|no|never|won't|cannot|لا|ليس|لا يمكن)\b/.test(m2);

        if (hasNegation1 !== hasNegation2) {
          // Check for common keywords
          const words1 = m1.split(/\s+/).filter((w) => w.length > 4);
          const words2 = m2.split(/\s+/).filter((w) => w.length > 4);
          const common = words1.filter((w) => words2.includes(w));
          if (common.length >= 3) {
            contradictions.push({
              entry1: memories[i].content.slice(0, 100),
              entry2: memories[j].content.slice(0, 100),
              reason: `Possible contradiction: one affirms, other negates. Common words: ${common.slice(0, 5).join(", ")}`,
            });
          }
        }
      }
    }

    return contradictions;
  } catch {
    return [];
  }
}

// ─── 9. ExpeL (Experience-Based Learning) ──────────────────────────

/**
 * Extract lessons from successful task executions.
 * Research: R2 — AAAI 2024, ExpeL
 */
export async function extractLessons(
  conversationId: string
): Promise<{ lessons: string[]; stored: number }> {
  try {
    // Get successful task executions
    const tasks = await db.task.findMany({
      where: { conversationId, status: "completed" },
      take: 10,
      orderBy: { completedAt: "desc" },
      select: { title: true, objective: true, completionNotes: true },
    });

    if (tasks.length < 2) return { lessons: [], stored: 0 };

    const taskSummaries = tasks.map((t) => `Task: ${t.title}\nObjective: ${t.objective}\nNotes: ${(t.completionNotes ?? "").slice(0, 200)}`).join("\n\n");

    const messages: ZaiChatMessage[] = [
      {
        role: "system",
        content: "You are an experience extraction system. Analyze completed tasks and extract transferable lessons. Return a JSON array of strings.",
      },
      {
        role: "user",
        content: `Completed tasks:\n${taskSummaries}\n\nExtract lessons:`,
      },
    ];

    const result = await chat(messages, { temperature: 0.3, maxTokens: 400 });
    let lessons: string[] = [];
    try {
      const match = result.content.match(/\[[\s\S]*\]/);
      if (match) {
        lessons = JSON.parse(match[0]);
      }
    } catch {
      // Non-fatal
    }

    // Store lessons as skill memories
    let stored = 0;
    for (const lesson of lessons.slice(0, 5)) {
      await db.memory.create({
        data: {
          type: "skill",
          content: `Lesson learned: ${lesson}`,
          importance: 0.6,
          scope: "global",
          conversationId,
          source: "expel",
          tags: JSON.stringify(["lesson", "expel"]),
        },
      });
      stored++;
    }

    return { lessons, stored };
  } catch {
    return { lessons: [], stored: 0 };
  }
}
