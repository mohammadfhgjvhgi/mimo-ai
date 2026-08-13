// ===================================================================
// MiMo AI — Execution Engine
// ===================================================================
// POST-RESPONSE EXECUTION: After the model generates text, this engine
// parses the response for actionable intents (file creation, code blocks)
// and ACTUALLY EXECUTES them — creating real files and artifacts.
//
// This is the difference between "AI says it created a file" and
// "AI actually created a file".
//
// MIGRATED (B3): All filesystem operations now go through
// WorkspaceService — the canonical filesystem authority.
// ===================================================================

import { db } from "@/lib/db";
import * as WorkspaceService from "./workspace";
import path from "path";

export interface CodeBlock {
  lang: string;
  code: string;
  filename?: string;
}

export interface ExecutionResult {
  filesCreated: Array<{
    filename: string;
    path: string;
    size: number;
    lang: string;
    artifactId?: string;
  }>;
  artifactsCreated: number;
  previewable: boolean;
  previewArtifactId?: string;
}

/**
 * Extract code blocks from model response.
 * Detects:
 *   1. Explicit code blocks: ```lang\ncode\n```
 *   2. Filename hints: "create file X" or "file: X" before code block
 *   3. Language detection for preview
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  // P2-3: Enhanced regex — supports optional filename after language:
  //   ```html               (no filename — original behavior)
  //   ```html:filename.html (colon separator)
  //   ```html filename.html (space separator)
  // Also supports the original "create file X" hint in preceding text.
  //
  // The regex: ``` followed by optional language, then optionally (: or space) + filename,
  // then newline, then code, then closing ```.
  // Group 1 = language (optional), Group 2 = filename (optional), Group 3 = code.
  const codeBlockRegex = /```(\w+)?(?::|\s+)?([\w\-./]+\.\w+)?\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const lang = (match[1] || "text").toLowerCase();
    const inlineFilename = match[2];
    const code = match[3];
    const blockStart = match.index;

    // Also look for filename hint in the 200 chars before the code block
    // (original P1 behavior, kept for backward compatibility)
    const before = content.slice(Math.max(0, blockStart - 200), blockStart);
    const filenameMatch = before.match(
      /(?:create|write|save|file|ملف|أنشئ|اكتب)\s*:?\s*[`"]?([\w\-./]+\.\w+)[`"]?/i
    );
    const hintFilename = filenameMatch?.[1];

    // Prefer inline filename, then hint, then undefined (will be generated)
    const filename = inlineFilename || hintFilename;

    blocks.push({
      lang,
      code,
      filename,
    });
  }

  return blocks;
}

/**
 * Generate a filename from language if not provided.
 */
function generateFilename(lang: string, index: number): string {
  const extMap: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    javascript: "js",
    js: "js",
    jsx: "jsx",
    typescript: "ts",
    ts: "ts",
    tsx: "tsx",
    json: "json",
    python: "py",
    py: "py",
    bash: "sh",
    sh: "sh",
    sql: "sql",
    markdown: "md",
    md: "md",
    yaml: "yml",
    yml: "yml",
    xml: "xml",
    svg: "svg",
    arduino: "ino",
    ino: "ino",
    c: "c",
    cpp: "cpp",
    java: "java",
    go: "go",
    rust: "rs",
    php: "php",
    ruby: "rb",
  };
  const ext = extMap[lang] || "txt";
  return `mimo-${Date.now()}-${index}.${ext}`;
}

/**
 * Determine if a file type is previewable in browser.
 */
export function isPreviewable(lang: string, filename?: string): boolean {
  const ext = filename ? path.extname(filename).slice(1).toLowerCase() : "";
  if (["html", "htm", "svg"].includes(ext)) return true;
  return ["html", "htm", "svg"].includes(lang);
}

/**
 * Determine artifact type from language.
 */
function getArtifactType(lang: string, filename?: string): string {
  const ext = filename ? path.extname(filename).slice(1).toLowerCase() : "";
  if (ext) {
    if (["html", "htm"].includes(ext)) return "code";
    if (["css"].includes(ext)) return "code";
    if (["js", "jsx", "ts", "tsx"].includes(ext)) return "code";
    if (["py"].includes(ext)) return "code";
    if (["json"].includes(ext)) return "config";
    if (["md"].includes(ext)) return "document";
    if (["sql"].includes(ext)) return "code";
    if (["svg"].includes(ext)) return "code";
  }
  if (["html", "css", "javascript", "js", "jsx", "typescript", "ts", "tsx", "python", "py", "sql", "c", "cpp", "java", "go", "rust", "php", "ruby", "arduino", "ino"].includes(lang)) {
    return "code";
  }
  if (["json", "yaml", "yml", "toml", "ini"].includes(lang)) return "config";
  if (["markdown", "md"].includes(lang)) return "document";
  if (["svg"].includes(lang)) return "code";
  return "code";
}

/**
 * MAIN EXECUTION FUNCTION
 * Called after the model generates a response.
 * Parses the response, creates real files, stores artifacts.
 */
export async function executeResponse(
  content: string,
  context: { conversationId: string; taskId?: string; agentName: string; projectId?: string }
): Promise<ExecutionResult> {
  const blocks = extractCodeBlocks(content);
  const result: ExecutionResult = {
    filesCreated: [],
    artifactsCreated: 0,
    previewable: false,
  };

  if (blocks.length === 0) {
    return result;
  }

  // MIGRATED: WorkspaceService handles directory creation via ensureWorkspaceDirs()
  await WorkspaceService.ensureWorkspaceDirs();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Skip very short blocks (likely inline examples, not real files)
    if (block.code.length < 20) continue;

    const filename = block.filename || generateFilename(block.lang, i);
    // Sanitize filename
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    try {
      // P2-1: Route through project-aware API when projectId is present.
      // When absent, fall back to the global /upload/ path (backward compat).
      let writeResult;
      let filePathForArtifact: string;
      if (context.projectId) {
        writeResult = await WorkspaceService.writeProjectFile(context.projectId, safeFilename, block.code);
        // Project-scoped path relative to SANDBOX_ROOT for Artifact.filePath
        // (passes validateArtifact's startsWith("workspace/") check)
        filePathForArtifact = writeResult.path
          ? `workspace/projects/${context.projectId}/${writeResult.path}`
          : `workspace/projects/${context.projectId}/${safeFilename}`;
      } else {
        writeResult = await WorkspaceService.write(safeFilename, block.code);
        filePathForArtifact = writeResult.path ?? `upload/${safeFilename}`;
      }

      if (!writeResult.success) {
        console.error(`[execution-engine] Failed to create ${safeFilename}:`, writeResult.error);
        continue;
      }

      const fileSize = writeResult.metadata?.size ?? block.code.length;

      // Create artifact record
      const artifactType = getArtifactType(block.lang, filename);
      const isHtml = isPreviewable(block.lang, filename);

      const artifact = await db.artifact.create({
        data: {
          conversationId: context.conversationId,
          taskId: context.taskId,
          name: safeFilename,
          type: artifactType,
          format: block.lang,
          content: block.code,
          summary: `${block.lang} file (${(fileSize / 1024).toFixed(1)}KB)`,
          filePath: filePathForArtifact,
          tags: JSON.stringify([block.lang, "auto-generated", context.projectId ? "project" : "global"]),
        },
      });

      result.filesCreated.push({
        filename: safeFilename,
        path: filePathForArtifact,
        size: fileSize,
        lang: block.lang,
        artifactId: artifact.id,
      });
      result.artifactsCreated++;

      // Track first previewable artifact
      if (isHtml && !result.previewable) {
        result.previewable = true;
        result.previewArtifactId = artifact.id;
      }
    } catch (err) {
      // Log but don't fail the whole response
      console.error(`[execution-engine] Failed to create ${safeFilename}:`, err);
    }
  }

  return result;
}

/**
 * Get artifact content for preview.
 */
export async function getArtifactForPreview(artifactId: string): Promise<{
  content: string;
  format: string;
  type: string;
  name: string;
} | null> {
  const artifact = await db.artifact.findUnique({
    where: { id: artifactId },
    select: {
      content: true,
      format: true,
      type: true,
      name: true,
    },
  });
  if (!artifact) return null;
  return artifact;
}
