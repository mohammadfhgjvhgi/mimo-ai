# Workspace / File Model

> Define the correct boundary for file operations.

---

## Current State (BROKEN)

### File Operations Today
| Operation | Tool | Status | Location |
|-----------|------|--------|----------|
| Read | `file_read` | ✅ Works (but unreachable) | Any file in /home/z/my-project/ |
| Write | `file_write` | ✅ Works (but unreachable) | /upload/ only (flat, no dirs) |
| Search files | `file_search` | ✅ Works (but unreachable) | Walks entire project |
| Search code | `code_search` | ✅ Works (but unreachable) | Walks entire project |
| Patch | `patch` | ✅ Works (but unreachable) | /upload/ only |
| Diff | `diff` | ✅ Works (but unreachable) | String comparison only |
| Edit | ❌ MISSING | — | — |
| Delete | ❌ MISSING | — | — |
| Rename | ❌ MISSING | — | — |
| Copy | ❌ MISSING | — | — |
| Dir create | ❌ MISSING | — | — |
| Dir list | ❌ MISSING | — | — |
| Dir tree | ❌ MISSING | — | — |

### Problems
1. **No project scoping**: All files go to flat `/upload/` directory
2. **No versioning**: Files overwritten, no history
3. **No diffs**: Can compare strings but not file versions
4. **No rollback**: Can't undo changes
5. **Security hole**: `file_read` can read `.env`, `db/custom.db`, `.git/`
6. **No project workspace**: Projects are DB records only, no filesystem

---

## Canonical Workspace Model

### Directory Structure
```
/workspace/
├── projects/
│   ├── {projectId}/
│   │   ├── src/           # Source files
│   │   ├── public/        # Static assets
│   │   ├── docs/          # Documentation
│   │   ├── tests/         # Test files
│   │   ├── package.json   # Project config
│   │   └── .mimo/         # MiMo metadata
│   │       ├── versions/  # File version history
│   │       └── meta.json  # Project metadata
│   └── {projectId}/
└── shared/                # Shared resources across projects
```

### WorkspaceService (NEW — not implemented)
All file operations should go through a WorkspaceService, not directly through tools.

```typescript
class WorkspaceService {
  // Project-scoped operations
  async createProjectWorkspace(projectId: string): Promise<void>;
  async getProjectTree(projectId: string): Promise<FileTree>;
  async getProjectFiles(projectId: string): Promise<File[]>;

  // File operations (all project-scoped)
  async readFile(projectId: string, path: string): Promise<FileContent>;
  async writeFile(projectId: string, path: string, content: string): Promise<File>;
  async editFile(projectId: string, path: string, edits: Edit[]): Promise<File>;
  async patchFile(projectId: string, path: string, find: string, replace: string): Promise<File>;
  async deleteFile(projectId: string, path: string): Promise<void>;
  async renameFile(projectId: string, oldPath: string, newPath: string): Promise<File>;
  async copyFile(projectId: string, srcPath: string, destPath: string): Promise<File>;

  // Directory operations
  async createDir(projectId: string, path: string): Promise<void>;
  async listDir(projectId: string, path: string): Promise<DirEntry[]>;

  // Versioning
  async getFileHistory(projectId: string, path: string): Promise<FileVersion[]>;
  async revertFile(projectId: string, path: string, versionId: string): Promise<File>;
  async diffVersions(projectId: string, path: string, v1: string, v2: string): Promise<Diff>;

  // Search
  async searchFiles(projectId: string, pattern: string): Promise<FileMatch[]>;
  async searchCode(projectId: string, query: string): Promise<CodeMatch[]>;

  // Validation
  private validatePath(projectId: string, path: string): boolean;
  private isAllowed(path: string): boolean;
}
```

### Path Validation Rules
```
ALLOWED:
  /workspace/projects/{projectId}/src/**
  /workspace/projects/{projectId}/public/**
  /workspace/projects/{projectId}/docs/**
  /workspace/projects/{projectId}/tests/**

BLOCKED:
  .env
  *.db
  .git/**
  node_modules/**
  .. (path traversal)
  / (absolute paths)
```

### File Versioning
Every write/edit/patch creates a new version:
```
/workspace/projects/{id}/.mimo/versions/
  ├── {filehash}/
  │   ├── v1-{timestamp}.txt
  │   ├── v2-{timestamp}.txt
  │   └── v3-{timestamp}.txt
  └── {filehash}/
```

### DB Model (NEW — not implemented)
```prisma
model ProjectFile {
  id          String   @id @default(cuid())
  projectId   String
  path        String   // relative to project root
  content     String   // current content
  sizeBytes   Int
  hash        String   // content hash
  version     Int      @default(1)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([projectId, path])
  @@index([projectId])
}

model FileVersion {
  id          String   @id @default(cuid())
  fileId      String
  version     Int
  content     String
  hash        String
  createdAt   DateTime @default(now())
  
  @@index([fileId])
}
```

---

## Tool vs Workspace Boundary

### Current (WRONG)
```
Tool → directly manipulates filesystem
```

### Canonical (CORRECT)
```
Tool → WorkspaceService → filesystem
Tool → WorkspaceService → DB (versioning)
```

### Why?
1. **Security**: WorkspaceService enforces path validation, tool doesn't need to
2. **Versioning**: WorkspaceService tracks versions, tool doesn't need to
3. **Project scoping**: WorkspaceService knows which project, tool doesn't
4. **Auditability**: WorkspaceService logs all operations
5. **Consistency**: All file ops go through one path

---

## Migration Path

### Phase 1 (P1): Create WorkspaceService
- Implement WorkspaceService class
- Implement path validation
- Implement file operations (read, write, edit, delete, rename)

### Phase 2 (P2): Update Tools
- Tools call WorkspaceService instead of direct filesystem
- Tools require projectId in input
- Remove /upload/ directory usage

### Phase 3 (P2): Add Versioning
- FileVersion model
- Automatic versioning on write
- Diff and revert APIs

### Phase 4 (P3): Add File Tree UI
- FileTree component
- File viewer with syntax highlighting
- Diff viewer

**DO NOT implement yet. Await approval.**
