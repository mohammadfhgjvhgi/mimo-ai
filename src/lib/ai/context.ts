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

  // 4. Knowledge Base search — find relevant research/docs
  let knowledgeContext = "";
  try {
    const keywords = userMessage.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 5);
    if (keywords.length > 0) {
      const entries = await db.knowledgeEntry.findMany({
        where: {
          OR: keywords.flatMap((kw) => [
            { title: { contains: kw } },
            { summary: { contains: kw } },
            { content: { contains: kw } },
          ]),
        },
        orderBy: [{ accessCount: "desc" }],
        take: 3,
        select: { id: true, title: true, summary: true, content: true },
      });
      if (entries.length > 0) {
        knowledgeContext = "\n\n## Relevant Knowledge Base\n" +
          entries.map((e) => `### ${e.title}\n${(e.summary ?? e.content).slice(0, 500)}`).join("\n\n");
        // Update access count
        await Promise.all(entries.map((e) =>
          db.knowledgeEntry.update({ where: { id: e.id }, data: { accessCount: { increment: 1 }, accessedAt: new Date() } })
        )).catch(() => {});
      }
    }
  } catch {
    // non-fatal
  }

  // 5. Build system prompt
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
  if (knowledgeContext) {
    systemParts.push(knowledgeContext);
  }
  if (extraSystem) {
    systemParts.push("\n\n" + extraSystem);
  }
  const system = systemParts.join("");

  // 6. Build messages
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  // 7. Token estimate (~4 chars = 1 token)
  const totalChars = system.length + messages.reduce((sum, m) => sum + m.content.length, 0);
  const tokenEstimate = Math.ceil(totalChars / 4);

  // 8. Context compression — summarize old messages if over budget
  let trimmedMessages = messages;
  if (totalChars > MAX_CONTEXT_CHARS) {
    // Compress: summarize older messages into a single system note
    const overflowChars = totalChars - MAX_CONTEXT_CHARS;
    const messagesToCompress: typeof messages = [];
    let compressedChars = 0;
    while (trimmedMessages.length > 4 && compressedChars < overflowChars) {
      const msg = trimmedMessages[0];
      messagesToCompress.push(msg);
      trimmedMessages = trimmedMessages.slice(1);
      compressedChars += msg.content.length;
    }
    if (messagesToCompress.length > 0) {
      const compressedSummary = messagesToCompress
        .map((m) => `[${m.role}] ${m.content.slice(0, 100)}`)
        .join(" | ");
      trimmedMessages = [
        { role: "system" as const, content: `[Previous conversation summary: ${compressedSummary.slice(0, 800)}]` },
        ...trimmedMessages,
      ];
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
