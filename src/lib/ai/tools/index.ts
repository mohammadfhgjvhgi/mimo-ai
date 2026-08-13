// ===================================================================
// MiMo AI — Tool Registry (18 tools)
// ===================================================================

import { invokeFunction } from "../model";
import { writeMemory, retrieveMemories } from "../memory";
import { db } from "@/lib/db";
import * as WorkspaceService from "../workspace";
import type { ToolDefinition } from "../types";

// REMOVED (P2-0): dead `SANDBOX_ROOT`, `UPLOAD_DIR`, `ensureUploadDir()` —
//   WorkspaceService owns these constants and ensures directories exist.
// REMOVED: safeJoin() — migrated to WorkspaceService.validatePath()
// REMOVED: blockedPatterns — migrated to WorkspaceService

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
      // SDK function name is "page_reader", not "web_reader"
      // The tool is exposed to the model as "web_reader" for clarity,
      // but the SDK invocation uses the correct function name.
      const result = await invokeFunction<{
        code?: number;
        data?: {
          title?: string;
          html?: string;
          publishedTime?: string;
        };
      }>("page_reader", { url });
      // Normalize the response: SDK returns { code, data: { title, html, publishedTime } }
      // Flatten to { title, content, html, publishTime } for consistency
      const data = result?.data ?? {};
      return {
        title: data.title ?? "",
        content: data.html ?? "",
        html: data.html ?? "",
        publishTime: data.publishedTime ?? undefined,
      };
    },
  },

  file_read: {
    name: "file_read",
    description:
      "Read a file from the project sandbox (/home/z/my-project/). Max 50KB. Cannot escape sandbox. Sensitive files (.env, .db, .git/) are blocked.",
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

      // P2-1: Route to project-aware API when _systemProjectId is present
      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      const result = projectId
        ? await WorkspaceService.readProjectFile(projectId, relPath)
        : await WorkspaceService.read(relPath);
      if (!result.success) {
        throw new Error(result.error ?? "Read failed");
      }
      // Preserve original output contract: { path, size, content }
      return {
        path: result.path ?? relPath,
        size: result.metadata?.size ?? 0,
        content: result.data as string,
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
      const filename = String(input.filename ?? "");
      const content = String(input.content ?? "");
      if (!filename) throw new Error("filename is required");
      if (filename.includes("..") || filename.includes("/")) {
        throw new Error("Invalid filename — no path separators allowed");
      }

      // P2-1: Route to project-aware API when _systemProjectId is present
      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      const result = projectId
        ? await WorkspaceService.writeProjectFile(projectId, filename, content)
        : await WorkspaceService.write(filename, content);
      if (!result.success) {
        throw new Error(result.error ?? "Write failed");
      }
      // Preserve original output contract: { path, absolutePath, size }
      return {
        path: result.path ?? `upload/${filename}`,
        absolutePath: result.absolutePath ?? "",
        size: result.metadata?.size ?? 0,
      };
    },
  },

  memory_store: {
    name: "memory_store",
    description:
      "Write a memory to the system. 9 types: working, short_term, long_term, episodic, semantic, procedural, preference, failure, skill. The system automatically scopes memories to the current conversation — you cannot create global memories.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        content: { type: "string" },
        importance: { type: "number", description: "0.0 - 1.0" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["type", "content"],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      // SECURITY: Memory scope is system-controlled, NOT model-controlled.
      // The model CANNOT create global memories by omitting conversationId.
      // The execution context (tool-caller.ts) injects _systemConversationId
      // which overrides any model-provided conversationId.

      const systemConversationId = input._systemConversationId
        ? String(input._systemConversationId)
        : null;

      // If no system conversation context, reject — don't default to global
      if (!systemConversationId) {
        return {
          error: "Cannot store memory: no active conversation context. Memory storage requires an active conversation.",
          stored: false,
        };
      }

      const memory = await writeMemory({
        type: String(input.type) as never,
        content: String(input.content),
        importance: Number(input.importance ?? 0.5),
        conversationId: systemConversationId,
        tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
        source: "agent",
        scope: "conversation", // ALWAYS conversation-scoped from tools
      });
      return { id: memory.id, type: memory.type, stored: true, scope: "conversation" };
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

  file_search: {
    name: "file_search",
    description:
      "Search for files in the project sandbox by name pattern. Returns list of matching file paths. Sensitive files are excluded.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern or substring to match file names" },
        maxResults: { type: "number", description: "Max results (default 20)" },
      },
      required: ["pattern"],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      const pattern = String(input.pattern ?? "");
      const maxResults = Number(input.maxResults ?? 20);
      if (!pattern) throw new Error("pattern is required");

      // P2-1: Route to project-aware API when _systemProjectId is present
      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      const result = projectId
        ? await WorkspaceService.searchProject(projectId, pattern, maxResults)
        : await WorkspaceService.search(pattern, maxResults);
      if (!result.success) {
        throw new Error(result.error ?? "Search failed");
      }
      // Preserve original output contract: { pattern, results, count }
      return result.data as { pattern: string; results: Array<{ path: string; size: number }>; count: number };
    },
  },

  code_search: {
    name: "code_search",
    description:
      "Search for text/code patterns inside project files. Returns file paths + matching lines. Searches .ts, .tsx, .js, .jsx, .py, .json, .md, .prisma, .sql files. Sensitive files are excluded.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text or code pattern to search for" },
        maxResults: { type: "number", description: "Max matches (default 30)" },
      },
      required: ["query"],
    },
    riskLevel: "low",
    timeoutMs: 10000,
    execute: async (input) => {
      const query = String(input.query ?? "");
      const maxResults = Number(input.maxResults ?? 30);
      if (!query) throw new Error("query is required");

      // P2-1: Route to project-aware API when _systemProjectId is present
      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      const result = projectId
        ? await WorkspaceService.searchProjectCode(projectId, query, maxResults)
        : await WorkspaceService.searchCode(query, maxResults);
      if (!result.success) {
        throw new Error(result.error ?? "Code search failed");
      }
      // Preserve original output contract: { query, results, count }
      return result.data as { query: string; results: Array<{ file: string; line: number; content: string }>; count: number };
    },
  },

  patch: {
    name: "patch",
    description:
      "Apply a text patch to a file in the project upload directory. Creates the file if it doesn't exist.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename in /upload/ directory" },
        find: { type: "string", description: "Text to find (exact match)" },
        replace: { type: "string", description: "Text to replace with" },
      },
      required: ["filename", "find", "replace"],
    },
    riskLevel: "medium",
    timeoutMs: 5000,
    execute: async (input) => {
      const filename = String(input.filename ?? "");
      const find = String(input.find ?? "");
      const replace = String(input.replace ?? "");
      if (!filename || !find) throw new Error("filename and find are required");
      if (filename.includes("..") || filename.includes("/")) {
        throw new Error("Invalid filename");
      }

      // P2-1: Route to project-aware API when _systemProjectId is present
      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      const result = projectId
        ? await WorkspaceService.patchProjectFile(projectId, filename, find, replace)
        : await WorkspaceService.patch(filename, find, replace);
      if (!result.success) {
        throw new Error(result.error ?? "Patch failed");
      }
      // Preserve original output contract: { path, size, patched }
      const data = result.data as { patched: boolean } | undefined;
      return {
        path: result.path ?? `upload/${filename}`,
        size: result.metadata?.size ?? 0,
        patched: data?.patched ?? false,
      };
    },
  },

  diff: {
    name: "diff",
    description:
      "Compare two text strings and return a simple line-by-line diff.",
    inputSchema: {
      type: "object",
      properties: {
        old: { type: "string", description: "Original text" },
        new: { type: "string", description: "New text" },
      },
      required: ["old", "new"],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      const oldText = String(input.old ?? "");
      const newText = String(input.new ?? "");

      const oldLines = oldText.split("\n");
      const newLines = newText.split("\n");
      const maxLen = Math.max(oldLines.length, newLines.length);
      const diff: Array<{ type: "same" | "added" | "removed"; line: string }> = [];

      for (let i = 0; i < maxLen; i++) {
        const oldLine = oldLines[i];
        const newLine = newLines[i];
        if (oldLine === newLine) {
          diff.push({ type: "same", line: oldLine ?? "" });
        } else {
          if (oldLine !== undefined) {
            diff.push({ type: "removed", line: oldLine });
          }
          if (newLine !== undefined) {
            diff.push({ type: "added", line: newLine });
          }
        }
      }

      const added = diff.filter((d) => d.type === "added").length;
      const removed = diff.filter((d) => d.type === "removed").length;

      return {
        added,
        removed,
        totalLines: maxLen,
        diff: diff.slice(0, 100), // limit output
      };
    },
  },

  // ─── P1-4: Missing File Tools ──────────────────────────────────────

  file_edit: {
    name: "file_edit",
    description:
      "Edit specific lines in a file by replacing the content at given line numbers. The file must exist.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file (relative to project root or upload/)" },
        edits: {
          type: "array",
          description: "Array of line edits",
          items: {
            type: "object",
            properties: {
              lineNumber: { type: "number", description: "1-based line number to replace" },
              newContent: { type: "string", description: "New content for this line" },
            },
            required: ["lineNumber", "newContent"],
          },
        },
      },
      required: ["path", "edits"],
    },
    riskLevel: "medium",
    timeoutMs: 5000,
    execute: async (input) => {
      const relPath = String(input.path ?? "");
      const edits = Array.isArray(input.edits) ? input.edits : [];
      if (!relPath) throw new Error("path is required");
      if (edits.length === 0) throw new Error("edits array is required");

      // Read the file first
      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      const readResult = projectId
        ? await WorkspaceService.readProjectFile(projectId, relPath)
        : await WorkspaceService.read(relPath);
      if (!readResult.success) {
        throw new Error(readResult.error ?? "Read failed");
      }

      const lines = (readResult.data as string).split("\n");
      for (const edit of edits) {
        const lineNum = Number(edit.lineNumber);
        const newContent = String(edit.newContent ?? "");
        if (lineNum < 1 || lineNum > lines.length) {
          throw new Error(`Line number ${lineNum} out of range (1-${lines.length})`);
        }
        lines[lineNum - 1] = newContent;
      }
      const newContent = lines.join("\n");

      // Write back
      const writeResult = projectId
        ? await WorkspaceService.writeProjectFile(projectId, relPath, newContent)
        : await WorkspaceService.write(relPath, newContent);
      if (!writeResult.success) {
        throw new Error(writeResult.error ?? "Write failed");
      }
      return {
        path: writeResult.path ?? relPath,
        editsApplied: edits.length,
        size: writeResult.metadata?.size ?? 0,
      };
    },
  },

  file_delete: {
    name: "file_delete",
    description:
      "Delete a file from the project sandbox. Cannot delete directories. Cannot escape sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to delete" },
      },
      required: ["path"],
    },
    riskLevel: "high",
    timeoutMs: 5000,
    execute: async (input) => {
      const relPath = String(input.path ?? "");
      if (!relPath) throw new Error("path is required");

      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      const result = projectId
        ? await WorkspaceService.deleteProjectFile(projectId, relPath)
        : await WorkspaceService.deleteFile(relPath);
      if (!result.success) {
        throw new Error(result.error ?? "Delete failed");
      }
      return {
        path: result.path ?? relPath,
        deleted: true,
      };
    },
  },

  file_rename: {
    name: "file_rename",
    description:
      "Rename or move a file within the project sandbox. Cannot escape sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        oldPath: { type: "string", description: "Current path of the file" },
        newPath: { type: "string", description: "New path for the file" },
      },
      required: ["oldPath", "newPath"],
    },
    riskLevel: "medium",
    timeoutMs: 5000,
    execute: async (input) => {
      const oldPath = String(input.oldPath ?? "");
      const newPath = String(input.newPath ?? "");
      if (!oldPath || !newPath) throw new Error("oldPath and newPath are required");

      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      const result = projectId
        ? await WorkspaceService.renameProjectFile(projectId, oldPath, newPath)
        : await WorkspaceService.renameFile(oldPath, newPath);
      if (!result.success) {
        throw new Error(result.error ?? "Rename failed");
      }
      return {
        oldPath,
        newPath: result.path ?? newPath,
        size: result.metadata?.size ?? 0,
      };
    },
  },

  dir_create: {
    name: "dir_create",
    description:
      "Create a directory in the project sandbox. Creates parent directories if needed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the directory to create" },
      },
      required: ["path"],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      const dirPath = String(input.path ?? "");
      if (!dirPath) throw new Error("path is required");

      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
      // For project-scoped, use validateProjectPath + fs.mkdir
      if (projectId) {
        const { validateProjectPath } = await import("../workspace");
        const validation = await validateProjectPath(projectId, dirPath, "write", false);
        if (!validation.valid) {
          throw new Error(validation.error ?? "Invalid path");
        }
        const fs = await import("fs/promises");
        await fs.mkdir(validation.absolutePath!, { recursive: true });
        return { path: validation.relativePath ?? dirPath, created: true };
      }
      // Global path
      const result = await WorkspaceService.mkdir(dirPath);
      if (!result.success) {
        throw new Error(result.error ?? "Mkdir failed");
      }
      return {
        path: result.path ?? dirPath,
        created: true,
      };
    },
  },

  dir_list: {
    name: "dir_list",
    description:
      "List the contents of a directory in the project sandbox. Returns files and subdirectories.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the directory to list (default: root)" },
      },
      required: [],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      const dirPath = String(input.path ?? ".");
      const projectId = input._systemProjectId ? String(input._systemProjectId) : null;

      // For project-scoped, use listProjectTree
      if (projectId) {
        const result = await WorkspaceService.listProjectTree(projectId, 5);
        if (!result.success) {
          throw new Error(result.error ?? "List failed");
        }
        const data = result.data as { tree: Array<{ path: string; size: number; type: string }> };
        return {
          path: dirPath,
          entries: data.tree,
          count: data.tree.length,
        };
      }
      // Global path
      const result = await WorkspaceService.list(dirPath);
      if (!result.success) {
        throw new Error(result.error ?? "List failed");
      }
      return {
        path: result.path ?? dirPath,
        entries: result.data,
        count: (result.data as Array<unknown>)?.length ?? 0,
      };
    },
  },

  // ─── Browser Automation (from research R5: browser-use) ───────────

  browser_navigate: {
    name: "browser_navigate",
    description:
      "Navigate to a URL in the browser and return the page content. Use for web research that requires JavaScript rendering.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
    riskLevel: "low",
    timeoutMs: 30000,
    execute: async (input) => {
      const url = String(input.url ?? "");
      if (!url) throw new Error("url is required");
      if (!url.startsWith("http")) throw new Error("URL must start with http:// or https://");

      // Use web_reader (page_reader) as the browser backend
      const result = await invokeFunction<{
        code?: number;
        data?: { title?: string; html?: string; publishedTime?: string };
      }>("page_reader", { url });

      const data = result?.data ?? {};
      // Strip HTML tags for readable text
      const textContent = (data.html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return {
        url,
        title: data.title ?? "",
        content: textContent.slice(0, 8000),
        publishTime: data.publishedTime ?? undefined,
      };
    },
  },

  // ─── Tool Chaining: execute multiple tools in sequence ────────────

  tool_chain: {
    name: "tool_chain",
    description:
      "Execute multiple tools in sequence, passing the result of each to the next. Useful for complex workflows like search→read→summarize.",
    inputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "Array of tool calls to execute in sequence",
          items: {
            type: "object",
            properties: {
              tool: { type: "string", description: "Tool name to execute" },
              input: { type: "object", description: "Input for the tool" },
            },
            required: ["tool", "input"],
          },
        },
      },
      required: ["steps"],
    },
    riskLevel: "medium",
    timeoutMs: 60000,
    execute: async (input) => {
      const steps = Array.isArray(input.steps) ? input.steps : [];
      if (steps.length === 0) throw new Error("steps array is required");
      if (steps.length > 5) throw new Error("Maximum 5 steps in a chain");

      const results: Array<{ tool: string; output: unknown }> = [];
      let previousOutput: unknown = null;

      for (const step of steps) {
        const toolName = String(step.tool ?? "");
        const toolInput = { ...(step.input ?? {}) } as Record<string, unknown>;

        // If previous output exists, inject it as _previousResult
        if (previousOutput !== null) {
          toolInput._previousResult = previousOutput;
        }

        // Execute the tool
        const result = await executeTool(toolName, toolInput);
        if (result.error) {
          return {
            steps: results,
            error: `Step "${toolName}" failed: ${result.error}`,
            completed: false,
          };
        }

        results.push({ tool: toolName, output: result.output });
        previousOutput = result.output;
      }

      return {
        steps: results,
        finalResult: previousOutput,
        completed: true,
      };
    },
  },

  // ─── Dry Run: preview what a tool would do without executing ──────

  dry_run: {
    name: "dry_run",
    description:
      "Preview what a tool would do without actually executing it. Returns the tool name, input, and estimated risk level.",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: "Tool name to preview" },
        input: { type: "object", description: "Input that would be passed to the tool" },
      },
      required: ["tool", "input"],
    },
    riskLevel: "low",
    timeoutMs: 5000,
    execute: async (input) => {
      const toolName = String(input.tool ?? "");
      const toolInput = input.input ?? {};
      const tool = TOOLS[toolName];

      if (!tool) {
        return { tool: toolName, found: false, error: `Tool "${toolName}" not found` };
      }

      return {
        tool: toolName,
        found: true,
        description: tool.description,
        riskLevel: tool.riskLevel,
        inputPreview: JSON.stringify(toolInput).slice(0, 500),
        wouldExecute: true,
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
