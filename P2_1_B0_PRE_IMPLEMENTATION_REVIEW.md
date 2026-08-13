# P2-1 Sub-Gate B0 — Pre-Implementation Review

> **READ-ONLY.** No source code modified. This document proposes scope and changes for approval BEFORE any P2-1 implementation begins.
> **Strict constraints (from user):**
> - WorkspaceService remains the sole filesystem authority
> - No new `fs.*` in tools or runtime
> - No path bypasses
> - Do not break the existing 6 security layers
> - Project isolation first; `projectId` is the project workspace source
> - Model cannot specify absolute paths or escape to another project
> - No P2-5 (no ProjectFile, no FileVersion, no migrations, no versioning)
> - Do not change tool schemas unless absolutely necessary
> - `projectId` injected from system context (same pattern as `conversationId` in P1-A)
> - Backward compatibility with `/upload/`
> - Tests before moving on (isolation + regression)
> - Do not mix P2-1 with File Tree UI or Multi-File Generation

---

## 0. Executive Summary

**P2-1 goal (restated):** Make the `Project` the basic isolation unit for files, without breaking anything from P1.

**Approach:** Add a **project-aware parallel API** to WorkspaceService (`validateProjectPath`, `readProjectFile`, `writeProjectFile`, `listProjectTree`, `patchProjectFile`, `searchProject`, `searchProjectCode`). The existing global API (`validatePath`, `read`, `write`, `search`, `searchCode`, `patch`, `list`, `stat`, `mkdir`) remains **unchanged** for backward compatibility.

**`projectId` flows through system context** (not tool arguments), mirroring the `conversationId` injection pattern from P1-A. The model never sees or controls `projectId`.

**No tool schema changes.** The 5 filesystem tools (`file_read`, `file_write`, `file_search`, `code_search`, `patch`) keep their existing input schemas. When a `projectId` is present in the execution context, the tools route through the project-aware API; when absent, they fall back to the current global `/upload/` behavior.

**No Prisma migration.** No new models. No `ProjectFile`/`FileVersion`. `Conversation.projectId` already exists (`String?`).

**Estimated files touched:** 6 (1 new test file, 5 source files with additive changes only).

---

## 1. Current State (Verified in Source)

### WorkspaceService (`src/lib/ai/workspace.ts`)
- **Constants:** `WORKSPACE_ROOT=/home/z/my-project/workspace`, `SANDBOX_ROOT=/home/z/my-project`, `UPLOAD_DIR=/home/z/my-project/upload`, `GENERATED_DIR=/home/z/my-project/workspace/generated`
- **READ_ROOTS:** `[WORKSPACE_ROOT, UPLOAD_DIR, src/, prisma/, public/]`
- **WRITE_ROOTS:** `[UPLOAD_DIR, GENERATED_DIR]`
- **`validatePath(requestedPath, mode, mustExist)`** — 6-layer validation: input → normalize → resolve-against-SANDBOX_ROOT → realpath → boundary-check-against-roots → blocked-patterns
- **`write(filePath, content)`** — has a backward-compat hack: if `filePath` has no `/` and no `..`, prepends `upload/`. This is the only place where the global write path is special-cased.
- **`patch(filePath, find, replace)`** — same backward-compat hack (prepends `upload/` for simple filenames)
- **`read`, `search`, `searchCode`, `list`, `stat`, `mkdir`** — no special-casing; use `validatePath` directly
- **Blocked patterns:** `.env`, `.db`, `.sqlite`, `.sqlite3`, `.git/`, `node_modules/`, `.next/`

### Tool calling (`src/lib/ai/tool-caller.ts`)
- **`ToolCallContext`** interface: `{ conversationId: string; taskId?: string; agentName: string }` — **no `projectId` yet**
- **`executeToolCall`** — for `memory_store`, injects `_systemConversationId` from `context.conversationId` (the P1-A pattern). This is the template for `projectId` injection.
- **`generateToolSchemaForAgent`** — generates schemas from `agent.defaultTools`. No change needed.

### Runtime (`src/lib/ai/runtime.ts`)
- **`ExecuteTaskInput`** — `{ conversationId, taskId?, agentName, userMessage, autonomous? }` — **no `projectId` yet**
- **`ExecutionContext`** (in `types.ts`) — `{ conversationId, taskId?, agentName, ... }` — **no `projectId` yet**
- **`toolCallContext`** constructed at `runtime.ts:169`: `{ conversationId, taskId, agentName }` — **no `projectId` yet**
- **`executeResponse`** call at `runtime.ts:332` passes `{ conversationId, taskId, agentName }` — **no `projectId` yet**

### Execution engine (`src/lib/ai/execution-engine.ts`)
- **`executeResponse(content, context)`** — `context` is `{ conversationId, taskId?, agentName }` — **no `projectId` yet**
- Calls `WorkspaceService.write(safeFilename, block.code)` — global write path only
- Sets `Artifact.filePath` to `writeResult.path` (currently `upload/{filename}`)

### Conversation + Project models (`prisma/schema.prisma`)
- **`Conversation.projectId`** — `String?`, FK to `Project`, `onDelete: SetNull`. **Already exists.**
- **`Project`** model — `id` (CUID), `name`, `description`, `type`, `status`, `goals`, `techStack`, `requirements`, timestamps. **Already exists.**
- No `ProjectFile` or `FileVersion` models (correctly absent — P2-5 is deferred)

### API routes
- **`POST /api/conversations`** — does NOT accept `projectId` in body. Creates conversation without project link.
- **`PATCH /api/conversations/[id]`** — DOES accept `projectId` (line 35). Can link a conversation to a project after creation.
- **`POST /api/chat`** — does NOT look up `Conversation.projectId`. Passes only `conversationId` to `executeTask` / `runAutonomousLoop`.
- **`POST /api/projects`** — creates a Project DB row. Does NOT create a filesystem directory.

### Tools (`src/lib/ai/tools/index.ts`)
- 5 filesystem tools: `file_read`, `file_write`, `file_search`, `code_search`, `patch`
- Each calls the corresponding `WorkspaceService.*` method
- **Tool input schemas do NOT include `projectId`** (correct — system-injected, not model-controlled)
- `file_write` and `patch` reject filenames containing `/` or `..` (defensive, in addition to WorkspaceService validation)

### ValidationService (`src/lib/ai/validation.ts`)
- **`validateArtifact`** check `path_in_allowed_area` (line 265): `filePath.startsWith("upload/") || filePath.startsWith("workspace/")` — **must add `projects/` prefix** or project-scoped artifacts will fail validation.

---

## 2. Proposed Scope (Strictly Bounded)

### Files that WILL be touched (additive changes only)

| File | Change | Lines (est.) |
|------|--------|-------------|
| `src/lib/ai/workspace.ts` | Add `PROJECTS_ROOT` constant, `isValidProjectId()` helper, `validateProjectPath()` function, `ensureProjectDir()`, `readProjectFile()`, `writeProjectFile()`, `patchProjectFile()`, `listProjectTree()`, `searchProject()`, `searchProjectCode()`. **No changes to existing functions.** | +250 (additive) |
| `src/lib/ai/tool-caller.ts` | Add `projectId?: string` to `ToolCallContext`. For the 5 FS tools, inject `_systemProjectId` from `context.projectId` (mirrors `_systemConversationId` pattern). **No schema changes.** | +15 |
| `src/lib/ai/runtime.ts` | Look up `Conversation.projectId` at task start. Add `projectId?: string` to `ExecuteTaskInput` and `ExecutionContext`. Pass `projectId` into `toolCallContext` and into `executeResponse`. **No autonomous-loop logic changes.** | +20 |
| `src/lib/ai/execution-engine.ts` | Accept optional `projectId` in context. When present, call `WorkspaceService.writeProjectFile()` instead of `WorkspaceService.write()`. **Fallback to current behavior when absent.** | +15 |
| `src/lib/ai/types.ts` | Add `projectId?: string` to `ExecutionContext`. | +1 |
| `src/lib/ai/validation.ts` | Add `projects/` to the `path_in_allowed_area` check in `validateArtifact`. | +1 |
| `src/app/api/projects/route.ts` | Call `WorkspaceService.ensureProjectDir(projectId)` on POST create. | +5 |
| `src/app/api/projects/[id]/route.ts` | Call `WorkspaceService.removeProjectDir(projectId)` on DELETE. | +5 |
| `tests/workspace-project-p2-1.test.ts` | **NEW** — isolation + regression tests (~60 assertions). | +400 (new file) |

### Files that WILL NOT be touched

- `prisma/schema.prisma` — no migration (no new models)
- `src/lib/ai/tools/index.ts` — **tool schemas unchanged**; tools read `_systemProjectId` from input (system-injected) and route accordingly
- `src/lib/ai/task-graph.ts` — no changes
- `src/lib/ai/model.ts` — no changes
- `src/lib/ai/memory.ts` — no changes
- `src/lib/ai/context.ts` — no changes
- `src/lib/ai/agents/index.ts` — no agent prompt changes
- `src/components/mimo/*` — no UI changes (no File Tree, no Code Editor)
- `src/app/api/chat/route.ts` — no changes (`projectId` is derived from `Conversation` row, not from request body)
- `src/app/api/conversations/route.ts` — no changes (conversations are still created without `projectId`; linking happens via PATCH or via a project-scoped flow in a later phase)

### Tool schema changes: **NONE**

The user explicitly requested: "do not change tool schemas unless absolutely necessary. Better to keep tools as-is while passing `projectId` from system context, same principle as `conversationId` in P1-A."

The 5 FS tool schemas (`file_read`, `file_write`, `file_search`, `code_search`, `patch`) remain exactly as they are. The `projectId` is injected as `_systemProjectId` (a system-controlled field the model cannot set), and the tool's `execute` function reads it to decide routing. This is identical to how `memory_store` receives `_systemConversationId` today.

---

## 3. Sub-Gate B1 — Project Path Contract

### B1.1 Project root location

```
/home/z/my-project/workspace/projects/{projectId}/
```

- `WORKSPACE_ROOT` = `/home/z/my-project/workspace` (existing)
- `PROJECTS_ROOT` = `path.join(WORKSPACE_ROOT, "projects")` = `/home/z/my-project/workspace/projects` (NEW)
- Per-project root = `path.join(PROJECTS_ROOT, projectId)` = `/home/z/my-project/workspace/projects/{projectId}`

**Why under `WORKSPACE_ROOT/projects/`?**
- `WORKSPACE_ROOT` is already in `READ_ROOTS`, so reads work without changing `READ_ROOTS`.
- `WORKSPACE_ROOT` is a clean, dedicated workspace directory (not `SANDBOX_ROOT` itself, which contains `src/`, `prisma/`, `node_modules/`, etc.).
- Subdirectory `projects/` keeps project workspaces grouped and distinct from `generated/` (the other write area under `WORKSPACE_ROOT`).

### B1.2 `projectId` validation contract

A `projectId` is valid only if it matches the CUID format produced by Prisma's `@default(cuid())`:
- Starts with `c`
- Length 24-32 characters (CUID2 is typically 24, but allow some slack)
- Lowercase alphanumeric only

```ts
const PROJECT_ID_REGEX = /^c[a-z0-9]{20,31}$/;

function isValidProjectId(projectId: string): boolean {
  return typeof projectId === "string" && PROJECT_ID_REGEX.test(projectId);
}
```

**Why strict validation?**
- Prevents `projectId = "../other-project"` (path traversal via projectId)
- Prevents `projectId = "../../etc"` (sandbox escape via projectId)
- Prevents `projectId = ""` or `projectId = "."` (ambiguous root)

If `projectId` is invalid, ALL project-scoped operations fail with `INVALID_PROJECT_ID` error code.

### B1.3 Path resolution contract

For a project-scoped path `relPath` in project `projectId`:
1. Validate `projectId` (regex above)
2. Validate `relPath` is non-empty, no null bytes, not absolute
3. Normalize `relPath` via `path.normalize`
4. Check blocked patterns on `relPath`
5. Resolve: `path.resolve(PROJECTS_ROOT, projectId, normalized)` — this is the absolute path
6. Symlink-resolve via `fs.realpath` (for existing paths) or `fs.realpath` on parent (for write paths)
7. Boundary check: the realpath must start with `path.join(PROJECTS_ROOT, projectId) + path.sep` OR equal it exactly

**Critical: the boundary check uses the SPECIFIC project root, not `PROJECTS_ROOT` as a whole.** This is what provides project isolation — project A's root is `/workspace/projects/{A_id}/` and project B's root is `/workspace/projects/{B_id}/`. A symlink that escapes project A's root into project B's root is rejected.

### B1.4 Backward compatibility contract

When `projectId` is absent (null/undefined/empty):
- ALL operations use the existing global API (`validatePath`, `read`, `write`, `patch`, `search`, `searchCode`)
- Existing `/upload/` files continue to work
- Existing conversations without `projectId` behave exactly as before
- The `file_write` and `patch` tools' "prepend upload/" hack remains in the global API

**No existing function signature changes.** The global API is frozen.

---

## 4. Sub-Gate B2 — WorkspaceService Project-Aware Methods

### B2.1 New constants

```ts
// Add to existing constants block
export const PROJECTS_ROOT = path.join(WORKSPACE_ROOT, "projects");
```

`READ_ROOTS` and `WRITE_ROOTS` are **NOT modified**. The project-aware methods use their own boundary check against `path.join(PROJECTS_ROOT, projectId)`, not against the root arrays.

### B2.2 New `validateProjectPath` function

```ts
export async function validateProjectPath(
  projectId: string,
  requestedPath: string,
  mode: "read" | "write",
  mustExist: boolean
): Promise<{ valid: boolean; absolutePath?: string; relativePath?: string; error?: string; code?: string }> {
  // Layer 0: projectId validation (NEW — project isolation)
  if (!isValidProjectId(projectId)) {
    return { valid: false, error: `Invalid project ID: ${projectId}`, code: "INVALID_PROJECT_ID" };
  }

  const projectRoot = path.join(PROJECTS_ROOT, projectId);

  // Layer 1: Input validation (same as validatePath)
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

  // Layer 6: Blocked patterns (same as validatePath)
  if (isBlocked(normalized)) {
    return { valid: false, error: `Access denied: path "${normalized}" matches blocked pattern`, code: "BLOCKED_PATTERN" };
  }

  // Layer 3: Resolve against project root (NOT SANDBOX_ROOT)
  const resolved = path.resolve(projectRoot, normalized);

  // Layer 4: Symlink resolution (same logic as validatePath)
  let realPath: string;
  try {
    realPath = await fs.realpath(resolved);
  } catch {
    if (mustExist) {
      return { valid: false, error: `File not found: ${normalized}`, code: "NOT_FOUND" };
    }
    // For write: verify parent directory is within project root
    const parentDir = path.dirname(resolved);
    try {
      const realParent = await fs.realpath(parentDir);
      const parentInProject = realParent === projectRoot || realParent.startsWith(projectRoot + path.sep);
      if (parentInProject) {
        if (isBlocked(normalized)) {
          return { valid: false, error: `Access denied: path "${normalized}" matches blocked pattern`, code: "BLOCKED_PATTERN" };
        }
        return { valid: true, absolutePath: resolved, relativePath: path.relative(projectRoot, resolved) };
      }
    } catch {
      // Parent doesn't exist
    }
    return { valid: false, error: `Path not within project workspace: ${normalized}`, code: "OUTSIDE_PROJECT_ROOT" };
  }

  // Layer 5: Boundary check — realpath must be within THIS project's root
  const isWithinProject = realPath === projectRoot || realPath.startsWith(projectRoot + path.sep);
  if (!isWithinProject) {
    return {
      valid: false,
      error: `Path escapes project boundary: "${normalized}" resolves to "${realPath}"`,
      code: "PROJECT_BOUNDARY_ESCAPE",
    };
  }

  return { valid: true, absolutePath: realPath, relativePath: path.relative(projectRoot, realPath) };
}
```

**Key security properties:**
- Same 6 layers as `validatePath` (input, normalize, resolve, realpath, boundary, blocked)
- PLUS Layer 0: `projectId` format validation (prevents traversal via projectId itself)
- Boundary check uses `projectRoot` (specific to this project), NOT `PROJECTS_ROOT` (which contains ALL projects)
- A symlink that resolves into another project's directory is rejected with `PROJECT_BOUNDARY_ESCAPE`

### B2.3 New project-aware operations

Each mirrors the existing global operation but calls `validateProjectPath` instead of `validatePath`:

```ts
export async function ensureProjectDir(projectId: string): Promise<WorkspaceResult>
// Creates PROJECTS_ROOT/{projectId}/ if it doesn't exist. Validates projectId first.

export async function removeProjectDir(projectId: string): Promise<WorkspaceResult>
// Removes PROJECTS_ROOT/{projectId}/ recursively. Validates projectId first.
// Used when a Project is deleted.

export async function readProjectFile(projectId: string, filePath: string): Promise<WorkspaceResult>
// Mirrors read() but uses validateProjectPath.

export async function writeProjectFile(projectId: string, filePath: string, content: string): Promise<WorkspaceResult>
// Mirrors write() but uses validateProjectPath.
// Does NOT have the "prepend upload/" hack — project paths are always relative to project root.

export async function patchProjectFile(projectId: string, filePath: string, find: string, replace: string): Promise<WorkspaceResult>
// Mirrors patch() but uses validateProjectPath.

export async function listProjectTree(projectId: string, maxDepth?: number): Promise<WorkspaceResult>
// Walks PROJECTS_ROOT/{projectId}/ and returns a tree of files.
// Respects blocked patterns. Used by future File Tree UI (P2-2).

export async function searchProject(projectId: string, pattern: string, maxResults?: number): Promise<WorkspaceResult>
// Mirrors search() but scoped to PROJECTS_ROOT/{projectId}/.

export async function searchProjectCode(projectId: string, query: string, maxResults?: number): Promise<WorkspaceResult>
// Mirrors searchCode() but scoped to PROJECTS_ROOT/{projectId}/.
```

**The `relativePath` returned by `validateProjectPath` is relative to the project root, NOT to `SANDBOX_ROOT`.** This means `Artifact.filePath` for project-scoped files will be `projects/{projectId}/{filename}` (so it can be validated and resolved later). To make this unambiguous, the `writeProjectFile` result will set `path` to `projects/{projectId}/{relativePath}` (prefixed with `projects/` so validation knows it's project-scoped).

**Actually — let me reconsider.** The `path` field in `WorkspaceResult` is documented as "Relative to SANDBOX_ROOT". For project files, the path relative to SANDBOX_ROOT is `workspace/projects/{projectId}/{filename}`. But `validateArtifact` checks `filePath.startsWith("upload/") || filePath.startsWith("workspace/")`. So `workspace/projects/...` would pass validation.

**Decision:** Project-scoped `path` fields will be relative to `SANDBOX_ROOT` (consistent with existing convention): `workspace/projects/{projectId}/{filename}`. This requires `validateArtifact` to accept `workspace/projects/` (which it already does, since it accepts any `workspace/...` prefix).

Wait — let me re-check `validateArtifact`:
```ts
passed: artifact.filePath.startsWith("upload/") || artifact.filePath.startsWith("workspace/"),
```
Yes — `workspace/projects/{projectId}/{filename}` starts with `workspace/`, so it passes. **No change to `validateArtifact` needed.** Good — that removes one file from the touched list.

**Revised touched list: `validation.ts` is NOT touched.**

### B2.4 No changes to existing functions

The existing `validatePath`, `read`, `write`, `patch`, `search`, `searchCode`, `list`, `stat`, `mkdir` functions are **completely unchanged**. They continue to handle the global `/upload/` and `/workspace/generated/` paths exactly as before.

---

## 5. Sub-Gate B3 — `projectId` Injection from System Context

### B3.1 The pattern (mirrors P1-A `conversationId` injection)

In P1-A, `tool-caller.ts` injects `_systemConversationId` into `memory_store` arguments:
```ts
if (request.name === "memory_store" && context.conversationId) {
  toolInput = {
    ...toolInput,
    conversationId: context.conversationId,
    _systemConversationId: context.conversationId,
  };
}
```

For P2-1, the same pattern applies to the 5 FS tools and `projectId`:
```ts
const FS_TOOLS = new Set(["file_read", "file_write", "file_search", "code_search", "patch"]);

if (FS_TOOLS.has(request.name) && context.projectId) {
  toolInput = {
    ...toolInput,
    _systemProjectId: context.projectId,  // System-injected; model cannot override
  };
}
```

### B3.2 `ToolCallContext` extension

```ts
export interface ToolCallContext {
  conversationId: string;
  taskId?: string;
  agentName: string;
  projectId?: string;  // NEW — optional, system-injected from Conversation.projectId
}
```

`projectId` is optional. When absent (conversation has no project link), the FS tools use the global `/upload/` path. When present, they use the project-scoped path.

### B3.3 Tool `execute` functions read `_systemProjectId`

Each of the 5 FS tools checks `input._systemProjectId` and routes accordingly:

```ts
// In file_write.execute:
const projectId = input._systemProjectId ? String(input._systemProjectId) : null;
if (projectId) {
  const result = await WorkspaceService.writeProjectFile(projectId, filename, content);
  // ... return result
} else {
  const result = await WorkspaceService.write(filename, content);  // existing global path
  // ... return result (unchanged)
}
```

**The model never sees `_systemProjectId`.** It's not in any tool's `inputSchema`. The tool-caller injects it from `context.projectId`. If the model tries to pass `projectId` in its arguments, it's ignored (only `_systemProjectId` is read, and that field is system-controlled).

### B3.4 Runtime looks up `Conversation.projectId`

In `executeTask`, after marking the task `in_progress`, look up the conversation's `projectId`:

```ts
// After line 130 (mark task in_progress)
let projectId: string | undefined;
if (conversationId) {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { projectId: true },
  });
  projectId = conv?.projectId ?? undefined;
}
```

Then pass `projectId` into:
- `toolCallContext` (line 169): `{ conversationId, taskId, agentName, projectId }`
- `executeResponse` context (line 332): `{ conversationId, taskId, agentName, projectId }`

### B3.5 `ExecutionContext` extension

```ts
// In types.ts
export interface ExecutionContext {
  conversationId: string;
  taskId?: string;
  agentName: AgentRole;
  userMessage: string;
  projectId?: string;  // NEW
  toolsUsed: string[];
  artifactsCreated: string[];
  memoriesWritten: string[];
  decisionsMade: string[];
}
```

### B3.6 `executeResponse` extension

```ts
// In execution-engine.ts
export async function executeResponse(
  content: string,
  context: { conversationId: string; taskId?: string; agentName: string; projectId?: string }
): Promise<ExecutionResult> {
  // ...
  for (let i = 0; i < blocks.length; i++) {
    // ...
    if (context.projectId) {
      // Project-scoped write
      const writeResult = await WorkspaceService.writeProjectFile(context.projectId, safeFilename, block.code);
      // filePath = writeResult.path (will be "workspace/projects/{projectId}/{filename}")
    } else {
      // Global write (existing behavior)
      const writeResult = await WorkspaceService.write(safeFilename, block.code);
      // filePath = writeResult.path (will be "upload/{filename}")
    }
    // ...
  }
}
```

---

## 6. Sub-Gate B4 — Filesystem Flow Migration Plan

### B4.1 Flows that gain project awareness (additive, not replacing)

| Flow | Current Path | Project-Scoped Path (when `projectId` present) |
|------|-------------|------------------------------------------------|
| `file_read` tool | `WorkspaceService.read(relPath)` | `WorkspaceService.readProjectFile(projectId, relPath)` |
| `file_write` tool | `WorkspaceService.write(filename, content)` | `WorkspaceService.writeProjectFile(projectId, filename, content)` |
| `file_search` tool | `WorkspaceService.search(pattern, max)` | `WorkspaceService.searchProject(projectId, pattern, max)` |
| `code_search` tool | `WorkspaceService.searchCode(query, max)` | `WorkspaceService.searchProjectCode(projectId, query, max)` |
| `patch` tool | `WorkspaceService.patch(filename, find, replace)` | `WorkspaceService.patchProjectFile(projectId, filename, find, replace)` |
| `executeResponse` (execution engine) | `WorkspaceService.write(safeFilename, code)` | `WorkspaceService.writeProjectFile(projectId, safeFilename, code)` |

### B4.2 Project lifecycle wiring

| Event | Action |
|-------|--------|
| `POST /api/projects` (create) | After DB insert, call `WorkspaceService.ensureProjectDir(project.id)`. If dir creation fails, log warning but don't fail the project creation (DB row exists; dir can be created lazily on first write). |
| `DELETE /api/projects/[id]` (delete) | Before DB delete, call `WorkspaceService.removeProjectDir(id)`. If dir removal fails, log warning but proceed with DB delete (don't block deletion on filesystem cleanup). |

### B4.3 What is NOT migrated in P2-1

- **File Tree UI (P2-2)** — not started. `listProjectTree` exists in WorkspaceService but no UI consumes it yet.
- **Multi-File Generation (P2-3)** — `executeResponse` already handles multiple code blocks; it just now routes them to the project workspace when `projectId` is present. No additional multi-file logic.
- **Code Editor (P2-4)** — not started.
- **File Versioning (P2-5)** — explicitly deferred. No `ProjectFile`/`FileVersion` models. No version recording.
- **Diff Viewer (P2-6)** — not started.

---

## 7. Sub-Gate B5 — Isolation + Regression Test Matrix

### B5.1 New test file: `tests/workspace-project-p2-1.test.ts`

**Target: ~60 assertions across 15+ test cases.**

#### Category A: Project ID validation (B1.2)
- A1: Valid CUID `projectId` accepted
- A2: Invalid `projectId` (contains `..`) rejected with `INVALID_PROJECT_ID`
- A3: Invalid `projectId` (empty) rejected with `INVALID_PROJECT_ID`
- A4: Invalid `projectId` (absolute path) rejected with `INVALID_PROJECT_ID`
- A5: Invalid `projectId` (uppercase) rejected with `INVALID_PROJECT_ID`
- A6: Invalid `projectId` (too short) rejected with `INVALID_PROJECT_ID`

#### Category B: Project isolation (B1.3) — **THE CRITICAL TESTS**
- B1: Project A cannot read Project B's files
- B2: Project A cannot write to Project B's directory
- B3: Project A cannot patch Project B's files
- B4: Project A's `searchProject` does not return Project B's files
- B5: Project A's `searchProjectCode` does not return Project B's code

#### Category C: Path traversal rejected (B1.3 Layer 3)
- C1: `../../../etc/passwd` rejected (escapes project root)
- C2: `../../other-project/file.txt` rejected (escapes to another project)
- C3: `./../` rejected
- C4: Absolute path `/etc/passwd` rejected with `ABSOLUTE_PATH`

#### Category D: Symlink escape rejected (B1.3 Layer 4-5)
- D1: Symlink inside project A pointing to project B's file → read rejected with `PROJECT_BOUNDARY_ESCAPE`
- D2: Symlink inside project A pointing to `/etc/passwd` → read rejected with `PROJECT_BOUNDARY_ESCAPE`
- D3: Symlink inside project A pointing to `../../upload/file.txt` → read rejected with `PROJECT_BOUNDARY_ESCAPE`

#### Category E: Blocked patterns still enforced (B1.3 Layer 6)
- E1: `.env` file in project rejected
- E2: `data.db` file in project rejected
- E3: `.git/config` path in project rejected
- E4: `node_modules/foo` path in project rejected

#### Category F: Read/write inside project works (B2.3)
- F1: `writeProjectFile` creates file in project root
- F2: `writeProjectFile` creates file in subdirectory (e.g., `src/index.ts`)
- F3: `readProjectFile` reads file written by `writeProjectFile`
- F4: `patchProjectFile` modifies existing file
- F5: `patchProjectFile` creates file if it doesn't exist
- F6: `listProjectTree` returns files written to project
- F7: `searchProject` finds files by name pattern
- F8: `searchProjectCode` finds text inside project files

#### Category G: Backward compatibility — `/upload/` still works (B1.4)
- G1: `WorkspaceService.write("test.txt", "content")` still writes to `/upload/test.txt`
- G2: `WorkspaceService.read("upload/test.txt")` still reads it
- G3: `WorkspaceService.search("test")` still finds `/upload/` files
- G4: `file_write` tool without `_systemProjectId` still writes to `/upload/`
- G5: `file_read` tool without `_systemProjectId` still reads from global paths
- G6: Conversation without `projectId` still produces artifacts in `/upload/`

#### Category H: Null bytes and input validation (B1.3 Layer 1)
- H1: Path with null byte rejected with `NULL_BYTE`
- H2: Empty path rejected with `EMPTY_PATH`

#### Category I: Project lifecycle (B4.2)
- I1: `ensureProjectDir` creates the project directory
- I2: `ensureProjectDir` is idempotent (calling twice doesn't error)
- I3: `removeProjectDir` removes the project directory
- I4: `ensureProjectDir` rejects invalid `projectId`

#### Category J: Tool routing (B3.3)
- J1: `file_write` with `_systemProjectId` writes to project directory
- J2: `file_write` with `_systemProjectId` does NOT write to `/upload/`
- J3: `file_write` without `_systemProjectId` writes to `/upload/` (backward compat)
- J4: `file_read` with `_systemProjectId` reads from project directory
- J5: `file_read` with `_systemProjectId` cannot read `/upload/` files (project-scoped only)

### B5.2 Regression: existing P1 test suites must still pass

All 7 existing P1 test suites (405 assertions) must continue to pass unchanged:
- `tests/tool-calling.test.ts` (57)
- `tests/workspace-b1.test.ts` (75)
- `tests/workspace-b2.test.ts` (54)
- `tests/workspace-b3.test.ts` (41)
- `tests/validation-p1c.test.ts` (46)
- `tests/task-graph-p1d.test.ts` (79)
- `tests/task-graph-integration-p1e.test.ts` (53)

These tests use the global `/upload/` path (no `projectId`), so they exercise the backward-compatibility path. If any of them fail, it means P2-1 broke the global API — which is a hard stop.

### B5.3 Browser/API smoke verification

After implementation:
1. **Simple chat (no project):** `POST /api/chat` "What is 2+2?" → must still work, artifacts still go to `/upload/`
2. **Autonomous mission (no project):** `POST /api/chat` autonomous → must still work, artifacts still go to `/upload/`
3. **Project-scoped autonomous mission:** Create a project → link a conversation to it → run autonomous mission → verify artifacts land in `/workspace/projects/{projectId}/`
4. **Project isolation:** Create two projects, run missions in both, verify files don't cross-contaminate

---

## 8. Security Analysis

### 8.1 The 6 existing security layers are preserved

| Layer | Global API (`validatePath`) | Project API (`validateProjectPath`) |
|-------|-----------------------------|-------------------------------------|
| 1. Input validation (empty, null bytes, absolute) | ✅ Unchanged | ✅ Same logic |
| 2. Path normalization | ✅ Unchanged | ✅ Same logic |
| 3. Path resolution | Against `SANDBOX_ROOT` | Against `PROJECTS_ROOT/{projectId}` (more restrictive) |
| 4. Symlink resolution (`fs.realpath`) | ✅ Unchanged | ✅ Same logic |
| 5. Boundary check | Against `READ_ROOTS`/`WRITE_ROOTS` | Against `PROJECTS_ROOT/{projectId}` (project-specific) |
| 6. Blocked patterns | ✅ Unchanged | ✅ Same patterns |

**Plus a new Layer 0 for the project API:** `projectId` format validation (CUID regex).

### 8.2 Project isolation guarantees

- **Project A cannot read Project B's files:** `validateProjectPath(A_id, "../B_id/file")` → `path.normalize` produces `../B_id/file` → `path.resolve(PROJECTS_ROOT, A_id, "../B_id/file")` resolves to `PROJECTS_ROOT/B_id/file` → boundary check fails (not within `PROJECTS_ROOT/A_id/`) → `PROJECT_BOUNDARY_ESCAPE` error.
- **Symlink escape to another project:** `fs.realpath` resolves the symlink to its target. If the target is in `PROJECTS_ROOT/B_id/`, the boundary check against `PROJECTS_ROOT/A_id/` fails → `PROJECT_BOUNDARY_ESCAPE`.
- **`projectId` traversal:** `projectId = "../B_id"` fails the CUID regex → `INVALID_PROJECT_ID` before any filesystem access.

### 8.3 No new `fs.*` calls in tools or runtime

- The 5 FS tools continue to call `WorkspaceService.*` (or `WorkspaceService.*ProjectFile`) — no direct `fs.*`.
- `execution-engine.ts` continues to call `WorkspaceService.write` or `WorkspaceService.writeProjectFile` — no direct `fs.*`.
- `runtime.ts` does not touch the filesystem.
- The only `fs.*` calls are inside `workspace.ts` itself (which is the canonical authority).

### 8.4 Model cannot control `projectId`

- `projectId` is NOT in any tool's `inputSchema`.
- `projectId` is injected as `_systemProjectId` by `tool-caller.ts` from `context.projectId`.
- `context.projectId` comes from `Conversation.projectId` (DB lookup), not from the request body.
- If the model passes `projectId` in tool arguments, it's ignored (only `_systemProjectId` is read).
- Same security property as `conversationId` in P1-A.

### 8.5 No bypass of WorkspaceService

- The 5 FS tools are the only model-accessible path to the filesystem.
- `executeResponse` (execution engine) is the only other path, and it also goes through WorkspaceService.
- No new API routes expose raw filesystem access in P2-1.
- The `/api/projects` POST and DELETE routes call `WorkspaceService.ensureProjectDir` / `removeProjectDir` — they do NOT call `fs.*` directly.

---

## 9. Database Migration Requirements

**NONE.**

- No new Prisma models.
- No schema changes to `Conversation` or `Project` (both already have the needed fields).
- `Conversation.projectId` already exists (`String?`, FK to `Project`, `onDelete: SetNull`).
- No `bun run db:push` needed.

---

## 10. What Is Explicitly NOT Implemented in P2-1

| Item | Why Not |
|------|---------|
| File Tree UI component | P2-2 (next phase, after P2-1 approval) |
| `/api/workspace/tree` route | P2-2 |
| Code Editor component | P2-4 |
| Multi-file generation logic | `executeResponse` already handles multiple blocks; P2-1 only adds project routing, not multi-file logic |
| `ProjectFile` model | P2-5 (explicitly deferred per user instruction) |
| `FileVersion` model | P2-5 (explicitly deferred) |
| File versioning | P2-5 (explicitly deferred) |
| Diff Viewer | P2-6 |
| Prisma migration | None needed |
| Tool schema changes | None (projectId is system-injected) |
| Agent prompt changes | None |
| Changes to `validatePath` or existing WorkspaceService functions | None (additive only) |
| Changes to TaskGraphService | None |
| Changes to ValidationService | None (`workspace/projects/...` already passes the `startsWith("workspace/")` check) |
| Changes to the autonomous runtime loop | None (only `executeTask` gains a `projectId` lookup) |
| UI changes | None |
| New API routes for file access | None (file access stays through tools + execution engine) |

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `validateProjectPath` has a boundary-check bug allowing cross-project access | Low | Critical | Test category B (5 isolation tests) specifically targets this. Also, the boundary check logic is identical to the proven `validatePath` logic, just with a different root. |
| Backward compatibility break (global `/upload/` path stops working) | Low | High | Test category G (6 regression tests) verifies global path still works. All 405 existing P1 assertions must pass unchanged. |
| `projectId` injection fails silently (model can write to global `/upload/` from a project context) | Medium | Medium | Test category J (5 routing tests) verifies tools route correctly when `_systemProjectId` is present. |
| Project directory not created when Project DB row is created | Medium | Low | `ensureProjectDir` is idempotent and called on Project create. `writeProjectFile` also calls `fs.mkdir(dir, { recursive: true })` on the parent, so the directory is created lazily on first write even if `ensureProjectDir` was never called. |
| Symlink escape not detected | Low | Critical | Test category D (3 symlink tests) creates real symlinks and verifies rejection. `fs.realpath` is the proven mechanism from `validatePath`. |
| `projectId` format regex is too strict (rejects valid CUIDs) | Low | Low | Test category A verifies valid CUIDs pass. The regex `/^c[a-z0-9]{20,31}$/` matches Prisma's CUID2 output (24 chars, starts with `c`). |

**Overall risk: LOW.** The design is purely additive — no existing function signature changes, no schema migration, no UI changes. The worst-case failure mode is "project files land in the wrong directory," which is testable and reversible.

---

## 12. Implementation Order (within P2-1)

Following the user's recommended sequence:

```
B1 (Project path contract)           — define PROJECTS_ROOT, isValidProjectId, validateProjectPath
  │   (no behavior change yet — just new functions in workspace.ts)
  ▼
B2 (WorkspaceService project-aware)  — add ensureProjectDir, readProjectFile, writeProjectFile,
  │   patchProjectFile, listProjectTree, searchProject, searchProjectCode
  │   (still no behavior change — functions exist but aren't called)
  ▼
B3 (projectId injection)             — add projectId to ToolCallContext, ExecutionContext,
  │   ExecuteTaskInput; inject _systemProjectId in tool-caller; look up Conversation.projectId
  │   in runtime; pass projectId to executeResponse
  │   (now project-scoped routing works end-to-end)
  ▼
B4 (Migrate filesystem flows)        — update the 5 FS tools to read _systemProjectId and route;
  │   update execution-engine to use writeProjectFile when projectId present;
  │   wire /api/projects POST/DELETE to ensureProjectDir/removeProjectDir
  ▼
B5 (Isolation + regression tests)    — add tests/workspace-project-p2-1.test.ts;
      run all existing P1 tests (must pass unchanged);
      run browser/API smoke tests
```

**Each sub-gate is independently verifiable:**
- After B1+B2: new functions exist, no behavior change, all 405 P1 tests pass.
- After B3: `projectId` flows through context but tools don't use it yet (still global path).
- After B4: project-scoped routing works end-to-end.
- After B5: isolation and regression proven.

---

## 13. Acceptance Criteria for P2-1 Gate

- [ ] All 60+ new P2-1 test assertions pass (isolation + regression)
- [ ] All 405 existing P1 assertions pass unchanged
- [ ] `bun run lint` clean
- [ ] `bunx tsc --noEmit` clean (source + tests)
- [ ] Simple chat (no project) still works — artifacts in `/upload/`
- [ ] Autonomous mission (no project) still works — artifacts in `/upload/`
- [ ] Project-scoped autonomous mission works — artifacts in `/workspace/projects/{projectId}/`
- [ ] Project A cannot access Project B's files (verified by test + manual)
- [ ] Path traversal rejected (verified by test)
- [ ] Symlink escape rejected (verified by test)
- [ ] Blocked files rejected in project context (verified by test)
- [ ] No Prisma migration performed
- [ ] No tool schema changes
- [ ] No UI changes
- [ ] No new API routes (except the existing `/api/projects` POST/DELETE gaining WorkspaceService calls)

---

## 14. Open Questions for User Approval

Before implementation begins, please confirm:

1. **Project root location:** `/home/z/my-project/workspace/projects/{projectId}/` — acceptable?
2. **`projectId` validation regex:** `/^c[a-z0-9]{20,31}$/` (matches Prisma CUID2) — acceptable?
3. **Backward compatibility approach:** when `projectId` is absent, ALL operations use the existing global `/upload/` path (no behavior change for non-project conversations) — acceptable?
4. **Tool schema preservation:** the 5 FS tool schemas remain unchanged; `projectId` is injected as `_systemProjectId` (system-controlled, model cannot set) — acceptable?
5. **Project directory lifecycle:** `POST /api/projects` calls `ensureProjectDir`; `DELETE /api/projects/[id]` calls `removeProjectDir`. If filesystem ops fail, DB op still proceeds (filesystem is best-effort, not transactional) — acceptable?
6. **No `validateArtifact` change:** project-scoped `Artifact.filePath` will be `workspace/projects/{projectId}/{filename}`, which already passes the `startsWith("workspace/")` check — acceptable?
7. **Test target:** ~60 new assertions in `tests/workspace-project-p2-1.test.ts` covering the 10 categories (A-J) listed in §7 — acceptable?
8. **No UI work in P2-1:** File Tree UI (P2-2) is a separate phase — acceptable?

---

## 15. P2-1 B0 Gate Decision

**Ready to implement upon explicit approval.**

The design is purely additive, preserves all P1 security properties, requires no database migration, changes no tool schemas, and breaks no existing behavior. The `projectId` injection mirrors the proven `conversationId` pattern from P1-A. Project isolation is enforced at the `validateProjectPath` boundary, which uses the same 6-layer security model as the existing `validatePath`, plus a new Layer 0 for `projectId` format validation.

**Awaiting explicit user approval to begin P2-1 implementation (starting with B1).**

Do NOT start implementation without approval.

Do NOT modify source code.

Stop here and wait.
