# Preview / Runtime Model

> Define future Preview/Runtime abstraction. Architecture only — do NOT implement.

---

## Current State

### What Works
| Preview Type | Status | Implementation |
|-------------|--------|----------------|
| HTML | ✅ Works | `/api/preview/[id]` serves HTML, iframe renders it |
| SVG | ✅ Works | Same API, `image/svg+xml` content-type |
| Inline preview | ✅ Works | `inline-preview.tsx` shows iframe in chat |
| Full preview panel | ✅ Works | `preview-panel.tsx` with device toggle, code view |

### What Doesn't Work
| Preview Type | Status | Why |
|-------------|--------|-----|
| Markdown | ❌ Missing | Served as text/plain, not rendered |
| JSON | ❌ Missing | Served as text/plain, no structured viewer |
| Code with syntax highlighting | ❌ Missing | Served as text/plain |
| Multi-file project | ❌ Missing | No project preview, only single file |
| Built web app | ❌ Missing | No build capability |
| Running application | ❌ Missing | No runtime |
| Logs | ❌ Missing | No log capture |
| Runtime errors | ❌ Missing | No error capture |
| Screenshots | ❌ Missing | No visual verification |
| Interactive applications | ❌ Partial | HTML iframe is interactive, but no app runtime |

---

## Canonical Preview Architecture

### Preview Types (Registry Pattern)

```typescript
type PreviewType =
  | "html"           // Static HTML in iframe
  | "markdown"       // Rendered markdown
  | "svg"            // SVG image
  | "json"           // Structured JSON viewer
  | "code"           // Syntax-highlighted code
  | "image"          // Image (png, jpg, gif)
  | "diff"           // Diff view
  | "project-static" // Multi-file static project (HTML+CSS+JS)
  | "project-built"  // Built web app (Next.js, React, etc.)
  | "app-running"    // Live running application
  | "logs"           // Log output
  | "test-results"   // Test results
  | "error"          // Error display
```

### Preview Provider Interface

```typescript
interface PreviewProvider {
  type: PreviewType;
  canHandle(artifact: Artifact): boolean;
  render(artifact: Artifact, options?: PreviewOptions): PreviewResult;
}

interface PreviewResult {
  type: PreviewType;
  url?: string;           // For iframe-based previews
  content?: string;       // For inline content
  component?: ReactNode;  // For custom renderers
  meta?: {
    title?: string;
    errors?: string[];
    warnings?: string[];
  };
}
```

### Preview Registry

```typescript
class PreviewRegistry {
  private providers: Map<PreviewType, PreviewProvider> = new Map();

  register(provider: PreviewProvider): void {
    this.providers.set(provider.type, provider);
  }

  getProvider(artifact: Artifact): PreviewProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.canHandle(artifact)) return provider;
    }
    return null;
  }

  render(artifact: Artifact, options?: PreviewOptions): PreviewResult {
    const provider = this.getProvider(artifact);
    if (!provider) return { type: "error", content: "No preview available" };
    return provider.render(artifact, options);
  }
}
```

### Preview Providers (to implement)

#### 1. HTMLPreviewProvider
- **Can handle**: format === "html" or filename.endsWith(".html")
- **Render**: iframe with `/api/preview/{id}` URL
- **Security**: `sandbox="allow-scripts"` (no allow-same-origin)

#### 2. MarkdownPreviewProvider
- **Can handle**: format === "markdown" or filename.endsWith(".md")
- **Render**: Rendered markdown (use react-markdown or custom renderer)
- **Features**: Headings, code blocks, tables, links

#### 3. SVGPreviewProvider
- **Can handle**: format === "svg" or filename.endsWith(".svg")
- **Render**: `<img src="/api/preview/{id}">`

#### 4. JSONPreviewProvider
- **Can handle**: format === "json" or filename.endsWith(".json")
- **Render**: Structured tree view with collapsible nodes
- **Features**: Syntax highlighting, copy path, search

#### 5. CodePreviewProvider
- **Can handle**: format in ["typescript", "tsx", "javascript", "jsx", "python", "sql", "css", "bash"]
- **Render**: Syntax-highlighted code (use react-syntax-highlighter — already installed)
- **Features**: Line numbers, copy button, language label

#### 6. ImagePreviewProvider
- **Can handle**: format in ["png", "jpg", "jpeg", "gif", "webp"]
- **Render**: `<img src="/api/preview/{id}">`

#### 7. DiffPreviewProvider
- **Can handle**: type === "diff"
- **Render**: Side-by-side or inline diff view
- **Features**: Added/removed/changed highlighting

#### 8. ProjectStaticPreviewProvider
- **Can handle**: Artifact is part of a project with multiple files (HTML+CSS+JS)
- **Render**: iframe serving the project's index.html with relative resources
- **Security**: sandboxed iframe

#### 9. ProjectBuiltPreviewProvider (P3)
- **Can handle**: Project has been built successfully
- **Render**: iframe serving build output
- **Requirements**: Build system, output directory

#### 10. AppRunningPreviewProvider (P4)
- **Can handle**: App process is running on a port
- **Render**: iframe pointing to `http://localhost:{port}`
- **Requirements**: Process management, port allocation, health check

#### 11. LogsPreviewProvider (P3)
- **Can handle**: type === "logs"
- **Render**: Terminal-style log viewer with auto-scroll
- **Features**: Filter by level, search, timestamps

#### 12. TestResultsPreviewProvider (P3)
- **Can handle**: type === "test_results"
- **Render**: Test summary with pass/fail counts, expandable details

---

## Preview Display Locations

### 1. Inline in Chat (CURRENT — works)
- **When**: Artifact is created during chat
- **How**: `inline-preview.tsx` component in message bubble
- **Size**: Max 400px height, collapsible

### 2. Preview Panel (CURRENT — works)
- **When**: User clicks Preview tab
- **How**: `preview-panel.tsx` full-width panel
- **Features**: Device toggle, code view, refresh, open external

### 3. Side-by-Side (FUTURE)
- **When**: User is working on a project
- **How**: Split view — chat on left, preview on right
- **Features**: Live reload when files change

### 4. Modal/Detached (FUTURE)
- **When**: User wants full-screen preview
- **How**: Modal dialog or new tab
- **Features**: Full viewport, interactive

---

## Security Model

### iframe Sandbox Rules
```html
<!-- Static HTML preview — safe -->
<iframe sandbox="allow-scripts">

<!-- NEVER use allow-same-origin with AI-generated content -->
<!-- It allows the iframe to access parent page cookies, localStorage, etc. -->
```

### Content Security Policy
```
Content-Security-Policy: default-src 'none'; 
  script-src 'unsafe-inline'; 
  style-src 'unsafe-inline'; 
  img-src data: blob:; 
  font-src data:;
```

### Path Validation
- Preview API only serves Artifact content from DB
- Never serves files directly from filesystem
- No path parameter in preview URL (only artifactId)

---

## Runtime Layer (MISSING — future)

### What Runtime Does
1. **Build**: Compile/bundle project (npm/bun build)
2. **Test**: Run test suite
3. **Run**: Start app process
4. **Monitor**: Capture logs, errors, health
5. **Stop**: Kill process when done

### Runtime Service Interface
```typescript
interface RuntimeService {
  async build(projectId: string): Promise<BuildResult>;
  async test(projectId: string): Promise<TestResult>;
  async run(projectId: string, options?: RunOptions): Promise<RunHandle>;
  async stop(handleId: string): Promise<void>;
  async getLogs(handleId: string): Promise<LogEntry[]>;
  async getHealth(handleId: string): Promise<HealthStatus>;
}
```

### Process Management
- Each running app gets a port (3001, 3002, ...)
- Process tracked with PID, port, status
- Auto-stop after inactivity
- Health check endpoint

**DO NOT implement yet. Await approval.**
