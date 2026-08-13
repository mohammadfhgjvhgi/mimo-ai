# P2 Pre-Implementation Review

> **READ-ONLY.** No source code modified. No P2 work started.
> Source of truth: actual post-P1 source code (`src/lib/ai/*`) + `P1_FINAL_GATE_REPORT.md` + `PHASE_2_IMPLEMENTATION_PLAN.md` + `MASTER_ROADMAP.md`.
> The original P2 plan predates P1-A through P1-E. P1 architecture has changed substantially. This review re-evaluates every P2 task against the actual current code.

---

## 1. P2 Current State

### What exists RIGHT NOW (verified in source)

| Area | State | File |
|------|-------|------|
| **WorkspaceService** | ✅ Canonical FS authority. 6-layer path validation. Operations: `read`, `write`, `search`, `searchCode`, `patch`, `list`, `stat`, `mkdir`. Constants: `WORKSPACE_ROOT=/home/z/my-project/workspace`, `SANDBOX_ROOT=/home/z/my-project`, `UPLOAD_DIR=/home/z/my-project/upload`, `GENERATED_DIR=/home/z/my-project/workspace/generated`. Read roots: workspace, upload, src, prisma, public. Write roots: upload, generated. | `src/lib/ai/workspace.ts` |
| **Native tool calling** | ✅ ZAI SDK native function calling. `tool-caller.ts` is the single source of truth. Schema generation, arg validation, permission check, execute, format results. Max 5 tool calls/turn. | `src/lib/ai/tool-caller.ts` |
| **ValidationService** | ✅ 4-layer deterministic validation (tool / workspace / artifact / task). GATES task completion — model claim never sufficient. 30+ checks. | `src/lib/ai/validation.ts` |
| **TaskGraphService** | ✅ DAG with DFS cycle detection (white-gray-black), Kahn topological sort, ready/blocked calculation, cascade blocking. | `src/lib/ai/task-graph.ts` |
| **Autonomous runtime** | ✅ `runAutonomousLoop()` uses graph-based execution: plan with dependencies → 2-pass persist → createTaskGraph → validateGraph → loop getReadyTasks → executeTask → updateTaskStatus → getNewlyReadyTasks/blockDependentTasks. Linear `executionOrder` loop REMOVED. Sequential execution (no parallelism). `maxIterations = N+1` safety. `executedTaskIds` Set prevents duplicates. | `src/lib/ai/runtime.ts:556-856` |
| **Execution engine** | ✅ Parses code blocks from model response, writes files via WorkspaceService.write, creates `Artifact` rows with `filePath` populated. Single-file focus currently (filenames derived from language or hint). | `src/lib/ai/execution-engine.ts` |
| **Prisma schema** | 11 models. `Task.dependencies` is `String?` (JSON array). `Artifact.filePath` is `String?`. `Project` model exists with `name`, `description`, `type`, `goals`, `techStack`, `requirements`, `status`. `Conversation.projectId` exists (`String?`). `KnowledgeEntity` + `KnowledgeRelation` exist but unused. **No `ProjectFile` or `FileVersion` models.** | `prisma/schema.prisma` |
| **Project API** | GET/POST `/api/projects`, GET/PATCH/DELETE `/api/projects/[id]`. **Pure CRUD. No filesystem integration.** Creating a project does NOT create a workspace directory. | `src/app/api/projects/` |
| **Project UI** | `ProjectsPanel` exists. Lists projects, create form (name/description/type), delete. **No file tree, no editor, no link to conversations.** Uses `bg-indigo-500/20` for project icon (violates the "no indigo/blue" rule but is pre-existing). | `src/components/mimo/projects-panel.tsx` |
| **Workspace UI** | `Workspace` component with 11 panels (chat, preview, tasks, agents, artifacts, memory, decisions, timeline, skills, tools, projects). Side panel is fixed-width 380px. **No file-tree panel, no code-editor panel.** | `src/components/mimo/workspace.tsx` |
| **Inline preview** | `InlinePreview` shows iframe in chat bubble. `sandbox="allow-scripts"` (no `allow-same-origin`). Code/preview toggle, refresh, open-external. | `src/components/mimo/inline-preview.tsx` |
| **Artifacts panel** | Lists artifacts (code/document/research_report/etc). Click → dialog viewer. No file path awareness, no version history. | `src/components/mimo/artifacts-panel.tsx` |
| **Tasks panel** | Shows mission progress bar + task cards with status icon, agent badge, priority. **Does NOT show task dependencies (no DAG visualization).** | `src/components/mimo/tasks-panel.tsx` |
| **Memory** | Conversation-scoped retrieval (fixed in P1-A). 9 memory types. `memory_store` tool always writes `scope: "conversation"` (system-controlled). | `src/lib/ai/memory.ts` |
| **Test infrastructure** | 7 test files, 405 assertions, all unit-level. Bun runner. **No E2E/integration tests.** Test cleanup is fragile (test 18 in tool-calling leaks orphaned rows on failure). | `tests/*.test.ts` |
| **Available deps** | `react-syntax-highlighter@^15.6.1` is installed. No Monaco, no CodeMirror, no `diff` lib. `shadcn/ui` resizable component exists. | `package.json` |

### What does NOT exist

- ❌ Per-project workspace directory (currently all writes go to global `/upload/`)
- ❌ File tree UI component
- ❌ Code editor component
- ❌ Diff viewer component
- ❌ `ProjectFile` / `FileVersion` Prisma models
- ❌ Multi-file generation in `executeResponse` (it handles multiple code blocks but writes them all to the global upload dir, not to a project workspace)
- ❌ Task dependency visualization in Tasks panel
- ❌ Any link between `Project` and the filesystem
- ❌ E2E test infrastructure

---

## 2. Original P2 Roadmap (from `PHASE_2_IMPLEMENTATION_PLAN.md`)

| ID | Task | Original Objective | Original Deps | Original Risk |
|----|------|---------------------|---------------|---------------|
| P2-1 | Project Workspace Directory | `/workspace/projects/{projectId}/` per project | P1-2 (WorkspaceService) | Low |
| P2-2 | File Tree UI | Tree view of project files | P2-1 | Low |
| P2-3 | Multi-File Project Generation | AI generates HTML+CSS+JS in one response | P2-1 | Low |
| P2-4 | Code Editor Integration | View/edit files with syntax highlighting | P2-2 | Low |
| P2-5 | File Versioning | Track versions, enable rollback | P2-1, P1-2 | Medium (DB migration) |
| P2-6 | Diff Viewer | Show before/after diff | P2-5 | Low |

**Gate criteria:** project workspace, file tree, multi-file gen, code editor, versioning, diff viewer, find-bugs run.

---

## 3. Task-by-Task Classification

### P2-1: Project Workspace Directory → **MODIFY**

**Original:** Create `/workspace/projects/{projectId}/` on project create; delete on project delete; add `getProjectTree()` to WorkspaceService.

**Why MODIFY (not KEEP):**
- The directory concept is still required, BUT:
  1. WorkspaceService already has `WORKSPACE_ROOT=/home/z/my-project/workspace` and `GENERATED_DIR=/home/z/my-project/workspace/generated`. The P2 plan's path `/workspace/projects/{id}/` is relative to project root, which conflicts with the existing `WORKSPACE_ROOT` constant. **Must use `path.join(WORKSPACE_ROOT, "projects", projectId)` instead.**
  2. WorkspaceService's `WRITE_ROOTS` currently only allows `UPLOAD_DIR` and `GENERATED_DIR`. **Must add the per-project directory to `WRITE_ROOTS` dynamically** (or change the validation model to accept a `projectId` parameter).
  3. `READ_ROOTS` must also be extended, otherwise `file_read` cannot read project files.
  4. The `write()` function currently has special-cased logic: "if no path separators, prepend `upload/`". This backward-compat hack **must be removed or made project-aware**, otherwise project files collide with global upload files of the same name.
  5. `validatePath()` resolves against `SANDBOX_ROOT` and checks against fixed root arrays. **Project-scoped paths need a different validation path** — likely a `validateProjectPath(projectId, relPath, mode)` overload.
  6. The Project API (`/api/projects/route.ts` POST and `/api/projects/[id]/route.ts` DELETE) must call WorkspaceService to create/remove directories. Currently they are pure DB CRUD.

**Required redesign:**
- Add `WorkspaceService.getProjectRoot(projectId): string`
- Add `WorkspaceService.ensureProjectDir(projectId): Promise<void>`
- Add `WorkspaceService.removeProjectDir(projectId): Promise<void>`
- Add `WorkspaceService.readProjectFile(projectId, relPath)` / `writeProjectFile` / `listProjectTree` / `patchProjectFile`
- Extend `READ_ROOTS` / `WRITE_ROOTS` to include project roots (computed dynamically)
- Wire `/api/projects` POST → `ensureProjectDir`; DELETE → `removeProjectDir`
- Update `Conversation.projectId` usage: when a conversation has a `projectId`, file tools should target that project's workspace

**Risk:** Medium (was Low). The WorkspaceService boundary is the most security-critical code in the system. Any mistake in path validation could allow cross-project file access or sandbox escape.

---

### P2-2: File Tree UI → **KEEP**

**Original:** New `file-tree.tsx` component, new `/api/workspace/tree?projectId=` route, add as panel.

**Why KEEP:**
- Still required and valuable.
- No architectural conflict with P1.
- shadcn/ui has no tree component, so a custom one is needed (or use a lib like `react-arborist`).
- The `/api/workspace/tree` route should call `WorkspaceService.listProjectTree(projectId)` (which depends on P2-1).

**Minor adjustment:** The original plan says "add as panel" — but the existing `Workspace` component has 11 panels in a fixed 380px sidebar. Adding a 12th panel will overcrowd. **Recommendation: make File Tree a sub-view of the Projects panel, or replace the Projects panel with a combined Project+Files panel.** Alternatively, introduce a resizable split layout (P5-1) earlier.

**Risk:** Low (unchanged).

---

### P2-3: Multi-File Project Generation → **MODIFY**

**Original:** Extend `executeResponse()` to handle multiple code blocks with filenames, write each to project workspace.

**Why MODIFY (not KEEP):**
- `executeResponse()` **already handles multiple code blocks** (the for-loop at `execution-engine.ts:168`). The original plan assumed it didn't.
- What it does NOT do: write to a **project-scoped** directory. It writes everything to global `/upload/` via `WorkspaceService.write(safeFilename, block.code)`.
- The filename hint detection regex (`execution-engine.ts:57-59`) is fragile — it looks for "create|write|save|file|ملف|أنشئ|اكتب" before the code block. This works but is not robust.
- **Required change:** Add an optional `projectId` to the `executeResponse` context. When present, route writes through `WorkspaceService.writeProjectFile(projectId, filename, content)` instead of `WorkspaceService.write(filename, content)`.
- **Required change:** The runtime's `executeTask()` must pass `ctx.projectId` (from the conversation's `projectId`) down to `executeResponse()`.
- **ValidationService impact:** `validateArtifact()` checks `filePath.startsWith("upload/") || filePath.startsWith("workspace/")`. **Must add `projects/` as a valid prefix** or the versioning validation will fail.

**Risk:** Low (was Low). The change is additive — existing single-file generation continues to work for non-project conversations.

---

### P2-4: Code Editor Integration → **KEEP (with constraint)**

**Original:** New `code-editor.tsx`, use `react-syntax-highlighter` (already installed) for viewing, textarea + save via WorkspaceService for editing.

**Why KEEP:**
- Still required and valuable.
- `react-syntax-highlighter@^15.6.1` is installed.
- shadcn/ui has no editor component; a custom one is appropriate.

**Constraint — Monaco/CodeMirror decision:**
- The original plan says "use react-syntax-highlighter for viewing, textarea for editing". This is the **minimum viable** approach.
- A real code editor (Monaco or CodeMirror) would be much better UX but adds a heavy dependency (~2MB for Monaco).
- **Recommendation:** Start with the MVP (syntax highlighter + textarea). Defer Monaco/CodeMirror to P5 (Advanced UX). Do NOT introduce Monaco in P2.

**Constraint — save path:**
- Editing must go through a new `/api/workspace/file?projectId=&path=` route that calls `WorkspaceService.writeProjectFile()` or `patchProjectFile()`. **Must NOT bypass WorkspaceService.**

**Risk:** Low (unchanged).

---

### P2-5: File Versioning → **MODIFY**

**Original:** Add `ProjectFile` and `FileVersion` Prisma models. Update WorkspaceService to create version on every write. Add `getFileHistory()`, `revertFile()`, `diffVersions()`.

**Why MODIFY (not KEEP):**
- The models are still needed, BUT:
  1. **WorkspaceService is currently stateless** — it does not record writes anywhere. Adding versioning means every `write()` and `patch()` must also create a `ProjectFile` row (if new) or increment `version` and create a `FileVersion` row. This is a **fundamental change to WorkspaceService's contract** — it goes from pure FS operations to FS + DB.
  2. The original plan's `ProjectFile` schema is minimal. **Must add**: `conversationId?` (which conversation created this version), `agentName?` (which agent), `taskId?` (which task), `artifactId?` (link to Artifact table for AI-generated files). This enables provenance tracking.
  3. **Conflict with existing `Artifact` model:** `Artifact` already stores `content`, `filePath`, `sizeBytes`, `version` (Int, default 1). There is overlap between `Artifact` and `ProjectFile`/`FileVersion`. **Decision required:** (a) merge Artifact into ProjectFile, (b) keep both with Artifact as AI-generated-only and ProjectFile as user-edited-only, or (c) make ProjectFile the canonical file record and Artifact a view onto it. **Recommendation: option (c)** — Artifact becomes a thin link to ProjectFile + AI-specific metadata (agent, prompt, task).
  4. `validateArtifact()` in ValidationService checks `filePath.startsWith("upload/") || filePath.startsWith("workspace/")`. **Must add `projects/` prefix.**
  5. The `diff` tool already exists in `tools/index.ts:371-419` (line-by-line diff). `diffVersions()` can reuse this logic.

**Required redesign:**
- New Prisma models:
  ```prisma
  model ProjectFile {
    id          String   @id @default(cuid())
    projectId   String
    path        String   // relative to project root
    currentHash String
    version     Int      @default(1)
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt
    versions    FileVersion[]
    @@unique([projectId, path])
    @@index([projectId])
  }
  model FileVersion {
    id             String   @id @default(cuid())
    fileId         String
    version        Int
    content        String
    hash           String
    sizeBytes      Int
    conversationId String?  // provenance
    taskId         String?  // provenance
    agentName      String?  // provenance
    artifactId     String?  // link to Artifact if AI-generated
    createdAt      DateTime @default(now())
    file           ProjectFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
    @@index([fileId])
    @@index([version])
  }
  ```
- WorkspaceService gains a `recordVersion` internal step on every write/patch when a `projectId` is in context.
- `getFileHistory(projectId, path)`, `revertFile(projectId, path, version)`, `diffVersions(v1, v2)` methods.

**Risk:** Medium-High (was Medium). The DB migration is straightforward, but the WorkspaceService contract change is significant. Must ensure non-project conversations (which use the global `/upload/` dir) still work without versioning.

---

### P2-6: Diff Viewer → **KEEP**

**Original:** New `diff-viewer.tsx`, use existing `diff` tool logic, show added/removed/changed lines.

**Why KEEP:**
- Still required and valuable.
- The `diff` tool at `tools/index.ts:371-419` already has line-by-line diff logic that can be extracted into a shared utility.
- No new heavy dependency needed (avoid `react-diff-viewer` unless we want side-by-side; for P2, inline diff is sufficient).

**Risk:** Low (unchanged).

---

### Additional task discovered during review: P2-0 — Tech Debt Cleanup → **KEEP (new)**

The P1 Final Gate identified 8 tech-debt items. Several of them should be addressed at the START of P2 before adding new code. See §6 below for the triage.

---

## 4. Recommended P2 Execution Order

```
P2-0 (Tech Debt Cleanup)  ← 30 min, no risk, clears the decks
  │
  ▼
P2-1 (Project Workspace)  ← foundation; everything else depends on it
  │
  ├──► P2-3 (Multi-File Gen)  ← can start once P2-1 lands; touches execution-engine
  │
  ├──► P2-5 (Versioning)      ← can start once P2-1 lands; DB migration + WorkspaceService contract change
  │       │
  │       └──► P2-6 (Diff Viewer)  ← depends on P2-5 (needs versions to diff)
  │
  └──► P2-2 (File Tree UI)    ← can start once P2-1 lands; needs tree API
          │
          └──► P2-4 (Code Editor)  ← depends on P2-2 (select file in tree → open in editor); also depends on P2-5 for save-with-versioning
```

**Recommended sequence (linearized):**

1. **P2-0** — Tech debt cleanup (delete dead code, fix orchestrator prompt, fix test casts, add E2E test scaffolding)
2. **P2-1** — Project workspace directory + WorkspaceService project-aware methods
3. **P2-3** — Multi-file generation routed to project workspace
4. **P2-5** — File versioning (DB migration + WorkspaceService version recording)
5. **P2-2** — File tree UI + `/api/workspace/tree` route
6. **P2-6** — Diff viewer component
7. **P2-4** — Code editor component (save via WorkspaceService, integrates with P2-5 versioning)

**Rationale for this order:**
- P2-0 first: clears tech debt so new code doesn't inherit it.
- P2-1 before everything: it's the foundation.
- P2-3 before P2-5: multi-file gen is simpler than versioning and validates the project-workspace routing.
- P2-5 before P2-2/P2-4: versioning changes WorkspaceService's contract; doing it before UI means the UI can be built against the final API.
- P2-2 before P2-4: editor needs file selection from tree.
- P2-6 before P2-4: diff viewer is simpler and can be reused in the editor's "unsaved changes" preview.

---

## 5. Dependencies Between P2 Tasks

| Task | Depends On | Why |
|------|-----------|-----|
| P2-0 | none | Pure cleanup |
| P2-1 | P2-0 (recommended, not required) | Cleaner to extend a clean WorkspaceService |
| P2-2 | P2-1 | Needs `listProjectTree(projectId)` |
| P2-3 | P2-1 | Needs `writeProjectFile(projectId, ...)` |
| P2-4 | P2-2, P2-5 | Needs file selection (tree) + save-with-versioning |
| P2-5 | P2-1 | Needs project-scoped writes to exist before versioning them |
| P2-6 | P2-5 | Needs `FileVersion` rows to diff |

**Cross-cutting dependency:** P2-3, P2-4, P2-5 all require changes to `ValidationService.validateArtifact()` to accept the `projects/` filePath prefix. This should be done as part of P2-1 (add the prefix to validation when project workspace is introduced).

---

## 6. P1 Tech-Debt Triage (8 items from P1 Final Gate §10)

| # | Tech-Debt Item | Disposition | Rationale |
|---|----------------|-------------|-----------|
| 1 | `tools/index.ts:13-22` — dead `SANDBOX_ROOT`, `UPLOAD_DIR`, `ensureUploadDir()` | **Fix in P2-0** | 5-minute deletion. The duplicates in WorkspaceService are canonical. Safe to remove. |
| 2 | `runtime.ts:702` — `topoOrder` computed but only used in log | **Fix opportunistically when touching runtime.ts** | If P2-3 or P2-5 touches runtime.ts, remove the unused variable. Otherwise leave it — it's harmless observability. |
| 3 | `runtime.ts:578` & `agents/index.ts:41` — vestigial `executionOrder` in plan schema + orchestrator prompt doesn't mention `dependencies` | **Fix in P2-0** | 10-minute fix. Update orchestrator prompt to mention `dependencies: [indices]` and remove `executionOrder` from the plan schema string. Eliminates doc/reality inconsistency before P2 adds more moving parts. |
| 4 | `tests/tool-calling.test.ts` test 18 — fragile cleanup leaks orphaned memories | **Fix in P2-0** | Add a `beforeEach` that deletes memories with test markers, or wrap in a transaction. Prevents spurious failures during P2 development. |
| 5 | `tests/workspace-b1.test.ts:214` & `tests/workspace-b2.test.ts:68` — TS type errors in test casts | **Fix in P2-0** | 2-minute fix. `tsc --noEmit` should be clean before P2 adds new code. |
| 6 | No E2E/integration tests | **Fix opportunistically in P2** | Add one E2E test as part of P2-1 (create project → verify dir → delete project → verify dir gone). Don't build a full E2E framework in P2 — just one smoke test per P2 task. |
| 7 | `runAutonomousLoop` executes ready tasks sequentially | **Defer to P4** | P4-4 (Parallel Task Execution) is the natural home. P2 doesn't need parallelism. |
| 8 | Cycle in plan → falls back to linear (clears deps) | **Defer / by design** | Acceptable behavior. P2 may want to revisit if project missions become more complex, but not required. |

**Summary:** 5 of 8 items fixed in P2-0 (cleanup phase, ~30 min). 1 fixed opportunistically. 2 deferred.

---

## 7. Highest-Risk Changes

| Rank | Task | Risk | Why | Mitigation |
|------|------|------|-----|------------|
| 1 | **P2-5 (Versioning)** | Medium-High | Changes WorkspaceService's contract from stateless FS to FS+DB. Every write must atomically create a FileVersion row. If the DB write fails after the FS write, versions diverge. Non-project conversations must still work without versioning. | (a) Use a try/catch around the DB write — FS write succeeds even if version recording fails (log warning). (b) Gate versioning behind `projectId !== null`. (c) Add a migration test: write 100 files, verify 100 versions. |
| 2 | **P2-1 (Project Workspace)** | Medium | Extending `validatePath()` to accept project-scoped paths without breaking the existing 6-layer security model. Cross-project file access must be impossible. | (a) Add `validateProjectPath(projectId, relPath, mode)` as a SEPARATE function — do not modify the existing `validatePath()` signature. (b) Project roots are computed as `path.join(WORKSPACE_ROOT, "projects", projectId)` and validated against `WORKSPACE_ROOT`. (c) Add security tests: project A cannot read project B's files. |
| 3 | **P2-3 (Multi-File Gen)** | Low-Medium | Routing `executeResponse()` writes to project workspace. If the `projectId` is wrong or missing, files land in the wrong place. | (a) `projectId` comes from `Conversation.projectId` — verified at runtime. (b) If `projectId` is null, fall back to current behavior (global `/upload/`). (c) Backward compatible. |
| 4 | **P2-4 (Code Editor)** | Low | User-edited files must go through WorkspaceService, not direct API writes. | (a) The `/api/workspace/file` route MUST call `WorkspaceService.writeProjectFile()` — no raw `fs.writeFile`. (b) Add a test: editor save → verify FileVersion row created. |
| 5 | **P2-2 (File Tree)** | Low | Tree API must not leak cross-project files. | (a) `listProjectTree(projectId)` only walks `WORKSPACE_ROOT/projects/{projectId}/`. (b) Add test: project A's tree does not include project B's files. |

---

## 8. Database Migration Requirements

### P2-1: No migration
- No schema changes. Project directory is purely filesystem.
- `bun run db:push` not required.

### P2-3: No migration
- No schema changes. Multi-file gen is a runtime change.
- `Artifact.filePath` already exists and will be populated with `projects/{id}/filename`.

### P2-5: Migration REQUIRED
- **Add** `ProjectFile` model (id, projectId, path, currentHash, version, timestamps, unique on [projectId, path]).
- **Add** `FileVersion` model (id, fileId, version, content, hash, sizeBytes, conversationId?, taskId?, agentName?, artifactId?, createdAt).
- Run `bun run db:push` (SQLite, `--accept-data-loss` is safe for new tables).
- **No existing data migration needed** — existing Artifacts remain as-is; new ProjectFile rows are created on subsequent writes.

### P2-2, P2-4, P2-6: No migration
- Pure UI / API route additions.

### ValidationService update (cross-cutting)
- `validateArtifact()` check `path_in_allowed_area` must accept `projects/` prefix in addition to `upload/` and `workspace/`.
- This is a code change, not a migration.

---

## 9. Security Implications

| Concern | P2 Task | Mitigation |
|---------|---------|------------|
| Cross-project file access | P2-1 | `validateProjectPath(projectId, relPath)` computes the project root from `projectId` and validates the resolved path stays within it. A malicious `projectId` (e.g., `../other-project`) must be rejected — validate `projectId` is a CUID. |
| Path traversal in project paths | P2-1, P2-4 | Same 6-layer validation as existing `validatePath()`: input → normalize → resolve → realpath → boundary → blocked patterns. The boundary check uses the project-specific root. |
| User-edited files bypassing versioning | P2-4, P2-5 | The `/api/workspace/file` PUT route MUST call `WorkspaceService.writeProjectFile()` which records a version. No direct DB writes from the API. |
| AI writing to wrong project | P2-3 | `executeResponse()` gets `projectId` from the execution context (which comes from `Conversation.projectId`). The model cannot specify a `projectId` — it's system-controlled, like memory scope. |
| File tree leaking sensitive files | P2-2 | `listProjectTree()` walks only the project directory. Blocked patterns (`.env`, `.db`, `.git/`) still apply. |
| Diff viewer XSS | P2-6 | Diff content is rendered as text, not HTML. Use `<pre>` with proper escaping. |
| Code editor XSS | P2-4 | Editor content is rendered in a `<textarea>` or via `react-syntax-highlighter` (which escapes by default). No `dangerouslySetInnerHTML`. |
| Version content stored in DB grows unbounded | P2-5 | Add a `MAX_VERSIONS_PER_FILE = 50` cap. Older versions are pruned. Alternatively, store only diffs after version 1 (but this complicates `revertFile()`). **Recommendation: store full content, cap at 50 versions, prune oldest.** |

**No new mini-services required.** All P2 work fits in the existing Next.js app + Prisma + WorkspaceService architecture.

---

## 10. Testing Requirements

### Per-task test requirements

| Task | Unit Tests | Integration Tests | E2E / Browser Tests |
|------|-----------|-------------------|---------------------|
| P2-0 | Fix existing test casts; add `beforeEach` cleanup to tool-calling.test.ts | none | none |
| P2-1 | `validateProjectPath()` — valid/invalid projectIds, traversal attempts, cross-project access denied | Create project via API → verify dir exists; delete → verify gone | Browser: create project in ProjectsPanel, verify it appears |
| P2-2 | `listProjectTree()` — empty dir, nested dirs, blocked patterns excluded | API route returns correct tree for a project with known files | Browser: file tree renders, click file opens viewer |
| P2-3 | `executeResponse()` with `projectId` writes to project dir; multiple files created | Autonomous mission with project-scoped conversation creates files in project dir | Browser: autonomous mission in a project conversation → files appear in tree |
| P2-4 | Editor save calls `writeProjectFile()`; version incremented | API route saves file, returns new version | Browser: edit file, save, verify content updated and version history shows v2 |
| P2-5 | `ProjectFile` / `FileVersion` creation; `getFileHistory()`; `revertFile()`; `diffVersions()`; version cap pruning | Write file → edit → verify 2 versions; revert → verify content | Browser: view history, revert to v1 |
| P2-6 | Diff utility (extracted from `diff` tool) — added/removed/unchanged lines | Diff viewer renders correctly for known input | Browser: edit file, see diff |

### Test infrastructure additions
- **Add `tests/workspace-project-p2.test.ts`** — tests for `validateProjectPath`, `ensureProjectDir`, `removeProjectDir`, `listProjectTree`, `writeProjectFile`, `readProjectFile`, `patchProjectFile`.
- **Add `tests/versioning-p2.test.ts`** — tests for `ProjectFile`/`FileVersion` creation, `getFileHistory`, `revertFile`, `diffVersions`, version cap.
- **Add `tests/multi-file-gen-p2.test.ts`** — tests for `executeResponse` with `projectId`.
- **Add one E2E smoke test** (Bun script hitting `/api/chat` with autonomous mode + project conversation) — persists the autonomous verification from the P1 Final Gate as a runnable test.

### Acceptance gate (end of P2)
- All existing 405 P1 assertions still pass.
- New P2 assertions: target ~150 additional (across 3 new test files).
- `bun run lint` clean.
- `bunx tsc --noEmit` clean (source AND tests).
- Browser-verified: create project → run autonomous mission → see files in tree → edit in editor → view diff → revert.
- Autonomous mission in a project-scoped conversation produces files in `/workspace/projects/{id}/`.

---

## 11. What Should Explicitly NOT Be Implemented in P2

| Item | Why Not |
|------|---------|
| **Monaco or CodeMirror editor** | Heavy dependency (~2MB). MVP with `react-syntax-highlighter` + textarea is sufficient. Defer to P5. |
| **Parallel task execution** | P4-4 territory. P2's graph-based execution is already correct sequentially. |
| **Build/test/lint runtime** | P3 territory. P2 only creates files; it doesn't execute them. |
| **Self-repair loop** | P4-1 territory. Requires P3 (test execution) first. |
| **Knowledge graph activation** | P3-5 territory. `KnowledgeEntity`/`KnowledgeRelation` remain unused in P2. |
| **Resizable panels** | P5-1 territory. P2 adds panels to the existing fixed-width sidebar. |
| **Terminal/log streaming** | P5-3 territory. Requires P3 (runtime service) first. |
| **Agent consolidation** | P6-4 territory. Requires user approval on which agents to merge. |
| **Removing `KnowledgeEntity`/`KnowledgeRelation` models** | Needs user approval (P3-5). Leave as-is in P2. |
| **Changing the memory architecture** | P1-A fixed the scoping bug. Memory is correct. Do not touch in P2. |
| **Changing the tool-calling pipeline** | P1-A is correct and integrated. Do not touch in P2. |
| **Changing the ValidationService contract** | P1-C is correct. Only ADD the `projects/` filePath prefix to `validateArtifact()`. Do not redesign. |
| **Changing the TaskGraphService** | P1-D/E is correct. Do not touch in P2. |
| **Adding new agents** | Not needed for P2. The existing 15 agents cover file generation. |
| **Adding new tools** | Not needed for P2. The existing 10 tools (including `file_read`, `file_write`, `patch`, `diff`) cover P2 needs. The tools just need to become project-aware via `projectId` in the execution context. |
| **Arabic i18n for new UI** | Add new strings to `i18n.ts` for both `en` and `ar`, but do not do a full i18n audit. Defer to P5-4. |
| **Removing the `indigo-500` color from `projects-panel.tsx`** | Pre-existing UI rule violation. Note it but do not fix in P2 unless touching that component. Defer to P5. |

---

## 12. The Exact First Implementation Task

**Task ID: P2-0 — Tech Debt Cleanup**

**Objective:** Clear the 5 tech-debt items identified in §6 before any P2 feature work begins. This ensures new P2 code is built on a clean foundation and `tsc --noEmit` is fully clean.

**Scope (strictly bounded):**

1. **Delete dead code in `src/lib/ai/tools/index.ts`**
   - Remove `const SANDBOX_ROOT = "/home/z/my-project"` (line 13)
   - Remove `const UPLOAD_DIR = path.join(SANDBOX_ROOT, "upload")` (line 14)
   - Remove `async function ensureUploadDir()` (lines 16-22)
   - Remove the now-unused `import { promises as fs } from "fs"` and `import path from "path"` if no other code in the file uses them (verify: `path` is not used elsewhere in the file after these removals; `fs` is not used elsewhere).
   - Verify WorkspaceService has its own copies (it does: `workspace.ts:24-27`).

2. **Fix orchestrator prompt and plan schema in `src/lib/ai/runtime.ts` and `src/lib/ai/agents/index.ts`**
   - In `runtime.ts:573-581` (the `planSchema` string): remove the `"executionOrder": [0, 1, 2]` line. Keep `"dependencies": [0, 1]` (already present).
   - In `runtime.ts:586` (the `plan` type): remove `executionOrder: number[]`.
   - In `runtime.ts:620` (the fallback plan): remove `executionOrder: [0]`.
   - In `agents/index.ts:41` (orchestrator system prompt): change `"executionOrder": [0, 1, 2, ...]` to `"dependencies": [0, 1, ...]  // indices of tasks this depends on`.
   - Verify the model still produces correct plans (run the autonomous smoke test from P1 Final Gate).

3. **Fix test type errors**
   - `tests/workspace-b1.test.ts:214`: change `data.results.some((r) => r.path?.includes(".env") || r.file?.includes(".env"))` to `data.results.some((r) => (r.path ?? "").includes(".env") || r.file.includes(".env"))` — or fix the cast to `Array<{ file: string; path?: string }>`.
   - `tests/workspace-b2.test.ts:68`: change `assert(result.error?.includes("denied") || result.error?.includes("blocked"))` to `assert((result.error ?? "").includes("denied") || (result.error ?? "").includes("blocked"))`.

4. **Fix fragile test cleanup in `tests/tool-calling.test.ts`**
   - Add a `beforeEach` (or top-of-file setup) that deletes `Memory` rows where `content` contains known test markers (`ConvA-secret-marker`, `Test memory without context`, etc.).
   - Alternatively, wrap test 18 in a try/finally that always runs the cleanup `prisma.conversation.delete`.

5. **Remove unused `topoOrder` variable** (tech-debt item #2 — fix now since we're touching `runtime.ts` anyway)
   - `runtime.ts:702`: the `topoOrder` variable is only used in a log message at line 718. Either inline it (`getTopologicalOrder(graph)?.length ?? "N/A"`) or remove the log line entirely.
   - Remove the `getTopologicalOrder` import if no longer used.

**Acceptance criteria for P2-0:**
- `bun run lint` → 0 errors
- `bunx tsc --noEmit` → 0 errors (source AND tests)
- All 7 existing test suites pass (405/405 assertions)
- Autonomous smoke test (curl `/api/chat` with autonomous:true) still produces a valid plan with dependencies and completes successfully
- No functional behavior change — pure cleanup

**Files touched (exhaustive list):**
- `src/lib/ai/tools/index.ts` (delete dead code)
- `src/lib/ai/runtime.ts` (remove `executionOrder` from schema/type/fallback; remove or inline `topoOrder`)
- `src/lib/ai/agents/index.ts` (update orchestrator prompt)
- `tests/workspace-b1.test.ts` (fix cast)
- `tests/workspace-b2.test.ts` (fix cast)
- `tests/tool-calling.test.ts` (add cleanup)

**Files NOT touched:**
- `prisma/schema.prisma` (no migration)
- `src/lib/ai/workspace.ts` (no changes)
- `src/lib/ai/tool-caller.ts` (no changes)
- `src/lib/ai/validation.ts` (no changes)
- `src/lib/ai/task-graph.ts` (no changes)
- `src/lib/ai/execution-engine.ts` (no changes)
- `src/lib/ai/memory.ts` (no changes)
- Any UI component
- Any API route

**Estimated time:** 30-45 minutes.

**Risk:** Very low. Pure deletion and type fixes. No architectural change. If anything breaks, revert is trivial.

---

## 13. Review Summary

| Question | Answer |
|----------|--------|
| Is the original P2 plan still valid? | **Partially.** 3 of 6 tasks need MODIFY (P2-1, P2-3, P2-5) because P1 changed the underlying architecture. 3 tasks are KEEP (P2-2, P2-4, P2-6). 0 tasks are REMOVE or BLOCKED. |
| Are there new P2 tasks discovered? | **Yes: P2-0 (tech debt cleanup)** — 5 of the 8 P1 tech-debt items should be fixed before feature work. |
| What is the highest-risk task? | **P2-5 (File Versioning)** — changes WorkspaceService's contract from stateless FS to FS+DB. |
| Are any DB migrations needed? | **Yes, only for P2-5.** Two new models: `ProjectFile`, `FileVersion`. No existing data migration. |
| Are any new mini-services needed? | **No.** All P2 work fits in the existing Next.js app. |
| Are any new npm dependencies needed? | **No.** `react-syntax-highlighter` is already installed. No Monaco/CodeMirror in P2. |
| Does P2 touch any P1 boundary? | **Yes — WorkspaceService (P2-1, P2-5) and ValidationService (cross-cutting `projects/` prefix).** Tool calling, TaskGraphService, and the autonomous runtime are NOT touched. |
| What is the exact first task? | **P2-0 — Tech Debt Cleanup.** Strictly bounded to 6 files, 30-45 min, very low risk. |

---

## 14. P2 Gate Decision

**P2 is ready to begin upon explicit approval.**

The original plan is largely sound but must be adjusted for the post-P1 architecture:
- WorkspaceService is now the canonical FS authority — P2-1 and P2-5 must extend it carefully, not bypass it.
- ValidationService gates task completion — P2-5's version recording must not break the validation contract.
- TaskGraphService and the autonomous runtime are correct and should NOT be touched in P2.
- Native tool calling is correct — file tools just need to become project-aware via `projectId` in the execution context.

**Awaiting explicit user approval to begin P2-0 (the first task).**

Do NOT start P2-0 without approval.

Do NOT implement any source-code changes.

Stop here and wait.
