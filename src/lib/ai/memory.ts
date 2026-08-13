// ===================================================================
// MiMo AI — Memory Store (DB-backed, 9 types)
// ===================================================================

import { db } from "@/lib/db";
import type { MemoryType } from "./types";

export interface WriteMemoryInput {
  type: MemoryType;
  content: string;
  summary?: string;
  importance?: number; // 0.0 - 1.0
  confidence?: number; // 0.0 - 1.0
  source?: string;
  scope?: string; // global | conversation | project
  conversationId?: string;
  tags?: string[];
}

export interface RetrieveMemoryInput {
  query: string;
  limit?: number;
  types?: MemoryType[];
  scope?: string;
  conversationId?: string;
}

export async function writeMemory(input: WriteMemoryInput) {
  const memory = await db.memory.create({
    data: {
      type: input.type,
      content: input.content,
      summary: input.summary ?? input.content.slice(0, 200),
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? 0.8,
      source: input.source ?? "system",
      scope: input.scope ?? "global",
      conversationId: input.conversationId,
      tags: input.tags ? JSON.stringify(input.tags) : null,
    },
  });
  return memory;
}

export async function retrieveMemories(input: RetrieveMemoryInput) {
  const { query, limit = 5, types, scope, conversationId } = input;

  // Build where clause using AND + OR combination
  // FIX: Previous code overwrote where.OR for conversationId with keyword OR,
  // causing memories from other conversations to leak in.
  // Now: AND[conversationScope, keywordMatch] — both must be true.
  const andConditions: Record<string, unknown>[] = [];

  if (types && types.length > 0) {
    andConditions.push({ type: { in: types } });
  }
  if (scope) {
    andConditions.push({ scope });
  }

  // Conversation scoping: global memories OR this conversation's memories
  if (conversationId) {
    andConditions.push({
      OR: [{ conversationId: null }, { conversationId }],
    });
  } else {
    andConditions.push({ conversationId: null });
  }

  // Keyword search (case-insensitive LIKE on content + summary)
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (keywords.length > 0) {
    andConditions.push({
      OR: keywords.flatMap((kw) => [
        { content: { contains: kw } },
        { summary: { contains: kw } },
      ]),
    });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const memories = await db.memory.findMany({
    where,
    orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  // Update access count (fire-and-forget)
  await Promise.all(
    memories.map((m) =>
      db.memory.update({
        where: { id: m.id },
        data: { accessCount: { increment: 1 }, accessedAt: new Date() },
      })
    )
  ).catch(() => {});

  return memories;
}

export async function getMemoriesByType(type: MemoryType, conversationId?: string) {
  const where: Record<string, unknown> = { type };
  if (conversationId) {
    where.OR = [{ conversationId: null }, { conversationId }];
  }
  return db.memory.findMany({
    where,
    orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
}

export async function consolidateMemories(conversationId: string) {
  // Promote short_term memories with high access count + importance to long_term
  const candidates = await db.memory.findMany({
    where: {
      conversationId,
      type: "short_term",
      accessCount: { gte: 2 },
      importance: { gte: 0.6 },
    },
  });

  const updated = await Promise.all(
    candidates.map((m) =>
      db.memory.update({
        where: { id: m.id },
        data: { type: "long_term", scope: "global" },
      })
    )
  );

  return { consolidated: updated.length, memories: updated };
}

export async function getAllMemories(
  conversationId?: string,
  type?: MemoryType,
  limit = 100
) {
  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (conversationId) {
    where.OR = [{ conversationId: null }, { conversationId }];
  }
  return db.memory.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
}
