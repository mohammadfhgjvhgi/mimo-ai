// ===================================================================
// MiMo AI — Tool Registry (6 real tools)
// ===================================================================

import { promises as fs } from "fs";
import path from "path";
import { invokeFunction } from "../model";
import { writeMemory, retrieveMemories } from "../memory";
import { db } from "@/lib/db";
import type { ToolDefinition } from "../types";

const SANDBOX_ROOT = "/home/z/my-project";
const UPLOAD_DIR = path.join(SANDBOX_ROOT, "upload");

async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function safeJoin(base: string, target: string): string {
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal blocked: ${target}`);
  }
  return resolved;
}

export const TOOLS: Record<string, ToolDefinition> = {
  web_search: {
    name: "web_search",
    description:
      "Search the web for current information. Returns a list of results with url, name, snippet, host_name, date.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        num: { type: "number", description: "Number of results (default 10)" },
      },
      required: ["query"],
    },
    riskLevel: "low",
    timeoutMs: 30000,
    execute: async (input) => {
      const query = String(input.query ?? "");
      const num = Number(input.num ?? 10);
      if (!query) throw new Error("query is required");
      const results = await invokeFunction<
        Array<{
          url: string;
          name: string;
          snippet: string;
          host_name: string;
          rank: number;
          date: string;
        }>
      >("web_search", { query, num });
      return { query, results: results ?? [], count: results?.length ?? 0 };
    },
  },

  web_reader: {
    name: "web_reader",
    description:
      "Read the content of a web page. Returns title, content (cleaned), and publish time.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to read" },
      },
      required: ["url"],
    },
    riskLevel: "low",
    timeoutMs: 30000,
    execute: async (input) => {
      const url = String(input.url ?? "");
      if (!url) throw new Error("url is required");
      const result = await invokeFunction<{
        title?: string;
        content?: string;
        html?: string;
        publishTime?: string;
      }>("web_reader", { url });
      return result;
    },
  },

  file_read: {
    name: "file_read",
    description:
      "Read a file from the project sandbox (/home/z/my-project/). Max 50KB. Cannot escape sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from project root" },
      },
      required: ["path"],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      const relPath = String(input.path ?? "");
      if (!relPath) throw new Error("path is required");
      const fullPath = safeJoin(SANDBOX_ROOT, relPath);
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) throw new Error("Not a file");
      if (stat.size > 50 * 1024) throw new Error("File too large (max 50KB)");
      const content = await fs.readFile(fullPath, "utf8");
      return {
        path: relPath,
        size: stat.size,
        content,
      };
    },
  },

  file_write: {
    name: "file_write",
    description:
      "Write a file to the project upload directory (/home/z/my-project/upload/). Cannot escape sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename (no path traversal)" },
        content: { type: "string", description: "File content" },
      },
      required: ["filename", "content"],
    },
    riskLevel: "medium",
    timeoutMs: 5000,
    execute: async (input) => {
      await ensureUploadDir();
      const filename = String(input.filename ?? "");
      const content = String(input.content ?? "");
      if (!filename) throw new Error("filename is required");
      if (filename.includes("..") || filename.includes("/")) {
        throw new Error("Invalid filename — no path separators allowed");
      }
      const fullPath = path.join(UPLOAD_DIR, filename);
      await fs.writeFile(fullPath, content, "utf8");
      const stat = await fs.stat(fullPath);
      return {
        path: fullPath.replace(SANDBOX_ROOT + "/", ""),
        absolutePath: fullPath,
        size: stat.size,
      };
    },
  },

  memory_store: {
    name: "memory_store",
    description:
      "Write a memory to the system. 9 types: working, short_term, long_term, episodic, semantic, procedural, preference, failure, skill.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        content: { type: "string" },
        importance: { type: "number", description: "0.0 - 1.0" },
        conversationId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["type", "content"],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      const memory = await writeMemory({
        type: String(input.type) as never,
        content: String(input.content),
        importance: Number(input.importance ?? 0.5),
        conversationId: input.conversationId ? String(input.conversationId) : undefined,
        tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
        source: "agent",
        scope: input.conversationId ? "conversation" : "global",
      });
      return { id: memory.id, type: memory.type, stored: true };
    },
  },

  knowledge_search: {
    name: "knowledge_search",
    description:
      "Search the knowledge base (document intelligence) and memories. Use this to answer 'what do we know about X?'.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number", description: "default 5" },
      },
      required: ["query"],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      const query = String(input.query ?? "");
      const limit = Number(input.limit ?? 5);
      if (!query) throw new Error("query is required");

      // Search KnowledgeEntry table
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5);

      const where = keywords.length
        ? {
            OR: keywords.flatMap((kw) => [
              { title: { contains: kw } },
              { content: { contains: kw } },
              { summary: { contains: kw } },
            ]),
          }
        : {};

      const [entries, memories] = await Promise.all([
        db.knowledgeEntry.findMany({ where, take: limit, orderBy: { accessedAt: "desc" } }),
        retrieveMemories({ query, limit }),
      ]);

      return {
        knowledgeEntries: entries.map((e) => ({
          id: e.id,
          title: e.title,
          summary: e.summary,
          source: e.source,
          category: e.category,
        })),
        memories: memories.map((m) => ({
          id: m.id,
          type: m.type,
          content: m.content,
          importance: m.importance,
        })),
      };
    },
  },
};

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS[name];
}

export function listTools(): ToolDefinition[] {
  return Object.values(TOOLS);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ name: string; input: Record<string, unknown>; output: unknown; error?: string }> {
  const tool = TOOLS[name];
  if (!tool) {
    return { name, input, output: null, error: `Tool ${name} not found` };
  }
  try {
    const output = await Promise.race([
      tool.execute(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tool timeout")), tool.timeoutMs)
      ),
    ]);
    return { name, input, output, error: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, input, output: null, error: msg };
  }
}
