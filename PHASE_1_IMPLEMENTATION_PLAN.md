# Phase 1 — Canonical Tool + Workspace Execution Implementation Plan

> 7 tasks. Duration: 2-3 weeks. Risk: Medium.
> Goal: Make tools actually work, create WorkspaceService, add validation.

---

## P1-1: Implement Two-Phase Tool Calling

- **Task ID**: P1-1
- **Objective**: Replace dead `parseToolCalls()` with working tool calling
- **Reason**: `parseToolCalls()` at `runtime.ts:36-62` uses regex that never matches model output. All 10 tools are unreachable.
- **Approach**: Two-phase model call (ZAI SDK v0.0.18 has no native function-calling API)
  1. Phase 1: Model generates response
  2. Post-response: Scan for intent patterns ("I'll search for X", "Let me read file Y")
  3. If intent detected: Execute tool
  4. Phase 2: Feed tool result back to model for synthesis
- **Files affected**:
  - `src/lib/ai/runtime.ts` — replace `parseToolCalls()` with `detectToolIntent()`
  - NEW `src/lib/ai/tool-caller.ts` — tool intent detection + execution
- **New files**: `src/lib/ai/tool-caller.ts`
- **DB impact**: None
- **Dependencies**: P0 complete (GATE 1)
- **Prerequisites**: None
- **Implementation sequence**:
  1. Create `tool-caller.ts` with `detectToolIntent(content: string): ToolIntent[]`
  2. Intent patterns:
     - "search for X" / "look up X" / "find info about X" → web_search
     - "read file X" / "open file X" → file_read
     - "write file X" / "create file X" → file_write
     - "remember X" / "store memory X" → memory_store
  3. Replace `parseToolCalls()` call in `executeTask()` with `detectToolIntent()`
  4. Execute detected tools, feed results back via follow-up model call
  5. Keep old `parseToolCalls()` as dead code until P1 verified (rollback safety)
- **Acceptance criteria**: 
  - When model says "let me search for React 19", `web_search` executes
  - Tool results appear in UI (tool event in SSE)
  - Model synthesizes tool results into final response
- **Tests**:
  1. Send "search for latest AI news" → verify web_search executes
  2. Send "read file src/lib/ai/model.ts" → verify file_read executes
  3. Send "what is 2+2" → verify NO tool executes (simple question)
- **UI verification**: Tool activity panel shows tool execution in browser
- **find-bugs**: Run after implementation
- **Risk**: Medium — changes core execution flow
- **Rollback**: Revert to `parseToolCalls()` (dead but safe)
- **Complexity**: Medium (4-6 hours)

---

## P1-2: Create WorkspaceService

- **Task ID**: P1-2
- **Objective**: All file operations go through workspace layer
- **Reason**: Current tools directly manipulate filesystem with no project scoping, no versioning, no path validation
- **Files affected**: NEW `src/lib/ai/workspace.ts`
- **New files**: `src/lib/ai/workspace.ts`
- **DB impact**: None (P2 adds ProjectFile/FileVersion)
- **Dependencies**: P0 complete
- **Prerequisites**: None
- **Implementation sequence**:
  1. Create `WorkspaceService` class with methods:
     - `readFile(projectId: string | null, path: string): Promise<FileContent>`
     - `writeFile(projectId: string | null, path: string, content: string): Promise<File>`
     - `editFile(projectId: string | null, path: string, edits: Edit[]): Promise<File>`
     - `patchFile(projectId: string | null, path: string, find: string, replace: string): Promise<File>`
     - `deleteFile(projectId: string | null, path: string): Promise<void>`
     - `renameFile(projectId: string | null, oldPath: string, newPath: string): Promise<File>`
     - `createDir(projectId: string | null, path: string): Promise<void>`
     - `listDir(projectId: string | null, path: string): Promise<DirEntry[]>`
     - `searchFiles(projectId: string | null, pattern: string): Promise<FileMatch[]>`
     - `searchCode(projectId: string | null, query: string): Promise<CodeMatch[]>`
  2. Path validation:
     - Block: `.env`, `*.db`, `.git/**`, `node_modules/**`
     - Allow: `src/`, `upload/`, `prisma/`, `public/`, `workspace/`
     - Block path traversal: `..` in paths
  3. Project scoping:
     - If projectId provided: operate in `/workspace/projects/{projectId}/`
     - If null: operate in `/upload/` (backward compatible)
  4. Create workspace directory structure on first use
- **Acceptance criteria**:
  - `WorkspaceService.readFile(null, "upload/test.html")` works (backward compatible)
  - `WorkspaceService.readFile("proj1", "src/index.ts")` works (project scoped)
  - `WorkspaceService.readFile(null, ".env")` throws error (blocked)
- **Tests**:
  1. Write file → verify on disk
  2. Read file → verify content
  3. Read .env → verify error
  4. Path traversal attempt → verify error
- **UI verification**: N/A (backend only)
- **find-bugs**: Run after implementation
- **Risk**: Low — new file, no existing code changed
- **Rollback**: Delete `workspace.ts`
- **Complexity**: Medium (3-4 hours)

---

## P1-3: Migrate Tools to WorkspaceService

- **Task ID**: P1-3
- **Objective**: Tools call WorkspaceService instead of direct filesystem
- **Reason**: Tools should not be an uncontrolled second filesystem API
- **Files affected**: `src/lib/ai/tools/index.ts` (file_read, file_write, patch, file_search, code_search)
- **New files**: None
- **DB impact**: None
- **Dependencies**: P1-2 (WorkspaceService must exist)
- **Prerequisites**: None
- **Implementation sequence**:
  1. `file_read.execute()` → call `WorkspaceService.readFile()` instead of `fs.readFile()`
  2. `file_write.execute()` → call `WorkspaceService.writeFile()` instead of `fs.writeFile()`
  3. `patch.execute()` → call `WorkspaceService.patchFile()` instead of direct `fs`
  4. `file_search.execute()` → call `WorkspaceService.searchFiles()` instead of `walkDir()`
  5. `code_search.execute()` → call `WorkspaceService.searchCode()` instead of `walkDir()`
  6. Add optional `projectId` to tool input schemas
  7. Keep backward compatibility: if no projectId, use `/upload/`
- **Acceptance criteria**:
  - Tools still work when called without projectId (backward compatible)
  - Tools work with projectId (project scoped)
  - Path validation enforced by WorkspaceService
- **Tests**:
  1. `file_write({ filename: "test.html", content: "..." })` → creates in /upload/
  2. `file_read({ path: "upload/test.html" })` → reads from /upload/
  3. `file_read({ path: ".env" })` → error (blocked by WorkspaceService)
- **UI verification**: N/A (tools not yet reachable, but will be after P1-1)
- **find-bugs**: Run after migration
- **Risk**: Low — wrapping, not replacing
- **Rollback**: Revert to direct fs calls
- **Complexity**: Low (2 hours)

---

## P1-4: Add Missing File Tools

- **Task ID**: P1-4
- **Objective**: Add file_edit, file_delete, file_rename, dir_create, dir_list tools
- **Reason**: Current tools only support read/write/patch. Missing edit/delete/rename/mkdir/listdir.
- **Files affected**: `src/lib/ai/tools/index.ts` (add 5 new tools)
- **New files**: None
- **DB impact**: None
- **Dependencies**: P1-2 (WorkspaceService), P1-3 (tool migration)
- **Prerequisites**: None
- **Implementation sequence**:
  1. `file_edit` — edit specific lines (line numbers + new content)
  2. `file_delete` — delete a file
  3. `file_rename` — rename/move a file
  4. `dir_create` — create a directory
  5. `dir_list` — list directory contents
  6. All use WorkspaceService for filesystem operations
  7. All have path validation (via WorkspaceService)
- **Acceptance criteria**: All 5 tools execute correctly through WorkspaceService
- **Tests**: Test each tool individually
- **Risk**: Low
- **Rollback**: Remove new tools
- **Complexity**: Low (2 hours)

---

## P1-5: Add Validation Phase

- **Task ID**: P1-5
- **Objective**: Tasks validate output before marking complete
- **Reason**: `runtime.ts:482-491` marks task `completed` immediately. No validation.
- **Files affected**:
  - `src/lib/ai/runtime.ts:482-491` — add validation before `completed`
  - NEW `src/lib/ai/validation.ts` — validation functions
- **New files**: `src/lib/ai/validation.ts`
- **DB impact**: None
- **Dependencies**: P1-1 (tool calling — tools may be needed for validation)
- **Prerequisites**: None
- **Implementation sequence**:
  1. Create `validation.ts` with validation functions:
     - `validateContent(content: string, expectedOutput?: string): ValidationResult`
     - `validateFile(path: string): ValidationResult` (check file exists, non-empty)
     - `validateCodeSyntax(content: string, lang: string): ValidationResult`
  2. In `executeTask()`, before marking `completed`:
     ```
     const validation = await validateContent(responseContent, task.expectedOutput);
     if (!validation.passed) {
       task.status = "failed";
       task.completionNotes = validation.reason;
     } else {
       task.status = "completed";
     }
     ```
  3. Emit `validation` event via SSE
- **Acceptance criteria**:
  - Task with `expectedOutput` is validated before completion
  - Failed validation marks task as `failed` with reason
  - Validation event appears in timeline
- **Tests**:
  1. Task with expectedOutput "HTML file" → if no HTML generated → task fails
  2. Task with expectedOutput "code" → if code generated → task passes
  3. Task with no expectedOutput → always passes (backward compatible)
- **UI verification**: Timeline panel shows validation phase
- **find-bugs**: Run after implementation
- **Risk**: Medium — may cause previously "completed" tasks to now "fail"
- **Rollback**: Remove validation, always mark completed
- **Complexity**: Medium (3-4 hours)

---

## P1-6: Fix Autonomous Mode Task Dependencies

- **Task ID**: P1-6
- **Objective**: Tasks execute in dependency order (DAG), not just linear
- **Reason**: `dependencies` field exists in Task model but is never used. Tasks execute in `executionOrder` only.
- **Files affected**: `src/lib/ai/runtime.ts:runAutonomousLoop` (line 635-708)
- **New files**: None
- **DB impact**: None (dependencies field already exists)
- **Dependencies**: P1-5 (validation — tasks should validate before dependents start)
- **Prerequisites**: None
- **Implementation sequence**:
  1. Parse `dependencies` field (JSON array of task IDs)
  2. Build dependency graph
  3. Topological sort to determine execution order
  4. Execute tasks in topological order
  5. If task fails, mark dependents as `blocked`
  6. If task has no dependencies, can execute in parallel (future P4-4)
- **Acceptance criteria**:
  - Task B with dependency on Task A waits for A to complete
  - If A fails, B is marked `blocked`
  - Tasks with no dependencies execute in original order
- **Tests**:
  1. Create plan: Task A → Task B (B depends on A)
  2. Verify B doesn't start until A completes
  3. If A fails, verify B is blocked
- **UI verification**: Tasks panel shows dependency relationships
- **find-bugs**: Run after implementation
- **Risk**: Medium — changes autonomous execution flow
- **Rollback**: Revert to linear execution
- **Complexity**: Medium (3-4 hours)

---

## P1-7: Remove parseToolCalls (after P1-1 verified)

- **Task ID**: P1-7
- **Objective**: Remove dead `parseToolCalls()` after new tool calling is verified
- **Reason**: Dead code cleanup — `parseToolCalls()` replaced by `detectToolIntent()` in P1-1
- **Files affected**: `src/lib/ai/runtime.ts:36-62`
- **Dependencies**: P1-1 (must be verified working)
- **Prerequisites**: P1-1 tests pass, tool calling works in browser
- **Implementation sequence**:
  1. Verify P1-1 is working (tools execute in browser)
  2. Remove `parseToolCalls()` function
  3. Remove `ParsedToolCall` interface
  4. Run lint, build, test
- **Acceptance criteria**: Dead code removed, everything still works
- **Risk**: Low (after verification)
- **Rollback**: Git revert
- **Complexity**: Trivial (15 minutes)

---

## Phase 1 Completion Criteria (GATE 2)

- [ ] Two-phase tool calling works (web_search executes when model wants to search)
- [ ] WorkspaceService created with path validation
- [ ] All existing tools migrated to WorkspaceService
- [ ] Missing file tools added (edit, delete, rename, mkdir, listdir)
- [ ] Validation phase prevents invalid task completion
- [ ] Task dependencies respected in autonomous mode
- [ ] Dead `parseToolCalls()` removed
- [ ] find-bugs run, critical findings fixed
- [ ] Dev server runs without errors
- [ ] Chat + tools + preview all work
