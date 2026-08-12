// ===================================================================
// MiMo AI — Context Assembly Engine
// ===================================================================
// ADR-007: Context management is mandatory. Every model call goes
// through assembleContext first.
// ===================================================================

import { db } from "@/lib/db";
import { retrieveMemories } from "./memory";
import { getAgent } from "./agents";
import type { AgentRole, ChatMessage } from "./types";

const MAX_HISTORY_MESSAGES = 20;
const MAX_CONTEXT_CHARS = 60_000;
const MAX_MEMORIES = 5;

export interface AssembledContext {
  system: string;
  messages: ChatMessage[];
  memories: Array<{ type: string; content: string; importance: number }>;
  tokenEstimate: number;
  historyTrimmed: boolean;
}

export interface AssembleContextInput {
  conversationId?: string;
  userMessage: string;
  agentName?: AgentRole;
  extraSystem?: string;
}

export async function assembleContext(
  input: AssembleContextInput
): Promise<AssembledContext> {
  const { conversationId, userMessage, agentName, extraSystem } = input;

  // 1. Agent system prompt
  const agent = agentName ? getAgent(agentName) : undefined;
  const agentSystem = agent?.systemPrompt ?? "";

  // 2. Conversation history
  let history: ChatMessage[] = [];
  let historyTrimmed = false;
  if (conversationId) {
    const dbMessages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
    });
    history = dbMessages
      .reverse()
      .map((m) => ({
        role: m.role as ChatMessage["role"],
        content: m.content,
        name: m.agentName ?? undefined,
      }))
      .filter((m) => m.role !== "system");
    if (dbMessages.length === MAX_HISTORY_MESSAGES) {
      historyTrimmed = true;
    }
  }

  // 3. Relevant memories
  let memories: AssembledContext["memories"] = [];
  try {
    const dbMems = await retrieveMemories({
      query: userMessage,
      limit: MAX_MEMORIES,
      conversationId: conversationId,
    });
    memories = dbMems.map((m) => ({
      type: m.type,
      content: m.content,
      importance: m.importance,
    }));
  } catch {
    // memory retrieval failure is non-fatal
  }

  // 4. Build system prompt
  const systemParts: string[] = [];
  if (agentSystem) {
    systemParts.push(agentSystem);
  }
  if (memories.length > 0) {
    systemParts.push(
      "\n\n## Relevant Memories\n" +
        memories
          .map((m) => `- [${m.type}] (importance ${m.importance.toFixed(2)}) ${m.content}`)
          .join("\n")
    );
  }
  if (extraSystem) {
    systemParts.push("\n\n" + extraSystem);
  }
  const system = systemParts.join("");

  // 5. Build messages
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  // 6. Token estimate (~4 chars = 1 token)
  const totalChars = system.length + messages.reduce((sum, m) => sum + m.content.length, 0);
  const tokenEstimate = Math.ceil(totalChars / 4);

  // 7. Hard truncate if over limit (drop oldest messages)
  let trimmedMessages = messages;
  if (totalChars > MAX_CONTEXT_CHARS) {
    const overflow = totalChars - MAX_CONTEXT_CHARS;
    let dropped = 0;
    while (trimmedMessages.length > 2 && dropped < overflow) {
      const first = trimmedMessages[0];
      trimmedMessages = trimmedMessages.slice(1);
      dropped += first.content.length;
      historyTrimmed = true;
    }
  }

  return {
    system,
    messages: trimmedMessages,
    memories,
    tokenEstimate,
    historyTrimmed,
  };
}
