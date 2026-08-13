// ===================================================================
// MiMo AI — WorkspaceService
// ===================================================================
// CANONICAL filesystem authority for all file operations.
// P1-B SUB-GATE B1: Skeleton + contracts only.
// No tools migrated yet — this is the compatibility bridge foundation.
//
// Architecture:
//   Agent → Tool → WorkspaceService → PathValidator → Filesystem
//
// WorkspaceService is the SINGLE source of truth for:
//   - Path validation (normalization, traversal, symlink, blocked patterns)
//   - Filesystem operations (read, write, search, patch, list, stat, mkdir)
//   - Security boundary enforcement
//   - Structured operation results
//   - Audit logging (via console + future ExecutionLog)
// ===================================================================

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";

// ─── Centralized Path Constants ─────────────────────────────────────

export const WORKSPACE_ROOT = "/home/z/my-project/workspace";
export const SANDBOX_ROOT = "/home/z/my-project";
export const UPLOAD_DIR = path.join(SANDBOX_ROOT, "upload");
export const GENERATED_DIR = path.join(WORKSPACE_ROOT, "generated");

// P2-1: Per-project workspace root. Each project gets an isolated directory at
//   /home/z/my-project/workspace/projects/{projectId}/
// PROJECTS_ROOT is intentionally NOT added to READ_ROOTS / WRITE_ROOTS.
// Project-scoped operations use validateProjectPath() which has its own boundary
// check against the SPECIFIC project root (PROJECTS_ROOT/{projectId}), not
// against PROJECTS_ROOT as a whole. This is what enforces project isolation.
export const PROJECTS_ROOT = path.join(WORKSPACE_ROOT, "projects");

// Roots that allow READ access — paths are resolved relative to SANDBOX_ROOT
// then checked against these roots
const READ_ROOTS = [
  WORKSPACE_ROOT,
  UPLOAD_DIR,
  path.join(SANDBOX_ROOT, "src"),
  path.join(SANDBOX_ROOT, "prisma"),
  path.join(SANDBOX_ROOT, "public"),
];

// Roots that allow WRITE access (more restrictive)
const WRITE_ROOTS = [
  UPLOAD_DIR, // Legacy compatibility — new writes still go here in B1
  GENERATED_DIR, // Future: new generated files (not used in B1)
];

// ─── Blocked Patterns ───────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /\.env/i,
  /\.db$/i,
  /\.sqlite$/i,
  /\.sqlite3$/i,
  /\.git\//i,
  /^\.git\//i,
  /\.git$/i,
  /node_modules\//i,
  /^node_modules\//i,
  /\.next\//i,
  /^\.next\//i,
  /\.next$/i,
];

function isBlocked(normalizedPath: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

// ─── Structured Result Model ────────────────────────────────────────

export interface WorkspaceResult {
  success: boolean;
  operation: string;
  path?: string; // Relative to SANDBOX_ROOT
  absolutePath?: string; // Internal (not exposed to model)
  data?: unknown;
  metadata?: {
    size?: number;
    modified?: Date;
    type?: "file" | "directory";
  };
  error?: string; // User-friendly error
  diagnostics?: {
    code: string;
    detail: string;
  };
}

function success(
  operation: string,
  opts: Partial<WorkspaceResult>
): WorkspaceResult {
  return {
    success: true,
    operation,
    ...opts,
  };
}

function failure(
  operation: string,
  error: string,
  code: string,
  detail?: string
): WorkspaceResult {
  return {
    success: false,
    operation,
    error,
    diagnostics: { code, detail: detail ?? error },
  };
}

// ─── Path Validation ────────────────────────────────────────────────

/**
 * Validate a path against security rules.
 * 
 * Layers:
 * 1. Input validation (empty, null bytes, absolute paths)
 * 2. Path normalization (path.normalize)
 * 3. Path resolution (path.resolve against allowed roots)
 * 4. Symlink resolution (fs.realpath for existing paths)
 * 5. Boundary check (resolved path must be within allowed root)
 * 6. Blocked patterns (.env, .db, .git/, etc.)
 *
 * @param requestedPath - Relative path from user/tool
 * @param mode - "read" or "write"
 * @param mustExist - Whether the path must already exist (true for read, false for write)
 */
export async function validatePath(
  requestedPath: string,
  mode: "read" | "write",
  mustExist: boolean
): Promise<{ valid: boolean; absolutePath?: string; relativePath?: string; error?: string; code?: string }> {
  // Layer 1: Input validation
  if (!requestedPath || typeof requestedPath !== "string") {
    return { valid: false, error: "Path is required", code: "EMPTY_PATH" };
  }
  if (requestedPath.includes("\0")) {
    return { valid: false, error: "Path contains null bytes", code: "NULL_BYTE" };
  }
  if (path.isAbsolute(requestedPath)) {
    return { valid: false, error: "Absolute paths are not allowed", code: "ABSOLUTE_PATH" };
  }

  // Layer 2: Normalize
  const normalized = path.normalize(requestedPath);

  // Layer 6: Blocked patterns (check early — before touching filesystem)
  if (isBlocked(normalized)) {
    return { valid: false, error: `Access denied: path "${normalized}" matches blocked pattern`, code: "BLOCKED_PATTERN" };
  }

  // Layer 3: Resolve against SANDBOX_ROOT (not against each root individually)
  // This way "upload/file.txt" resolves to "/home/z/my-project/upload/file.txt"
  // which is then checked against READ_ROOTS / WRITE_ROOTS
  const allowedRoots = mode === "write" ? WRITE_ROOTS : READ_ROOTS;
  const resolved = path.resolve(SANDBOX_ROOT, normalized);

  // Layer 4: Symlink resolution (only for existing paths)
  let realPath: string;
  try {
    realPath = await fs.realpath(resolved);
  } catch {
    // Path doesn't exist
    if (mustExist) {
      return { valid: false, error: `File not found: ${normalized}`, code: "NOT_FOUND" };
    }
    // For write operations (path doesn't exist yet), verify parent directory
    const parentDir = path.dirname(resolved);
    try {
      const realParent = await fs.realpath(parentDir);
      const parentInRoot = allowedRoots.some(
        (r) => realParent === r || realParent.startsWith(r + path.sep)
      );
      if (parentInRoot) {
        // Layer 5: Boundary check (parent is within an allowed root)
        if (isBlocked(normalized)) {
          return { valid: false, error: `Access denied: path "${normalized}" matches blocked pattern`, code: "BLOCKED_PATTERN" };
        }
        return { valid: true, absolutePath: resolved, relativePath: resolved.replace(SANDBOX_ROOT + "/", "") };
      }
    } catch {
      // Parent doesn't exist
    }
    return {
      valid: false,
      error: `Path not within any allowed write root: ${normalized}`,
      code: "OUTSIDE_WRITE_ROOTS",
    };
  }

  // Layer 5: Boundary check — realpath must be within an allowed root
  const isWithinRoot = allowedRoots.some(
    (r) => realPath === r || realPath.startsWith(r + path.sep)
  );

  if (!isWithinRoot) {
    // Symlink escaped boundary
    return {
      valid: false,
      error: `Path escapes workspace boundary: "${normalized}" resolves to "${realPath}"`,
      code: "BOUNDARY_ESCAPE",
    };
  }

  return { valid: true, absolutePath: realPath, relativePath: realPath.replace(SANDBOX_ROOT + "/", "") };
}

// ─── File Operations ────────────────────────────────────────────────

/**
 * Read a file from the workspace.
 */
export async function read(filePath: string): Promise<WorkspaceResult> {
  const validation = await validatePath(filePath, "read", true);
  if (!validation.valid) {
    return failure("read", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    const stat = await fs.stat(validation.absolutePath!);
    if (!stat.isFile()) {
      return failure("read", "Path is not a file", "NOT_A_FILE", validation.relativePath);
    }
    if (stat.size > 50 * 1024) {
      return failure("read", "File too large (max 50KB)", "TOO_LARGE", `${validation.relativePath} (${stat.size} bytes)`);
    }
    const content = await fs.readFile(validation.absolutePath!, "utf8");
    return success("read", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      data: content,
      metadata: { size: stat.size, modified: stat.mtime, type: "file" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("read", `Failed to read file: ${msg}`, "READ_ERROR", validation.relativePath);
  }
}

/**
 * Write a file to the workspace.
 */
export async function write(
  filePath: string,
  content: string
): Promise<WorkspaceResult> {
  // For write: if it's a simple filename (no path separators), resolve to upload/{filename}
  // This maintains backward compatibility with file_write tool
  let resolvedPath = filePath;
  if (!filePath.includes("/") && !filePath.includes("..")) {
    resolvedPath = "upload/" + filePath;
  }

  if (filePath.includes("..")) {
    return failure("write", "Invalid filename — no path traversal allowed", "INVALID_FILENAME", filePath);
  }

  const validation = await validatePath(resolvedPath, "write", false);
  if (!validation.valid) {
    return failure("write", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(validation.absolutePath!);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(validation.absolutePath!, content, "utf8");
    const stat = await fs.stat(validation.absolutePath!);

    return success("write", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      metadata: { size: stat.size, modified: stat.mtime, type: "file" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("write", `Failed to write file: ${msg}`, "WRITE_ERROR", validation.relativePath);
  }
}

/**
 * Search for files by name pattern.
 */
export async function search(
  pattern: string,
  maxResults: number = 20
): Promise<WorkspaceResult> {
  if (!pattern) {
    return failure("search", "Pattern is required", "EMPTY_PATTERN");
  }

  const lowerPattern = pattern.toLowerCase();
  const results: Array<{ path: string; size: number }> = [];
  const searchRoots = [UPLOAD_DIR, path.join(SANDBOX_ROOT, "src"), path.join(SANDBOX_ROOT, "prisma")];

  for (const root of searchRoots) {
    if (results.length >= maxResults) break;

    try {
      await walkDir(root, root, lowerPattern, results, maxResults, 5);
    } catch {
      // Skip roots that don't exist or can't be read
    }
  }

  return success("search", {
    data: { pattern, results, count: results.length },
  });
}

/**
 * Search for text/code patterns inside files.
 */
export async function searchCode(
  query: string,
  maxResults: number = 30
): Promise<WorkspaceResult> {
  if (!query) {
    return failure("searchCode", "Query is required", "EMPTY_QUERY");
  }

  const lowerQuery = query.toLowerCase();
  const results: Array<{ file: string; line: number; content: string }> = [];
  const validExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".json", ".md", ".prisma", ".sql", ".css"];
  const searchRoots = [UPLOAD_DIR, path.join(SANDBOX_ROOT, "src")];

  for (const root of searchRoots) {
    if (results.length >= maxResults) break;

    try {
      await walkDirForCode(root, root, lowerQuery, validExts, results, maxResults, 5);
    } catch {
      // Skip roots that don't exist or can't be read
    }
  }

  return success("searchCode", {
    data: { query, results, count: results.length },
  });
}

/**
 * Patch a file (find and replace).
 */
export async function patch(
  filePath: string,
  find: string,
  replace: string
): Promise<WorkspaceResult> {
  if (!filePath || !find) {
    return failure("patch", "Filename and find string are required", "MISSING_ARGS");
  }

  // Resolve simple filenames to upload/ (backward compatibility)
  let resolvedPath = filePath;
  if (!filePath.includes("/") && !filePath.includes("..")) {
    resolvedPath = "upload/" + filePath;
  }

  if (filePath.includes("..")) {
    return failure("patch", "Invalid filename — no path traversal allowed", "INVALID_FILENAME", filePath);
  }

  const validation = await validatePath(resolvedPath, "write", false);
  if (!validation.valid) {
    return failure("patch", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    let content = "";
    try {
      content = await fs.readFile(validation.absolutePath!, "utf8");
    } catch {
      // File doesn't exist — will create with replace content
    }

    const newContent = content.includes(find)
      ? content.replace(find, replace)
      : content + (content ? "\n" : "") + replace;

    await fs.writeFile(validation.absolutePath!, newContent, "utf8");
    const stat = await fs.stat(validation.absolutePath!);

    return success("patch", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      metadata: { size: stat.size, modified: stat.mtime, type: "file" },
      data: { patched: content.includes(find) },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("patch", `Failed to patch file: ${msg}`, "PATCH_ERROR", validation.relativePath);
  }
}

/**
 * List directory contents.
 */
export async function list(
  dirPath: string
): Promise<WorkspaceResult> {
  const validation = await validatePath(dirPath, "read", true);
  if (!validation.valid) {
    return failure("list", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    const stat = await fs.stat(validation.absolutePath!);
    if (!stat.isDirectory()) {
      return failure("list", "Path is not a directory", "NOT_A_DIRECTORY", validation.relativePath);
    }

    const entries = await fs.readdir(validation.absolutePath!, { withFileTypes: true });
    const items = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }));

    return success("list", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      data: items,
      metadata: { type: "directory" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("list", `Failed to list directory: ${msg}`, "LIST_ERROR", validation.relativePath);
  }
}

/**
 * Get file/directory stat.
 */
export async function stat(
  filePath: string
): Promise<WorkspaceResult> {
  const validation = await validatePath(filePath, "read", true);
  if (!validation.valid) {
    return failure("stat", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    const s = await fs.stat(validation.absolutePath!);
    return success("stat", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      metadata: {
        size: s.size,
        modified: s.mtime,
        type: s.isDirectory() ? "directory" : "file",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("stat", `Failed to stat: ${msg}`, "STAT_ERROR", validation.relativePath);
  }
}

/**
 * Create a directory.
 */
export async function mkdir(
  dirPath: string
): Promise<WorkspaceResult> {
  // Resolve simple dirnames to upload/ (backward compatibility)
  let resolvedPath = dirPath;
  if (!dirPath.includes("/") && !dirPath.includes("..")) {
    resolvedPath = "upload/" + dirPath;
  }

  const validation = await validatePath(resolvedPath, "write", false);
  if (!validation.valid) {
    return failure("mkdir", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    await fs.mkdir(validation.absolutePath!, { recursive: true });
    return success("mkdir", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      metadata: { type: "directory" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("mkdir", `Failed to create directory: ${msg}`, "MKDIR_ERROR", validation.relativePath);
  }
}

/**
 * Delete a file (global /upload/ path).
 */
export async function deleteFile(filePath: string): Promise<WorkspaceResult> {
  let resolvedPath = filePath;
  if (!filePath.includes("/") && !filePath.includes("..")) {
    resolvedPath = "upload/" + filePath;
  }
  if (filePath.includes("..")) {
    return failure("deleteFile", "Invalid filename — no path traversal allowed", "INVALID_FILENAME", filePath);
  }

  const validation = await validatePath(resolvedPath, "write", true);
  if (!validation.valid) {
    return failure("deleteFile", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    const stat = await fs.stat(validation.absolutePath!);
    if (stat.isDirectory()) {
      return failure("deleteFile", "Path is a directory, not a file", "NOT_A_FILE", validation.relativePath);
    }
    await fs.unlink(validation.absolutePath!);
    return success("deleteFile", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("deleteFile", `Failed to delete file: ${msg}`, "DELETE_ERROR", validation.relativePath);
  }
}

/**
 * Rename/move a file (global /upload/ path).
 */
export async function renameFile(oldPath: string, newPath: string): Promise<WorkspaceResult> {
  if (!oldPath || !newPath) {
    return failure("renameFile", "Both oldPath and newPath are required", "MISSING_ARGS");
  }
  if (oldPath.includes("..") || newPath.includes("..")) {
    return failure("renameFile", "Invalid path — no traversal allowed", "INVALID_PATH");
  }

  let resolvedOld = oldPath;
  if (!oldPath.includes("/")) resolvedOld = "upload/" + oldPath;
  let resolvedNew = newPath;
  if (!newPath.includes("/")) resolvedNew = "upload/" + newPath;

  const valOld = await validatePath(resolvedOld, "read", true);
  if (!valOld.valid) {
    return failure("renameFile", valOld.error!, valOld.code!, valOld.relativePath);
  }
  const valNew = await validatePath(resolvedNew, "write", false);
  if (!valNew.valid) {
    return failure("renameFile", valNew.error!, valNew.code!, valNew.relativePath);
  }

  try {
    const dir = path.dirname(valNew.absolutePath!);
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(valOld.absolutePath!, valNew.absolutePath!);
    const stat = await fs.stat(valNew.absolutePath!);
    return success("renameFile", {
      path: valNew.relativePath,
      absolutePath: valNew.absolutePath,
      metadata: { size: stat.size, modified: stat.mtime, type: "file" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("renameFile", `Failed to rename file: ${msg}`, "RENAME_ERROR");
  }
}

/**
 * Delete a file in a project's workspace.
 */
export async function deleteProjectFile(projectId: string, filePath: string): Promise<WorkspaceResult> {
  const validation = await validateProjectPath(projectId, filePath, "write", true);
  if (!validation.valid) {
    return failure("deleteProjectFile", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    const stat = await fs.stat(validation.absolutePath!);
    if (stat.isDirectory()) {
      return failure("deleteProjectFile", "Path is a directory, not a file", "NOT_A_FILE", validation.relativePath);
    }
    await fs.unlink(validation.absolutePath!);
    return success("deleteProjectFile", {
      path: validation.relativePath,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("deleteProjectFile", `Failed to delete file: ${msg}`, "DELETE_ERROR", validation.relativePath);
  }
}

/**
 * Rename/move a file in a project's workspace.
 */
export async function renameProjectFile(
  projectId: string,
  oldPath: string,
  newPath: string
): Promise<WorkspaceResult> {
  if (!oldPath || !newPath) {
    return failure("renameProjectFile", "Both oldPath and newPath are required", "MISSING_ARGS");
  }

  const valOld = await validateProjectPath(projectId, oldPath, "read", true);
  if (!valOld.valid) {
    return failure("renameProjectFile", valOld.error!, valOld.code!, valOld.relativePath);
  }
  const valNew = await validateProjectPath(projectId, newPath, "write", false);
  if (!valNew.valid) {
    return failure("renameProjectFile", valNew.error!, valNew.code!, valNew.relativePath);
  }

  try {
    const dir = path.dirname(valNew.absolutePath!);
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(valOld.absolutePath!, valNew.absolutePath!);
    const stat = await fs.stat(valNew.absolutePath!);
    return success("renameProjectFile", {
      path: valNew.relativePath,
      metadata: { size: stat.size, modified: stat.mtime, type: "file" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("renameProjectFile", `Failed to rename file: ${msg}`, "RENAME_ERROR");
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Walk a directory tree searching for files by name pattern.
 */
async function walkDir(
  baseRoot: string,
  currentDir: string,
  lowerPattern: string,
  results: Array<{ path: string; size: number }>,
  maxResults: number,
  maxDepth: number,
  depth: number = 0
): Promise<void> {
  if (depth > maxDepth || results.length >= maxResults) return;

  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break;

    // Skip sensitive directories
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;

    const fullPath = path.join(currentDir, entry.name);
    const relPath = fullPath.replace(SANDBOX_ROOT + "/", "");

    // Check blocked patterns
    if (isBlocked(relPath)) continue;

    if (entry.isDirectory()) {
      await walkDir(baseRoot, fullPath, lowerPattern, results, maxResults, maxDepth, depth + 1);
    } else {
      if (entry.name.toLowerCase().includes(lowerPattern) || relPath.toLowerCase().includes(lowerPattern)) {
        try {
          const stat = await fs.stat(fullPath);
          results.push({ path: relPath, size: stat.size });
        } catch {
          // skip
        }
      }
    }
  }
}

/**
 * Walk a directory tree searching for text/code patterns inside files.
 */
async function walkDirForCode(
  baseRoot: string,
  currentDir: string,
  lowerQuery: string,
  validExts: string[],
  results: Array<{ file: string; line: number; content: string }>,
  maxResults: number,
  maxDepth: number,
  depth: number = 0
): Promise<void> {
  if (depth > maxDepth || results.length >= maxResults) return;

  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break;

    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;

    const fullPath = path.join(currentDir, entry.name);
    const relPath = fullPath.replace(SANDBOX_ROOT + "/", "");

    if (isBlocked(relPath)) continue;

    if (entry.isDirectory()) {
      await walkDirForCode(baseRoot, fullPath, lowerQuery, validExts, results, maxResults, maxDepth, depth + 1);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!validExts.includes(ext)) continue;

      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > 100 * 1024) continue; // Skip files > 100KB

        const content = await fs.readFile(fullPath, "utf8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break;
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            results.push({ file: relPath, line: i + 1, content: lines[i].trim().slice(0, 200) });
          }
        }
      } catch {
        // skip
      }
    }
  }
}

/**
 * Ensure workspace directories exist.
 */
export async function ensureWorkspaceDirs(): Promise<void> {
  try {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    await fs.mkdir(GENERATED_DIR, { recursive: true });
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  } catch {
    // non-fatal
  }
}

// ===================================================================
// P2-1: Project-Aware Workspace API
// ===================================================================
// All functions in this section are ADDITIVE. The existing global API
// (validatePath, read, write, patch, search, searchCode, list, stat, mkdir)
// is unchanged and continues to handle /upload/ and /workspace/generated/
// paths for backward compatibility.
//
// Project-scoped operations are activated only when a projectId is present
// in the execution context. The projectId is system-injected (the model
// cannot control it — see tool-caller.ts _systemProjectId injection).
//
// Security model:
//   Layer 0: projectId format validation (SAFE_PROJECT_ID_REGEX)
//   Layer 1: Input validation (empty, null bytes, absolute paths)
//   Layer 2: Path normalization (path.normalize)
//   Layer 3: Path resolution (against projectRoot, NOT SANDBOX_ROOT)
//   Layer 4: Symlink resolution (realpath for existing; nearest-existing-
//            ancestor walk for non-existing write targets)
//   Layer 5: Boundary check (realpath must be within projectRoot — the
//            SPECIFIC project, not PROJECTS_ROOT as a whole)
//   Layer 6: Blocked patterns (.env, .db, .git/, node_modules/, .next/)
// ===================================================================

// ─── [HARDENING 4] Project ID Validation ────────────────────────────

/**
 * Pattern for a safe project directory identifier.
 *
 * This regex enforces a FILESYSTEM-SAFETY CONSTRAINT: the identifier must be
 * a short, lowercase-alphanumeric string starting with 'c'. This prevents
 * path traversal (no '..', no '/', no absolute paths) via the projectId itself.
 *
 * IMPORTANT: This does NOT prove the Project exists in the database.
 * It only proves the identifier is SAFE to embed in a filesystem path.
 * Project existence is a separate concern handled by the caller (the runtime
 * looks up Conversation.projectId, which is a validated FK to Project).
 */
const SAFE_PROJECT_ID_REGEX = /^c[a-z0-9]{20,31}$/;

/**
 * Returns true if the projectId is SAFE to use in a filesystem path.
 * Does NOT verify Project existence in the database.
 */
function isValidProjectId(projectId: string): boolean {
  return typeof projectId === "string" && SAFE_PROJECT_ID_REGEX.test(projectId);
}

// ─── [HARDENING 1] Project Path Validation ──────────────────────────

/**
 * Validate a path against project-scoped security rules.
 *
 * Layers:
 * 0. projectId format validation (SAFE_PROJECT_ID_REGEX)
 * 1. Input validation (empty, null bytes, absolute paths)
 * 2. Path normalization (path.normalize)
 * 3. Path resolution (against projectRoot, NOT SANDBOX_ROOT)
 * 4. Symlink resolution:
 *    - For existing paths: fs.realpath
 *    - For non-existing write targets: nearest-existing-ancestor walk
 * 5. Boundary check (realpath must be within projectRoot — the SPECIFIC
 *    project, not PROJECTS_ROOT as a whole)
 * 6. Blocked patterns (.env, .db, .git/, node_modules/, .next/)
 *
 * @param projectId - The project identifier (validated against SAFE_PROJECT_ID_REGEX)
 * @param requestedPath - Relative path within the project
 * @param mode - "read" or "write"
 * @param mustExist - Whether the path must already exist (true for read, false for write)
 */
export async function validateProjectPath(
  projectId: string,
  requestedPath: string,
  mode: "read" | "write",
  mustExist: boolean
): Promise<{ valid: boolean; absolutePath?: string; relativePath?: string; error?: string; code?: string }> {
  // Layer 0: projectId format validation [HARDENING 4]
  if (!isValidProjectId(projectId)) {
    return { valid: false, error: `Invalid project ID: ${projectId}`, code: "INVALID_PROJECT_ID" };
  }

  const projectRoot = path.join(PROJECTS_ROOT, projectId);

  // Layer 1: Input validation
  if (!requestedPath || typeof requestedPath !== "string") {
    return { valid: false, error: "Path is required", code: "EMPTY_PATH" };
  }
  if (requestedPath.includes("\0")) {
    return { valid: false, error: "Path contains null bytes", code: "NULL_BYTE" };
  }
  if (path.isAbsolute(requestedPath)) {
    return { valid: false, error: "Absolute paths are not allowed", code: "ABSOLUTE_PATH" };
  }

  // Layer 2: Normalize
  const normalized = path.normalize(requestedPath);

  // Layer 6: Blocked patterns (check early — before touching filesystem)
  if (isBlocked(normalized)) {
    return { valid: false, error: `Access denied: path "${normalized}" matches blocked pattern`, code: "BLOCKED_PATTERN" };
  }

  // Layer 3: Resolve against projectRoot (NOT SANDBOX_ROOT)
  const resolved = path.resolve(projectRoot, normalized);

  // Layer 4: Symlink resolution
  let realPath: string;
  try {
    realPath = await fs.realpath(resolved);
  } catch {
    // Path doesn't exist
    if (mustExist) {
      return { valid: false, error: `File not found: ${normalized}`, code: "NOT_FOUND" };
    }

    // For write operations (path doesn't exist yet), use nearest-existing-ancestor walk.
    // [HARDENING 1] This resolves the contradiction where nested writes
    // (e.g. "src/index.ts" when "src/" doesn't exist) were rejected.
    //
    // Strategy:
    //   1. Verify projectRoot exists (reject PROJECT_DIR_MISSING if not)
    //   2. Walk UP from target's parent, collecting ancestors until we reach
    //      projectRoot (inclusive). The chain is: parent, grandparent, ...,
    //      projectRoot.
    //   3. Find the NEAREST existing ancestor (first one that fs.access succeeds on).
    //   4. Verify that ancestor's realpath is within projectRoot.
    //      - If the nearest existing ancestor is projectRoot itself, the path
    //        is within the project (safe to create missing descendants).
    //      - If the nearest existing ancestor is OUTSIDE projectRoot (e.g. the
    //        path traversed to another project via ..), realpath will reveal it
    //        and we reject with PROJECT_BOUNDARY_ESCAPE.

    // Step 1: verify project root exists
    try {
      await fs.realpath(projectRoot);
    } catch {
      return {
        valid: false,
        error: "Project directory does not exist. Call ensureProjectDir first.",
        code: "PROJECT_DIR_MISSING",
      };
    }

    // Step 2: build ancestor chain from target's parent up to projectRoot.
    // We stop when current reaches projectRoot (which we push last).
    // If current ever equals projectRoot, we stop and push it.
    // If current's length drops below projectRoot's length (meaning we've
    // gone ABOVE projectRoot — indicating traversal escape), we stop and
    // do NOT push projectRoot; the ancestor chain will be empty or only
    // contain out-of-project paths, which Step 4 will reject.
    const ancestors: string[] = [];
    let current = path.dirname(resolved);
    let escapedAboveProject = false;
    while (true) {
      if (current === projectRoot) {
        ancestors.push(current);
        break;
      }
      // Check if we've escaped above projectRoot (current is a parent of projectRoot)
      if (projectRoot.startsWith(current + path.sep) || current === path.dirname(projectRoot)) {
        // current is projectRoot's parent or higher — we've escaped the project
        escapedAboveProject = true;
        ancestors.push(current);
        break;
      }
      // Safety: stop at filesystem root
      if (current === path.dirname(current)) {
        ancestors.push(current);
        break;
      }
      ancestors.push(current);
      current = path.dirname(current);
    }

    // Step 3: find nearest existing ancestor
    let existingAncestor: string | null = null;
    for (const ancestor of ancestors) {
      try {
        await fs.access(ancestor);
        existingAncestor = ancestor;
        break;
      } catch {
        // doesn't exist, continue up
      }
    }

    if (!existingAncestor) {
      return {
        valid: false,
        error: "No existing ancestor found",
        code: "OUTSIDE_PROJECT_ROOT",
      };
    }

    // Step 4: verify the existing ancestor's realpath is within projectRoot.
    // - If escapedAboveProject is true, the nearest ancestor is OUTSIDE the
    //   project, so realpath will not be within projectRoot → reject.
    // - If a symlink in the ancestor chain points outside project, realpath
    //   reveals it → reject.
    let realAncestor: string;
    try {
      realAncestor = await fs.realpath(existingAncestor);
    } catch {
      return {
        valid: false,
        error: `Cannot resolve realpath of ancestor: ${existingAncestor}`,
        code: "REALPATH_FAILED",
      };
    }

    const ancestorInProject =
      realAncestor === projectRoot || realAncestor.startsWith(projectRoot + path.sep);

    if (!ancestorInProject || escapedAboveProject) {
      return {
        valid: false,
        error: `Path escapes project boundary: "${normalized}" nearest existing ancestor "${existingAncestor}" resolves to "${realAncestor}"`,
        code: "PROJECT_BOUNDARY_ESCAPE",
      };
    }

    // Layer 5: Boundary check passed (ancestor is within projectRoot).
    // The caller (writeProjectFile / patchProjectFile) will call
    // fs.mkdir(dir, {recursive:true}) to create the missing intermediate
    // directories, then write the file.
    return {
      valid: true,
      absolutePath: resolved,
      relativePath: path.relative(projectRoot, resolved),
    };
  }

  // Layer 5: Boundary check — realpath must be within THIS project's root
  // (not PROJECTS_ROOT as a whole — this is what enforces project isolation)
  const isWithinProject = realPath === projectRoot || realPath.startsWith(projectRoot + path.sep);

  if (!isWithinProject) {
    // Symlink escaped boundary
    return {
      valid: false,
      error: `Path escapes project boundary: "${normalized}" resolves to "${realPath}"`,
      code: "PROJECT_BOUNDARY_ESCAPE",
    };
  }

  return {
    valid: true,
    absolutePath: realPath,
    relativePath: path.relative(projectRoot, realPath),
  };
}

// ─── Project Lifecycle ──────────────────────────────────────────────

/**
 * Ensure a project's workspace directory exists.
 * Creates PROJECTS_ROOT/{projectId}/ if it doesn't exist. Idempotent.
 */
export async function ensureProjectDir(projectId: string): Promise<WorkspaceResult> {
  if (!isValidProjectId(projectId)) {
    return failure("ensureProjectDir", `Invalid project ID: ${projectId}`, "INVALID_PROJECT_ID");
  }

  const projectRoot = path.join(PROJECTS_ROOT, projectId);

  try {
    // Ensure PROJECTS_ROOT exists first
    await fs.mkdir(PROJECTS_ROOT, { recursive: true });
    // Then ensure the project directory exists
    await fs.mkdir(projectRoot, { recursive: true });
    return success("ensureProjectDir", {
      path: `workspace/projects/${projectId}`,
      absolutePath: projectRoot,
      metadata: { type: "directory" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("ensureProjectDir", `Failed to create project directory: ${msg}`, "MKDIR_ERROR");
  }
}

/**
 * [HARDENING 3] Remove a project's directory.
 *
 * SECURITY: This is a recursive delete operation and is therefore high-risk.
 * Hardening measures (7 layers):
 *   1. Validate projectId format (prevents traversal via projectId)
 *   2. Compute expected path: PROJECTS_ROOT/{projectId}
 *   3. lstat (NOT stat) to detect symlinks without following them
 *   4. Reject if not a directory
 *   5. Reject if project root is a symlink (SYMLINK_ROOT_REJECTED)
 *   6. Verify realpath equals expected path (no symlink in path chain)
 *   7. Verify parent realpath equals PROJECTS_ROOT (no parent manipulation)
 *
 * Only after all 7 checks pass does fs.rm execute.
 *
 * @param projectId - The project identifier (validated, used to compute path)
 *   NOTE: This function accepts ONLY a projectId, never an arbitrary path.
 *   The deletion target is always literally PROJECTS_ROOT/{validatedProjectId}.
 */
export async function removeProjectDir(projectId: string): Promise<WorkspaceResult> {
  // Step 1: projectId format validation
  if (!isValidProjectId(projectId)) {
    return failure("removeProjectDir", `Invalid project ID: ${projectId}`, "INVALID_PROJECT_ID");
  }

  const projectRoot = path.join(PROJECTS_ROOT, projectId);

  // Step 2: verify projectRoot is under PROJECTS_ROOT (defensive — guaranteed by regex)
  if (!projectRoot.startsWith(PROJECTS_ROOT + path.sep)) {
    return failure("removeProjectDir", "Computed path is not under PROJECTS_ROOT", "INVALID_PATH");
  }

  // Step 3: lstat (does NOT follow symlinks)
  let stat: import("fs").Stats;
  try {
    stat = await fs.lstat(projectRoot);
  } catch {
    // Directory doesn't exist — idempotent success
    return success("removeProjectDir", {
      path: `workspace/projects/${projectId}`,
      metadata: { type: "directory" },
    });
  }

  // Step 4: reject if not a directory
  if (!stat.isDirectory()) {
    return failure("removeProjectDir", "Project root is not a directory", "NOT_A_DIRECTORY");
  }

  // Step 5: CRITICAL — reject if project root is a symlink
  // A symlink at project root could point anywhere. Refuse to delete.
  if (stat.isSymbolicLink()) {
    return failure(
      "removeProjectDir",
      "Project root is a symlink — refusing to delete (could destroy external data)",
      "SYMLINK_ROOT_REJECTED"
    );
  }

  // Step 6: verify realpath matches expected path (no symlink in path chain)
  let realPath: string;
  try {
    realPath = await fs.realpath(projectRoot);
  } catch {
    return failure("removeProjectDir", "Cannot resolve project root realpath", "REALPATH_FAILED");
  }
  if (realPath !== projectRoot) {
    return failure(
      "removeProjectDir",
      `Project root realpath mismatch: expected ${projectRoot}, got ${realPath}`,
      "REALPATH_MISMATCH"
    );
  }

  // Step 7: verify parent is exactly PROJECTS_ROOT (realpath)
  let parentReal: string;
  try {
    parentReal = await fs.realpath(PROJECTS_ROOT);
  } catch {
    return failure("removeProjectDir", "Cannot resolve PROJECTS_ROOT realpath", "PARENT_REALPATH_FAILED");
  }
  if (path.dirname(realPath) !== parentReal) {
    return failure(
      "removeProjectDir",
      `Project parent is not PROJECTS_ROOT: expected ${parentReal}, got ${path.dirname(realPath)}`,
      "PARENT_MISMATCH"
    );
  }

  // All 7 checks passed — safe to remove
  try {
    await fs.rm(projectRoot, { recursive: true, force: true });
    return success("removeProjectDir", {
      path: `workspace/projects/${projectId}`,
      metadata: { type: "directory" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("removeProjectDir", `Failed to remove project directory: ${msg}`, "RM_ERROR");
  }
}

// ─── Project File Operations ────────────────────────────────────────

/**
 * Read a file from a project's workspace.
 */
export async function readProjectFile(
  projectId: string,
  filePath: string
): Promise<WorkspaceResult> {
  const validation = await validateProjectPath(projectId, filePath, "read", true);
  if (!validation.valid) {
    return failure("readProjectFile", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    const stat = await fs.stat(validation.absolutePath!);
    if (!stat.isFile()) {
      return failure("readProjectFile", "Path is not a file", "NOT_A_FILE", validation.relativePath);
    }
    if (stat.size > 50 * 1024) {
      return failure("readProjectFile", "File too large (max 50KB)", "TOO_LARGE", `${validation.relativePath} (${stat.size} bytes)`);
    }
    const content = await fs.readFile(validation.absolutePath!, "utf8");
    return success("readProjectFile", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      data: content,
      metadata: { size: stat.size, modified: stat.mtime, type: "file" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("readProjectFile", `Failed to read file: ${msg}`, "READ_ERROR", validation.relativePath);
  }
}

/**
 * Write a file to a project's workspace. Creates intermediate directories.
 * Lazily creates the project directory if it doesn't exist yet (idempotent).
 */
export async function writeProjectFile(
  projectId: string,
  filePath: string,
  content: string
): Promise<WorkspaceResult> {
  let validation = await validateProjectPath(projectId, filePath, "write", false);

  // Lazy project directory creation: if the project dir doesn't exist yet,
  // create it and retry validation. This handles the case where a Conversation
  // has a projectId but the Project DB row was created before P2-1 (or the
  // ensureProjectDir call in /api/projects failed). The contract states:
  // "the directory will be created lazily on first write."
  if (!validation.valid && validation.code === "PROJECT_DIR_MISSING") {
    const dirResult = await ensureProjectDir(projectId);
    if (!dirResult.success) {
      return failure("writeProjectFile", dirResult.error!, dirResult.diagnostics?.code ?? "MKDIR_ERROR");
    }
    validation = await validateProjectPath(projectId, filePath, "write", false);
  }

  if (!validation.valid) {
    return failure("writeProjectFile", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    // Create intermediate directories (Layer 4 nearest-existing-ancestor verified
    // the parent chain is safe; now actually create the missing dirs)
    const dir = path.dirname(validation.absolutePath!);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(validation.absolutePath!, content, "utf8");
    const stat = await fs.stat(validation.absolutePath!);

    // P2-5: Record file version
    await recordFileVersion(projectId, validation.relativePath ?? filePath, content);

    return success("writeProjectFile", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      metadata: { size: stat.size, modified: stat.mtime, type: "file" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("writeProjectFile", `Failed to write file: ${msg}`, "WRITE_ERROR", validation.relativePath);
  }
}

/**
 * Patch a file in a project's workspace (find and replace). Creates the file if it doesn't exist.
 */
export async function patchProjectFile(
  projectId: string,
  filePath: string,
  find: string,
  replace: string
): Promise<WorkspaceResult> {
  if (!filePath || !find) {
    return failure("patchProjectFile", "Filepath and find string are required", "MISSING_ARGS");
  }

  let validation = await validateProjectPath(projectId, filePath, "write", false);

  // Lazy project directory creation (same as writeProjectFile)
  if (!validation.valid && validation.code === "PROJECT_DIR_MISSING") {
    const dirResult = await ensureProjectDir(projectId);
    if (!dirResult.success) {
      return failure("patchProjectFile", dirResult.error!, dirResult.diagnostics?.code ?? "MKDIR_ERROR");
    }
    validation = await validateProjectPath(projectId, filePath, "write", false);
  }

  if (!validation.valid) {
    return failure("patchProjectFile", validation.error!, validation.code!, validation.relativePath);
  }

  try {
    // Create intermediate directories
    const dir = path.dirname(validation.absolutePath!);
    await fs.mkdir(dir, { recursive: true });

    let content = "";
    try {
      content = await fs.readFile(validation.absolutePath!, "utf8");
    } catch {
      // File doesn't exist — will create with replace content
    }

    const newContent = content.includes(find)
      ? content.replace(find, replace)
      : content + (content ? "\n" : "") + replace;

    await fs.writeFile(validation.absolutePath!, newContent, "utf8");
    const stat = await fs.stat(validation.absolutePath!);

    // P2-5: Record file version
    await recordFileVersion(projectId, validation.relativePath ?? filePath, newContent);

    return success("patchProjectFile", {
      path: validation.relativePath,
      absolutePath: validation.absolutePath,
      metadata: { size: stat.size, modified: stat.mtime, type: "file" },
      data: { patched: content.includes(find) },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("patchProjectFile", `Failed to patch file: ${msg}`, "PATCH_ERROR", validation.relativePath);
  }
}

// ─── [HARDENING 2] Symlink-Safe Project Traversal ───────────────────

/**
 * Walk a project directory tree with symlink-safe traversal.
 *
 * SECURITY [HARDENING 2]: This function skips ALL symlinks during traversal.
 * - entry.isSymbolicLink() → SKIP (don't add to results, don't recurse)
 * - This prevents symlink-based directory escape attacks where a symlink
 *   inside project A points to project B, /etc, /upload, etc.
 *
 * The traversal only follows real directories. Since it starts at projectRoot
 * and only recurses into non-symlink subdirectories, it can never escape
 * the project boundary.
 *
 * @param projectRoot - The root directory of the project (already validated)
 * @param currentDir - The current directory being walked
 * @param visitor - Called for each real file (not symlink, not directory)
 * @param maxDepth - Maximum recursion depth
 * @param maxResults - Stop after this many results
 * @param resultsCount - Function returning current result count
 * @param depth - Current depth (internal)
 */
async function walkProjectDir(
  projectRoot: string,
  currentDir: string,
  visitor: (entry: import("fs").Dirent, fullPath: string, relPath: string) => Promise<void>,
  maxDepth: number,
  maxResults: number,
  resultsCount: () => number,
  depth: number = 0
): Promise<void> {
  if (depth > maxDepth || resultsCount() >= maxResults) return;

  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (resultsCount() >= maxResults) break;

    // CRITICAL [HARDENING 2]: Skip ALL symlinks.
    // This is the primary defense against symlink-based directory escape.
    // A symlink inside the project pointing to:
    //   - another project (cross-project leak)
    //   - /etc, /upload, /home (sandbox escape)
    //   - any external path
    // is skipped entirely. Not added to results, not recursed into.
    if (entry.isSymbolicLink()) continue;

    // Skip sensitive/hidden directories (same as existing walkDir)
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;

    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(projectRoot, fullPath);

    // Layer 6: blocked patterns
    if (isBlocked(relPath)) continue;

    if (entry.isDirectory()) {
      // Recurse into real directories only (symlinks already skipped above)
      await walkProjectDir(projectRoot, fullPath, visitor, maxDepth, maxResults, resultsCount, depth + 1);
    } else if (entry.isFile()) {
      await visitor(entry, fullPath, relPath);
    }
    // Symlinks, sockets, FIFOs, etc. are ignored (not isDirectory, not isFile,
    // and symlinks already skipped at the top of the loop)
  }
}

/**
 * List all files in a project's workspace (recursive, symlink-safe).
 */
export async function listProjectTree(
  projectId: string,
  maxDepth: number = 10
): Promise<WorkspaceResult> {
  if (!isValidProjectId(projectId)) {
    return failure("listProjectTree", `Invalid project ID: ${projectId}`, "INVALID_PROJECT_ID");
  }

  const projectRoot = path.join(PROJECTS_ROOT, projectId);

  // Verify project root exists and is a real directory (not symlink)
  try {
    const stat = await fs.lstat(projectRoot);
    if (!stat.isDirectory()) {
      return failure("listProjectTree", "Project root is not a directory", "NOT_A_DIRECTORY");
    }
    if (stat.isSymbolicLink()) {
      return failure("listProjectTree", "Project root is a symlink", "SYMLINK_ROOT_REJECTED");
    }
  } catch {
    return failure("listProjectTree", "Project directory does not exist", "PROJECT_DIR_MISSING");
  }

  const tree: Array<{ path: string; size: number; type: "file" | "directory" }> = [];

  await walkProjectDir(
    projectRoot,
    projectRoot,
    async (_entry, fullPath, relPath) => {
      try {
        const stat = await fs.stat(fullPath);
        tree.push({
          path: relPath,
          size: stat.size,
          type: "file",
        });
      } catch {
        // skip unreadable files
      }
    },
    maxDepth,
    500, // max 500 entries
    () => tree.length
  );

  return success("listProjectTree", {
    path: `workspace/projects/${projectId}`,
    data: { tree, count: tree.length },
  });
}

/**
 * Search for files by name pattern in a project's workspace (symlink-safe).
 */
export async function searchProject(
  projectId: string,
  pattern: string,
  maxResults: number = 20
): Promise<WorkspaceResult> {
  if (!isValidProjectId(projectId)) {
    return failure("searchProject", `Invalid project ID: ${projectId}`, "INVALID_PROJECT_ID");
  }
  if (!pattern) {
    return failure("searchProject", "Pattern is required", "EMPTY_PATTERN");
  }

  const projectRoot = path.join(PROJECTS_ROOT, projectId);

  // Verify project root exists and is a real directory (not symlink)
  try {
    const stat = await fs.lstat(projectRoot);
    if (!stat.isDirectory()) {
      return failure("searchProject", "Project root is not a directory", "NOT_A_DIRECTORY");
    }
    if (stat.isSymbolicLink()) {
      return failure("searchProject", "Project root is a symlink", "SYMLINK_ROOT_REJECTED");
    }
  } catch {
    return failure("searchProject", "Project directory does not exist", "PROJECT_DIR_MISSING");
  }

  const lowerPattern = pattern.toLowerCase();
  const results: Array<{ path: string; size: number }> = [];

  await walkProjectDir(
    projectRoot,
    projectRoot,
    async (_entry, fullPath, relPath) => {
      if (relPath.toLowerCase().includes(lowerPattern)) {
        try {
          const stat = await fs.stat(fullPath);
          results.push({ path: relPath, size: stat.size });
        } catch {
          // skip
        }
      }
    },
    10,
    maxResults,
    () => results.length
  );

  return success("searchProject", {
    path: `workspace/projects/${projectId}`,
    data: { pattern, results, count: results.length },
  });
}

/**
 * Search for text/code patterns inside files in a project's workspace (symlink-safe).
 */
export async function searchProjectCode(
  projectId: string,
  query: string,
  maxResults: number = 30
): Promise<WorkspaceResult> {
  if (!isValidProjectId(projectId)) {
    return failure("searchProjectCode", `Invalid project ID: ${projectId}`, "INVALID_PROJECT_ID");
  }
  if (!query) {
    return failure("searchProjectCode", "Query is required", "EMPTY_QUERY");
  }

  const projectRoot = path.join(PROJECTS_ROOT, projectId);

  // Verify project root exists and is a real directory (not symlink)
  try {
    const stat = await fs.lstat(projectRoot);
    if (!stat.isDirectory()) {
      return failure("searchProjectCode", "Project root is not a directory", "NOT_A_DIRECTORY");
    }
    if (stat.isSymbolicLink()) {
      return failure("searchProjectCode", "Project root is a symlink", "SYMLINK_ROOT_REJECTED");
    }
  } catch {
    return failure("searchProjectCode", "Project directory does not exist", "PROJECT_DIR_MISSING");
  }

  const lowerQuery = query.toLowerCase();
  const results: Array<{ file: string; line: number; content: string }> = [];
  const validExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".json", ".md", ".prisma", ".sql", ".css", ".html"];

  await walkProjectDir(
    projectRoot,
    projectRoot,
    async (entry, fullPath, relPath) => {
      const ext = path.extname(entry.name).toLowerCase();
      if (!validExts.includes(ext)) return;

      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > 100 * 1024) return; // skip files > 100KB

        const content = await fs.readFile(fullPath, "utf8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break;
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            results.push({ file: relPath, line: i + 1, content: lines[i].trim().slice(0, 200) });
          }
        }
      } catch {
        // skip
      }
    },
    10,
    maxResults,
    () => results.length
  );

  return success("searchProjectCode", {
    path: `workspace/projects/${projectId}`,
    data: { query, results, count: results.length },
  });
}

// ===================================================================
// P2-5: File Versioning
// ===================================================================
// Records every write/patch to a project file as a version in the DB.
// ProjectFile tracks the current version; FileVersion stores each snapshot.
//
// Provenance fields (conversationId, taskId, agentName, artifactId) link
// versions back to their origin for audit trails.
//
// Version cap: MAX_VERSIONS_PER_FILE (50). Older versions pruned.
// ===================================================================

const MAX_VERSIONS_PER_FILE = 50;

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

interface VersionProvenance {
  conversationId?: string;
  taskId?: string;
  agentName?: string;
  artifactId?: string;
}

/**
 * Record a file version in the DB.
 * Called by writeProjectFile and patchProjectFile after a successful write.
 * If the file is new, creates ProjectFile + FileVersion v1.
 * If the file exists and content changed, increments version + creates new FileVersion.
 * If the content is unchanged, does nothing (idempotent).
 */
async function recordFileVersion(
  projectId: string,
  filePath: string,
  content: string,
  provenance?: VersionProvenance
): Promise<void> {
  try {
    const hash = hashContent(content);
    const sizeBytes = Buffer.byteLength(content, "utf8");

    // Find existing ProjectFile
    const existing = await db.projectFile.findUnique({
      where: { projectId_path: { projectId, path: filePath } },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (!existing) {
      // New file — create ProjectFile + FileVersion v1
      await db.projectFile.create({
        data: {
          projectId,
          path: filePath,
          currentHash: hash,
          version: 1,
          versions: {
            create: {
              version: 1,
              content,
              hash,
              sizeBytes,
              conversationId: provenance?.conversationId,
              taskId: provenance?.taskId,
              agentName: provenance?.agentName,
              artifactId: provenance?.artifactId,
            },
          },
        },
      });
      return;
    }

    // File exists — check if content changed
    if (existing.currentHash === hash) {
      // Content unchanged — idempotent, no new version
      return;
    }

    // Content changed — increment version + create new FileVersion
    const newVersion = existing.version + 1;
    await db.$transaction([
      db.fileVersion.create({
        data: {
          fileId: existing.id,
          version: newVersion,
          content,
          hash,
          sizeBytes,
          conversationId: provenance?.conversationId,
          taskId: provenance?.taskId,
          agentName: provenance?.agentName,
          artifactId: provenance?.artifactId,
        },
      }),
      db.projectFile.update({
        where: { id: existing.id },
        data: { currentHash: hash, version: newVersion },
      }),
    ]);

    // Prune old versions if exceeding cap
    const versionCount = await db.fileVersion.count({ where: { fileId: existing.id } });
    if (versionCount > MAX_VERSIONS_PER_FILE) {
      const toDelete = versionCount - MAX_VERSIONS_PER_FILE;
      const oldVersions = await db.fileVersion.findMany({
        where: { fileId: existing.id },
        orderBy: { version: "asc" },
        take: toDelete,
        select: { id: true },
      });
      await db.fileVersion.deleteMany({
        where: { id: { in: oldVersions.map((v) => v.id) } },
      });
    }
  } catch (err) {
    // Version recording is non-fatal — log warning but don't fail the write
    console.warn(`[workspace] Failed to record file version for ${filePath}:`, err);
  }
}

/**
 * Get the version history of a project file.
 * Returns versions in descending order (newest first).
 */
export async function getFileHistory(
  projectId: string,
  filePath: string
): Promise<WorkspaceResult> {
  if (!isValidProjectId(projectId)) {
    return failure("getFileHistory", `Invalid project ID: ${projectId}`, "INVALID_PROJECT_ID");
  }

  try {
    const file = await db.projectFile.findUnique({
      where: { projectId_path: { projectId, path: filePath } },
      include: {
        versions: {
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            hash: true,
            sizeBytes: true,
            conversationId: true,
            taskId: true,
            agentName: true,
            artifactId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!file) {
      return failure("getFileHistory", `File not found: ${filePath}`, "NOT_FOUND");
    }

    return success("getFileHistory", {
      path: filePath,
      data: {
        fileId: file.id,
        currentVersion: file.version,
        currentHash: file.currentHash,
        versions: file.versions,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("getFileHistory", `Failed to get history: ${msg}`, "DB_ERROR");
  }
}

/**
 * Revert a file to a specific version.
 * Writes the version's content back to disk and updates currentHash.
 */
export async function revertFile(
  projectId: string,
  filePath: string,
  targetVersion: number
): Promise<WorkspaceResult> {
  if (!isValidProjectId(projectId)) {
    return failure("revertFile", `Invalid project ID: ${projectId}`, "INVALID_PROJECT_ID");
  }

  try {
    const file = await db.projectFile.findUnique({
      where: { projectId_path: { projectId, path: filePath } },
      include: {
        versions: {
          where: { version: targetVersion },
          take: 1,
        },
      },
    });

    if (!file) {
      return failure("revertFile", `File not found: ${filePath}`, "NOT_FOUND");
    }

    if (file.versions.length === 0) {
      return failure("revertFile", `Version ${targetVersion} not found`, "VERSION_NOT_FOUND");
    }

    const targetVersionRow = file.versions[0];
    const content = targetVersionRow.content;

    // Write the old content back to disk via validateProjectPath
    const validation = await validateProjectPath(projectId, filePath, "write", false);
    if (!validation.valid) {
      return failure("revertFile", validation.error!, validation.code!, validation.relativePath);
    }

    // Create parent dirs if needed
    const dir = path.dirname(validation.absolutePath!);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(validation.absolutePath!, content, "utf8");

    // Record this revert as a NEW version (so history is preserved)
    await recordFileVersion(projectId, filePath, content, {
      agentName: "system",
    });

    return success("revertFile", {
      path: filePath,
      data: {
        revertedTo: targetVersion,
        newVersion: file.version + 1,
        size: targetVersionRow.sizeBytes,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("revertFile", `Failed to revert: ${msg}`, "REVERT_ERROR");
  }
}

/**
 * Diff two versions of a file.
 * Returns line-by-line diff: added, removed, unchanged.
 */
export async function diffVersions(
  projectId: string,
  filePath: string,
  versionA: number,
  versionB: number
): Promise<WorkspaceResult> {
  if (!isValidProjectId(projectId)) {
    return failure("diffVersions", `Invalid project ID: ${projectId}`, "INVALID_PROJECT_ID");
  }

  try {
    // Handle same-version diff (returns empty diff)
    if (versionA === versionB) {
      const version = await db.fileVersion.findFirst({
        where: { file: { projectId, path: filePath }, version: versionA },
        select: { content: true },
      });
      if (!version) {
        return failure("diffVersions", `Version ${versionA} not found`, "VERSION_NOT_FOUND");
      }
      const lines = version.content.split("\n");
      return success("diffVersions", {
        path: filePath,
        data: {
          versionA,
          versionB,
          added: 0,
          removed: 0,
          diff: lines.map((line, i) => ({
            type: "same" as const,
            lineA: i + 1,
            lineB: i + 1,
            content: line,
          })),
        },
      });
    }

    const versions = await db.fileVersion.findMany({
      where: {
        file: { projectId, path: filePath },
        version: { in: [versionA, versionB] },
      },
      select: { version: true, content: true },
    });

    if (versions.length < 2) {
      return failure("diffVersions", `Could not find both versions ${versionA} and ${versionB}`, "VERSION_NOT_FOUND");
    }

    const contentA = versions.find((v) => v.version === versionA)?.content ?? "";
    const contentB = versions.find((v) => v.version === versionB)?.content ?? "";

    const linesA = contentA.split("\n");
    const linesB = contentB.split("\n");
    const maxLen = Math.max(linesA.length, linesB.length);

    const diff: Array<{ type: "added" | "removed" | "same"; lineA?: number; lineB?: number; content: string }> = [];
    let idxA = 0;
    let idxB = 0;

    for (let i = 0; i < maxLen; i++) {
      const lineA = linesA[i];
      const lineB = linesB[i];

      if (lineA === lineB) {
        diff.push({ type: "same", lineA: idxA + 1, lineB: idxB + 1, content: lineA ?? "" });
        idxA++;
        idxB++;
      } else {
        if (lineA !== undefined) {
          diff.push({ type: "removed", lineA: idxA + 1, content: lineA });
          idxA++;
        }
        if (lineB !== undefined) {
          diff.push({ type: "added", lineB: idxB + 1, content: lineB });
          idxB++;
        }
      }
    }

    const added = diff.filter((d) => d.type === "added").length;
    const removed = diff.filter((d) => d.type === "removed").length;

    return success("diffVersions", {
      path: filePath,
      data: {
        versionA,
        versionB,
        added,
        removed,
        diff,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure("diffVersions", `Failed to diff: ${msg}`, "DIFF_ERROR");
  }
}
