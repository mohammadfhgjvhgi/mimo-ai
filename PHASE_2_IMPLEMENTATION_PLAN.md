# Phase 2 — Real Project Engineering Implementation Plan

> 6 tasks. Duration: 3-4 weeks. Risk: Medium.
> Goal: Project workspace, file tree, multi-file generation, code editor, versioning.

---

## P2-1: Project Workspace Directory
- **Task ID**: P2-1
- **Objective**: Each project has a filesystem workspace at `/workspace/projects/{projectId}/`
- **Files affected**: `src/lib/ai/workspace.ts`, `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`
- **New files**: None (extend workspace.ts)
- **DB impact**: None
- **Dependencies**: P1-2 (WorkspaceService)
- **Implementation sequence**: Create workspace dir on project create, delete on project delete, add `getProjectTree()` method
- **Acceptance**: Creating a project creates `/workspace/projects/{id}/` directory
- **Tests**: Create project → verify dir exists; Delete project → verify dir removed
- **Risk**: Low | **Rollback**: Remove dir creation | **Complexity**: Low (1 hour)

## P2-2: File Tree UI
- **Task ID**: P2-2
- **Objective**: Show project files in tree view
- **Files affected**: NEW `src/components/mimo/file-tree.tsx`, `src/components/mimo/workspace.tsx`
- **New files**: `src/components/mimo/file-tree.tsx`
- **DB impact**: None
- **Dependencies**: P2-1
- **Implementation sequence**: Create FileTree component, add as panel, fetch tree from WorkspaceService via new API route `/api/workspace/tree?projectId=`
- **Acceptance**: User can browse project files in tree view
- **Tests**: Create files → verify they appear in tree; Click file → opens viewer
- **UI verification**: Use UI/UX Pro Max skill for tree component design
- **Risk**: Low | **Rollback**: Remove component | **Complexity**: Medium (3 hours)

## P2-3: Multi-File Project Generation
- **Task ID**: P2-3
- **Objective**: AI can generate multiple related files in one response
- **Files affected**: `src/lib/ai/execution-engine.ts`
- **New files**: None
- **DB impact**: None
- **Dependencies**: P2-1
- **Implementation sequence**: Extend `executeResponse()` to handle multiple code blocks with filenames, write each to project workspace
- **Acceptance**: Ask for "HTML + CSS + JS" → all 3 files created in project workspace
- **Tests**: Request multi-file project → verify all files exist
- **Risk**: Low | **Rollback**: Git revert | **Complexity**: Low (2 hours)

## P2-4: Code Editor Integration
- **Task ID**: P2-4
- **Objective**: View and edit files in browser with syntax highlighting
- **Files affected**: NEW `src/components/mimo/code-editor.tsx`, `src/components/mimo/file-tree.tsx`
- **New files**: `src/components/mimo/code-editor.tsx`
- **DB impact**: None
- **Dependencies**: P2-2 (file tree to select files)
- **Implementation sequence**: Use react-syntax-highlighter (already installed) for viewing, add edit mode with textarea + save via WorkspaceService
- **Acceptance**: User can view file content with syntax highlighting, edit and save
- **Tests**: Open file → verify highlighted; Edit → save → verify content updated
- **UI verification**: Use UI/UX Pro Max skill for editor UX
- **Risk**: Low | **Rollback**: Remove component | **Complexity**: Medium (4 hours)

## P2-5: File Versioning
- **Task ID**: P2-5
- **Objective**: Track file versions, enable diff and rollback
- **Files affected**: `src/lib/ai/workspace.ts`, `prisma/schema.prisma` (new models)
- **New files**: None
- **DB impact**: ADD `ProjectFile` and `FileVersion` models
  ```prisma
  model ProjectFile {
    id        String   @id @default(cuid())
    projectId String
    path      String
    hash      String
    version   Int      @default(1)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    @@unique([projectId, path])
  }
  model FileVersion {
    id        String   @id @default(cuid())
    fileId    String
    version   Int
    content   String
    hash      String
    createdAt DateTime @default(now())
  }
  ```
- **Dependencies**: P2-1 (workspace), P1-2 (WorkspaceService)
- **Implementation sequence**: Add models to schema, `bun run db:push`, update WorkspaceService to create version on every write, add `getFileHistory()`, `revertFile()`, `diffVersions()` methods, add API routes
- **Acceptance**: Editing a file creates new version, can view history, can revert
- **Tests**: Write file → edit → verify version 2; Revert → verify content matches v1
- **Risk**: Medium (DB migration) | **Rollback**: Drop new models | **Complexity**: Medium (4 hours)

## P2-6: Diff Viewer
- **Task ID**: P2-6
- **Objective**: Show before/after diff when files are modified
- **Files affected**: NEW `src/components/mimo/diff-viewer.tsx`
- **New files**: `src/components/mimo/diff-viewer.tsx`
- **DB impact**: None
- **Dependencies**: P2-5 (versioning)
- **Implementation sequence**: Create diff viewer component, use `diff` tool for comparison, show added/removed/changed lines
- **Acceptance**: File modifications show side-by-side diff
- **Tests**: Edit file → verify diff displayed
- **UI verification**: Use UI/UX Pro Max skill for diff viewer design
- **Risk**: Low | **Rollback**: Remove component | **Complexity**: Medium (3 hours)

---

## Phase 2 Completion Criteria (GATE 3)
- [ ] Project workspace directory created per project
- [ ] File tree UI shows project files
- [ ] Multi-file generation works (HTML + CSS + JS in one response)
- [ ] Code editor with syntax highlighting works
- [ ] File versioning tracks history
- [ ] Diff viewer shows file changes
- [ ] find-bugs run, critical findings fixed
