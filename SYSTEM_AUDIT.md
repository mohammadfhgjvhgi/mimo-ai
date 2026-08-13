# MiMo AI Platform — Complete Engineering Audit (READ-ONLY)

> Performed by reading every source file listed in the task. No code was modified.
> Every claim is backed by a specific `file:line` reference.
> Brutal honesty applied.

---

## 1. CODEBASE INVENTORY (verified)

### Counts (what ACTUALLY exists in src/)

| Item | Count | Source |
|---|---|---|
| Prisma models | 12 | `prisma/schema.prisma` |
| Agent roles defined | **15** | `src/lib/ai/types.ts:5-20`, `src/lib/ai/agents/index.ts:7-594` |
| Tools defined | **10** | `src/lib/ai/tools/index.ts:31-459` |
| Skills count | Runtime (depends on `/home/z/my-project/skills`) | `src/lib/ai/skills/index.ts:9` |
| API routes | 14 (incl. dead `/api/route.ts`) | `src/app/api/**` |
| MiMo UI panels | 11 | `src/components/mimo/workspace.tsx:39-51` |
| MiMo component files | 17 | `src/components/mimo/` |
| i18n keys | ~50 | `src/lib/i18n.ts:13-162` |

### Documentation Mismatches (lies in the code)

| Claim | Reality | Evidence |
|---|---|---|
| "10 specialized agents" | **15** agents defined | `agents/index.ts:2` comment vs `types.ts:5-20` |
| "6 real tools" | **10** tools defined | `tools/index.ts:2` comment vs `tools/index.ts:31-459` |
| "10 agents · 6 tools · 69 skills" | 15 agents, 10 tools, variable skills | `settings-dialog.tsx:115`, `chat-panel.tsx:411`, `i18n.ts:43` |
| "9 types" of memory (in comment) | Schema lists 9 ✅, but the comment header says "7 types" | `schema.prisma:139` comment says "7 types" then enumerates 9 |
| `reactStrictMode: false` to avoid "double-render issues" | It just hides React bugs | `next.config.ts:9` |
| `ignoreBuildErrors: true` | **TypeScript errors silently pass to production** | `next.config.ts:7` |

---

## 2. CRITICAL ANSWERS (the 10 questions)

### Q1: Does `parseToolCalls()` actually work?

**NO.** Effectively dead code.

`runtime.ts:36-62` defines:
```ts
const jsonPattern = /\{\s*"tool"\s*:\s*"([\w_]+)"\s*,\s*"input"\s*:\s*(\{[^}]+\})\s*\}/g;
```

This requires the model to emit EXACTLY `{"tool":"web_search","input":{"query":"..."}}`. But:

1. **No agent system prompt instructs the model to emit this format.** Read every prompt in `agents/index.ts:25-593` — none mention tool-call JSON syntax. The orchestrator prompt (lines 25-48) asks for a `{"understanding":"...","tasks":[...]}` plan, not tool calls.
2. **The regex `\{[^}]+\}` cannot match nested objects** — if the model emits `{"input":{"query":"x","filters":{"y":1}}}` the inner `}` breaks the match.
3. **The fallback (lines 52-59)** only triggers on the literal word "search" + a captured phrase. Brittle: "I'll search for X" matches, but "let me look up X" only matches if "search" is also in the text (line 56: `lower.includes("search")`).
4. **Format 2 requires `lower.includes("search")`** — so "look up X" alone never fires.

**Verdict:** Tools essentially never execute via JSON path. Only the `web_search` regex fallback can fire, and only for English "search" keyword. **Classification: E (BROKEN).**

### Q2: Is `executeResponse()` a real execution engine?

**NO.** It is "extract code block → write file".

`execution-engine.ts:157-228`:
1. Calls `extractCodeBlocks(content)` (line 161) — regex matches ```` ```lang\ncode\n``` ```` (line 54).
2. For each block ≥20 chars (line 177), writes it to `/home/z/my-project/upload/<filename>` (line 186).
3. Stores an `Artifact` row (line 193).
4. Returns. **No compilation, no test run, no validation, no execution.**

The comment at lines 8-9 says: *"This is the difference between 'AI says it created a file' and 'AI actually created a file'."* — true, but it stops at file creation. There is **no execution** of the code, **no validation** that it works, **no repair** loop if it fails.

### Q3: Does the autonomous loop validate outputs?

**NO.** Tasks are marked completed regardless of output quality.

`runtime.ts:482-491`:
```ts
if (taskId) {
  await db.task.update({
    where: { id: taskId },
    data: {
      status: "completed",
      completedAt: new Date(),
      completionNotes: responseContent.slice(0, 500),
    },
  });
}
```

No validation rules are checked (despite `validationRules` field on `Task` model — `schema.prisma:73`). No reviewer agent runs. No tests execute. The `ExecutionPhase` type (`types.ts:42-50`) defines `"validate" | "repair" | "retest" | "review"` phases — **none are ever emitted** in `executeTask`. Only `plan`, `execute`, `observe`, `complete` phases are logged (runtime.ts:223, 244, 298, 320, 493).

The "QA Engineer" agent exists (`agents/index.ts:197-236`) but is never automatically invoked after task completion. It only runs if the orchestrator explicitly assigns a task to it.

### Q4: Are the 15 agents genuinely different?

**NO.** They are 15 different system prompts over the same model.

Evidence: every agent in `agents/index.ts:7-594` has:
- Same `chat()` call path (via `runtime.ts:executeTask`).
- Same context assembly (`context.ts:32`).
- Same model (ZAI GLM-4-plus — `settings-dialog.tsx:117`).
- Same streaming fake-out (`model.ts:126`).
- Different `systemPrompt` strings.
- Different `defaultTools` arrays — but **tools are not auto-injected into the prompt**. The agent must emit tool-call JSON (which they don't — see Q1) to use tools. So `defaultTools` is effectively decorative metadata.
- Different `color` / `icon` / `title` — UI decoration only.

`pickAgentForMessage` (`agents/index.ts:641-761`) is the router. It is keyword-based with several bugs:
- Line 656: `"find"` routes to researcher — "find me a coffee" → researcher.
- Line 678: `"write"` and `"create"` route to developer — "write a thank-you note" → developer.
- Line 670 vs 661: `"design"` matches both `planner` and `architect`; first match (architect) wins, but the order is fragile.

### Q5: Are KnowledgeEntity / KnowledgeRelation / AgentActivity used anywhere?

**NO.** All three are dead models.

Grep results across `/home/z/my-project/src/`:
- `KnowledgeEntity`: 0 references in src/ (only in `research-export/` reference docs).
- `KnowledgeRelation`: 0 references in src/.
- `AgentActivity`: 0 references in src/.

`KnowledgeEntry` IS used:
- `tools/index.ts:220`: `db.knowledgeEntry.findMany(...)` in `knowledge_search` tool.
- `api/state/route.ts:26`: `db.knowledgeEntry.count()`.

But `KnowledgeEntry` is **never written to** by any code path. No API endpoint creates one. No tool creates one. The `knowledge_search` tool queries an empty table. **The entire knowledge subsystem is decorative.**

### Q6: Does memory retrieval feed into context?

**YES, partially.**

`context.ts:64-78` calls `retrieveMemories({query: userMessage, limit: 5, conversationId})` and injects the result into the system prompt (lines 85-92):
```ts
systemParts.push("\n\n## Relevant Memories\n" + memories.map(...).join("\n"));
```

So retrieval → context injection WORKS. However:

1. **Retrieval is keyword LIKE** (`memory.ts:62-77`), not semantic. No embeddings.
2. **`where.OR` bug in `memory.ts:69-77`**: when keywords are present, `where.OR` is OVERWRITTEN (line 70). The previous OR (conversationId filter from line 57) is replaced by keyword OR clauses. Result: when keywords exist, **memories from ALL conversations are returned**, not just the current one. **Bug.**
3. **`consolidateMemories()` is never called** (`memory.ts:110`). Short_term memories never promote to long_term. The "Memory Lifecycle" is fictional.
4. **`getMemoriesByType()` is never called** (`memory.ts:98`). Dead export.
5. **Auto-memory content is low-value**: `runtime.ts:396-404` writes `"Agent X responded to: Y. Output summary: Z"` — a copy of the response, not a distilled fact.
6. **`parseMemoryWrites` regex** (`runtime.ts:67-83`) requires model to emit `{"memory":{"type":"...","content":"..."}}` JSON. No prompt instructs the model to do this. Effectively never fires.

### Q7: Are there race conditions in the store's setTimeout fetches?

**YES.** Multiple.

#### Race 1: "end" event fires parallel fetches with stale convId
`mimo-store.ts:610-626`:
```ts
const convId = state.currentConversation?.id;
if (convId) {
  setTimeout(() => {
    safeFetch(`/api/tasks?conversationId=${convId}`).then(...)
    safeFetch(`/api/artifacts?conversationId=${convId}`).then(...)
    safeFetch(`/api/decisions?conversationId=${convId}`).then(...)
    safeFetch(`/api/memory?conversationId=${convId}`).then(...)
  }, 800);
}
setTimeout(() => {
  get().loadSystemState();
  get().loadConversations();
}, 1000);
```

If the user clicks another conversation between event arrival and the 800ms timer, the stale `convId` fetches overwrite the new conversation's state in the store. **Race condition confirmed.**

#### Race 2: "artifact" event fires immediate fetch
`mimo-store.ts:460-466`:
```ts
case "artifact": {
  const convId = state.currentConversation?.id;
  if (convId) {
    safeFetch(`/api/artifacts?...`).then((data) => set({ artifacts: ... }))
  }
  ...
}
```

In autonomous mode, multiple "artifact" events fire in rapid succession (one per file created). Each triggers an immediate fetch, all racing to `set({ artifacts })`. Last write wins; intermediate artifacts may be lost.

#### Race 3: "start" event with new conversation triggers async find
`mimo-store.ts:374-388`:
```ts
case "start": {
  const conversationId = event.conversationId;
  if (conversationId && !state.currentConversation) {
    get().loadConversations();
    safeFetch("/api/conversations").then((data) => {
      const conv = data.conversations.find(c => c.id === conversationId);
      if (conv) set({ currentConversation: conv });
    })
  }
}
```

Two parallel fetches (`loadConversations()` and the inline `safeFetch`) for the same data. If user clicks "New Conversation" between them, the stale `set({ currentConversation: conv })` overwrites their new state.

### Q8: Is `ignoreBuildErrors: true` in next.config.ts?

**YES.** `next.config.ts:7`:
```ts
typescript: {
  ignoreBuildErrors: true,
},
```

Combined with `reactStrictMode: false` (line 9), this means:
- TypeScript errors ship to production silently.
- React's development-mode sanity checks (which catch impure renders, missing keys, effect leaks) are disabled.

This is a **CRITICAL** architectural violation. Any type error introduced by a future edit will pass CI/build and only manifest at runtime.

### Q9: What's the actual iframe security posture?

**Acceptable but fragile.**

- `preview-panel.tsx:204`: `sandbox="allow-scripts"` — no `allow-same-origin`, no `allow-forms`, no `allow-top-navigation`. ✅
- `inline-preview.tsx:99`: same `sandbox="allow-scripts"`. ✅
- `api/preview/[id]/route.ts:80`: `X-Content-Type-Options: nosniff`. ✅
- BUT: the route serves raw HTML from the Artifact table (line 76). No CSP header. No `X-Frame-Options`. If a malicious prompt injects `<script>` that fetches `/api/conversations` (same origin), the sandbox prevents it (no `allow-same-origin`) — but only because the iframe is treated as a different origin.
- **Risk:** if a future developer adds `allow-same-origin` to the sandbox (a common "fix" for broken previews), the XSS becomes trivial.
- **Risk:** `api/preview/[id]/route.ts:40-56` wraps user content in an HTML template with `<title>${artifact.name}</title>` — `artifact.name` is not HTML-escaped. If a filename contains `</title><script>...`, the script executes in the iframe. Confined by sandbox, but still a code-injection smell.

### Q10: Is Arabic/RTL complete or partial?

**PARTIAL.** Infrastructure exists; most UI is hardcoded English.

- `i18n.ts:13-162` defines the translation dictionary and `t(key, locale)` helper. ✅
- `layout.tsx` and `workspace.tsx:115-118` apply `dir` and `lang` to `<html>`. ✅
- `chat-panel.tsx` uses `t()` for some strings (lines 308, 366-369) but hardcodes:
  - "MiMo AI Engineering Intelligence" (line 219)
  - "Autonomous" (line 232)
  - "Agent:" (line 328)
  - "auto" (line 338)
  - EmptyState title and body (lines 408-411) — English only
  - Example card titles (lines 416-430) — English only
  - "running", "done", "error", "copy", "copied" (lines 272-286, 497) — English only
- `tasks-panel.tsx`: 100% hardcoded English (lines 27-29, 40-41, 80-85).
- `agents-panel.tsx`: 100% hardcoded English (line 15).
- `artifacts-panel.tsx`: 100% hardcoded English (lines 32, 51, 85-87).
- `memory-panel.tsx`: 100% hardcoded English (lines 28, 35, 65).
- `decisions-panel.tsx`: 100% hardcoded English (lines 15, 37, 41-49).
- `timeline-panel.tsx`: 100% hardcoded English (lines 33-35, 76).
- `tools-panel.tsx`: Mostly hardcoded English (lines 21, 29).
- `skills-panel.tsx`: 100% hardcoded English (lines 23, 27).
- `command-palette.tsx`: 100% hardcoded English (lines 34-44, 95, 101).
- `projects-panel.tsx`: Uses `t()` for some strings (lines 62, 68, 74, 102) but mixes in hardcoded English (lines 53, 93).
- `sidebar.tsx`: Uses `t()` for most strings (lines 112, 122, 137, 206, 216, 226) but has hardcoded English fallback (line 136).

**Verdict:** Arabic speakers get a partially-translated UI. The chat panel, sidebar, and projects panel are mostly localized; everything else is English-only. **Classification: B (PARTIAL).**

---

## 3. FILE-BY-FILE AUDIT

### `prisma/schema.prisma` (283 lines)

- **What it does**: Defines 12 Prisma models for SQLite: `Conversation`, `Message`, `Task`, `AgentActivity`, `Artifact`, `Memory`, `Decision`, `ExecutionLog`, `KnowledgeEntry`, `Project`, `KnowledgeEntity`, `KnowledgeRelation`.
- **Key exports**: Prisma client types.
- **Imports**: nothing (declarative).
- **Callers**: every API route and lib that uses `db`.
- **Status**: Functional, but 3 models are dead (`AgentActivity`, `KnowledgeEntity`, `KnowledgeRelation` — see Q5). Comment on line 139 says "7 types" then enumerates 9 (copy-paste error).
- **Bugs**: `sqlite` provider (line 13) won't scale. No `@@unique` on `Memory.content` — duplicates accumulate. `KnowledgeRelation` has no FK to `KnowledgeEntity` (just `fromId`/`toId` strings, line 273-274) — referential integrity not enforced.

### `src/lib/ai/model.ts` (249 lines)

- **What it does**: Wraps `z-ai-web-dev-sdk`. Exposes `chat()`, `chatStream()`, `generateStructured()`, `invokeFunction()`.
- **Imports**: `z-ai-web-dev-sdk`.
- **Callers**: `runtime.ts:9`, `tools/index.ts:7`.
- **Status**: Functional but **streaming is fake** (lines 126-169): calls non-streaming `chat()` then chunk-by-word with 20ms delay. Total latency = full response time + chunked output time. User perceives no real-time benefit, only added delay.
- **Bugs**:
  - `generateStructured` (line 174) uses regex parsing fallbacks — fragile. If model wraps JSON in markdown or includes commentary, parsing may succeed but data may be malformed.
  - Token estimate (line 106 in `context.ts`, not here, but related): `Math.ceil(totalChars / 4)` — crude approximation, not real tokenization.
  - `MAX_RETRIES = 3` (line 45) with exponential backoff (line 111). Total max wait: 2+4+8 = 14s before failure.

### `src/lib/ai/context.ts` (128 lines)

- **What it does**: Assembles context for model calls: agent system prompt + history (max 20 messages) + relevant memories (max 5) + extra system.
- **Imports**: `db`, `retrieveMemories`, `getAgent`, types.
- **Callers**: `runtime.ts:230`.
- **Status**: Functional. Memory injection works (Q6).
- **Bugs**: Hard truncation (lines 110-118) drops oldest messages but keeps the user's latest — may drop critical context. No summarization of dropped messages.

### `src/lib/ai/memory.ts` (148 lines)

- **What it does**: CRUD for `Memory` table. `writeMemory`, `retrieveMemories`, `getMemoriesByType`, `consolidateMemories`, `getAllMemories`.
- **Imports**: `db`, types.
- **Callers**: `context.ts:9`, `runtime.ts:13`, `tools/index.ts:8`, `api/memory/route.ts:4`.
- **Status**: Functional for write/retrieve. **`consolidateMemories` (line 110) and `getMemoriesByType` (line 98) are dead exports** — never imported.
- **Bugs**:
  - **`where.OR` overwrite bug** (line 70): when keywords exist, the conversationId OR is replaced by keyword OR. Retrieval leaks across conversations. See Q6.
  - Keyword filter (line 67) only keeps words >3 chars — short queries ("ai", "iot", "css") return nothing.
  - `accessCount` increment (lines 86-93) fires N parallel updates — fine for SQLite but inefficient.

### `src/lib/ai/agents/index.ts` (778 lines)

- **What it does**: Defines 15 agents with system prompts, capabilities, defaultTools, colors, icons. Provides `getAgent`, `listAgents`, `pickAgentForMessage`, `shouldSuggestAutonomous`.
- **Imports**: types only.
- **Callers**: `context.ts:10`, `runtime.ts:11`, `api/agents/route.ts:3`, `api/state/route.ts:4`.
- **Status**: Functional but misleading. Comment line 2 says "10 agents" — actually 15.
- **Bugs**:
  - `shouldSuggestAutonomous` (line 767) is exported but **never called**. Dead.
  - `pickAgentForMessage` keyword routing is brittle (see Q4).
  - `defaultTools` arrays are decorative — tools are not auto-injected into prompts.

### `src/lib/ai/tools/index.ts` (490 lines)

- **What it does**: Defines 10 tools: `web_search`, `web_reader`, `file_read`, `file_write`, `memory_store`, `knowledge_search`, `file_search`, `code_search`, `patch`, `diff`. Provides `getTool`, `listTools`, `executeTool`.
- **Imports**: `fs`, `path`, `invokeFunction`, `writeMemory`, `retrieveMemories`, `db`, types.
- **Callers**: `runtime.ts:12` (via `executeTool`), `api/tools/route.ts:3`, `api/state/route.ts:6`.
- **Status**: Functional but **rarely invoked** (because `parseToolCalls` is broken — Q1). Comment line 2 says "6 real tools" — actually 10.
- **Bugs**:
  - `safeJoin` (line 23): `resolved.startsWith(base)` where `base = "/home/z/my-project"`. This accepts `/home/z/my-project-evil/...` — a directory sibling. Should use `startsWith(base + path.sep)`. **Security smell.**
  - `file_read` allows reading ANY file under `/home/z/my-project` (line 106), including `.env`, `dev.log`, `server.log`, `bun.lock`. No allowlist. **Security risk** if the model is prompted to read secrets.
  - `file_write` rejects path separators (line 138) but writes to `/upload/` — OK.
  - `code_search` walks the entire project tree (line 358) up to depth 5 — slow on large repos. Reads every `.ts/.tsx/.js/...` file under 100KB. Could be DoS vector if exposed.
  - `executeTool` timeout (line 478-483) uses `Promise.race` — the tool's `execute` continues running after timeout, just its result is ignored. No cancellation. Resource leak.

### `src/lib/ai/execution-engine.ts` (251 lines)

- **What it does**: Extracts code blocks from model responses, writes them to `/upload/`, stores as `Artifact`. NOT a real execution engine (Q2).
- **Imports**: `fs`, `path`, `db`.
- **Callers**: `runtime.ts:14`, `runtime.ts:417`.
- **Status**: Functional for file creation. Misleadingly named.
- **Bugs**:
  - `extractCodeBlocks` regex (line 54) requires newline after ```` ```lang ```` — fails on ```` ```lang ``` ```` (single line).
  - Filename hint regex (line 65) looks 200 chars before the code block. If model says "create file X" 300 chars before, missed.
  - `getArtifactForPreview` (line 233) is exported but **never called** — `api/preview/[id]/route.ts:16` queries `db.artifact.findUnique` directly, bypassing this helper. Dead code.

### `src/lib/ai/skills/index.ts` (113 lines)

- **What it does**: Reads `/home/z/my-project/skills/*/SKILL.md` files, parses frontmatter, caches for 60s. Provides `loadSkills`, `listSkills`, `getSkill`, `searchSkills`, `clearSkillsCache`.
- **Imports**: `fs`, `path`, types.
- **Callers**: `api/skills/route.ts:3`, `api/state/route.ts:5`.
- **Status**: Functional. Skills are metadata-only — no execution. The `path` and `size` are stored but content is never read.
- **Bugs**:
  - `getSkill` (line 88) and `clearSkillsCache` (line 109) are exported but **never called**. Dead.
  - Frontmatter parser (line 15) is custom — doesn't handle multi-line values, arrays, or quoted strings properly.
  - If `/skills/` folder doesn't exist, returns `[]` silently (line 75-77 catch).

### `src/lib/ai/types.ts` (162 lines)

- **What it does**: Defines shared types: `AgentRole` (15 values), `MemoryType` (9), `TaskStatus` (7), `ExecutionPhase` (8), `LogLevel`, `AgentDefinition`, `ToolDefinition`, `SkillDefinition`, `ChatMessage`, `ChatRequest`, `StreamEvent`, `PlanTask`, `ExecutionContext`, `SystemState`, `ExecutionLogSummary`.
- **Imports**: nothing.
- **Callers**: every AI lib file.
- **Status**: Functional. Note: `agents/index.ts` imports `AgentDefinition` from `./types` (line 5) but `./types` is `src/lib/ai/types.ts` — correct.
- **Bugs**: `ExecutionPhase` includes `"validate" | "repair" | "retest" | "review"` — none are used in runtime.ts. Misleading type.

### `src/lib/ai/runtime.ts` (765 lines) — THE EXECUTION RUNTIME

- **What it does**: `executeTask` (single agent + model call + tool calls + memory writes + execution engine) and `runAutonomousLoop` (orchestrator plans → execute tasks in order).
- **Imports**: `db`, `chat`, `chatStream`, `generateStructured`, `assembleContext`, `pickAgentForMessage`, `getAgent`, `executeTool`, `writeMemory`, `executeResponse`, types.
- **Callers**: `api/chat/route.ts:7`.
- **Status**: Functional but with deep architectural issues.
- **Bugs / violations**:
  1. `parseToolCalls` is broken (Q1) — tools essentially never execute.
  2. `parseMemoryWrites` (line 67) requires specific JSON — never fires.
  3. `looksLikeArtifact` (line 88) is **defined but never called** — dead code. The execution engine does its own code block extraction.
  4. Tool calls capped at 3 (line 294: `toolCalls.slice(0, 3)`).
  5. Memory writes capped at 3 (line 376).
  6. Auto-memory writes low-value content (line 396-404).
  7. Task marked completed without validation (line 482-491).
  8. Autonomous loop breaks on first task failure (line 706) — no replanning.
  9. `failurePolicy` field on Task is ignored — always `break` on failure.
  10. No `validate` / `repair` / `retest` / `review` phases ever emitted.
  11. `executeTask` does NOT validate that the response actually addresses the userMessage — just saves whatever the model returns.
  12. Streaming + tool calls: the model's first response is streamed (line 256-270), but the follow-up after tool result is NOT streamed (line 346 uses `chat()` not `chatStream()`).

### `src/lib/mimo-store.ts` (643 lines) — Zustand store

- **What it does**: Client state: agents, skills, tools, projects, conversations, current conversation, messages, tasks, artifacts, memories, decisions, executions, systemState, UI state, settings (locale, theme), streaming state, stream event handler.
- **Imports**: `zustand`, types from `ai-client`, `Locale`/`Direction` from `i18n`, `safeFetch`/`ApiError` from `safe-fetch`.
- **Callers**: every `src/components/mimo/*` component.
- **Status**: Functional. Race conditions exist (Q7).
- **Bugs**:
  - `handleStreamEvent` "end" case (line 550-633): two `setTimeout` blocks fire fetches with captured `convId`. If user switches conversation, stale state overwrites. See Q7.
  - "start" case (line 374-396): two parallel fetches for same data (`loadConversations()` + inline `safeFetch("/api/conversations")`).
  - "artifact" case (line 460-481): fires immediate fetch on every artifact event. Multiple events = multiple racing fetches.
  - `endStreaming` (line 332-365): deduplication check (line 339) compares `lastMsg.content === finalContent` — but `finalContent` is the streamed content, which may differ from server-saved message. Fragile.
  - `pendingPreview` is set on "artifact" event (line 472) AND on "preview" event (line 488). Both set `activePreview` too. Redundant.
  - No persistence: locale, theme, autonomousMode lost on page refresh. No `localStorage` middleware.

### `src/lib/ai-client.ts` (192 lines)

- **What it does**: Frontend mirror types of backend Prisma models + `StreamEvent` type.
- **Imports**: nothing.
- **Callers**: `mimo-store.ts`, all components.
- **Status**: Functional. Mirror of `types.ts` + Prisma models.
- **Bugs**: `Message.previewUrl` and `Message.previewName` (lines 37-38) are added client-side — not in Prisma schema. Confusing dual-source-of-truth.

### `src/lib/safe-fetch.ts` (88 lines)

- **What it does**: Wraps `fetch` with HTML-response detection, network error handling, JSON parse safety. Exposes `ApiError`, `safeFetch`, `checkServerHealth`.
- **Imports**: nothing.
- **Callers**: `mimo-store.ts`, `projects-panel.tsx`.
- **Status**: Functional. Good defensive design.
- **Bugs**: `checkServerHealth` (line 80) is exported but **never called**. Dead.

### `src/lib/i18n.ts` (181 lines)

- **What it does**: Defines `Locale` ("ar"|"en"), `Direction` ("rtl"|"ltr"), translation dictionary (~50 keys), `t()`, `getDirection()`, `getTranslations()`, `listLocales()`.
- **Imports**: nothing.
- **Callers**: every component.
- **Status**: Functional. Most components bypass it (Q10).
- **Bugs**:
  - `getTranslations` (line 174) is exported but **never called**. Dead.
  - No pluralization support.
  - No interpolation support.
  - Hardcoded "69 skills" string (line 43) — should be dynamic.

### `src/lib/db.ts` (13 lines)

- **What it does**: Prisma client singleton.
- **Imports**: `@prisma/client`.
- **Callers**: every API route, every AI lib.
- **Status**: Functional.
- **Bugs**: `log: ['query']` (line 10) — every SQL query logged to console in dev. Noisy, potential info leak in production if logs are exposed.

### `src/app/api/chat/route.ts` (128 lines) — THE MAIN ENDPOINT

- **What it does**: SSE streaming endpoint. Creates/verifies conversation, saves user message, picks agent, calls `executeTask` or `runAutonomousLoop`, streams events.
- **Imports**: `NextRequest`, `NextResponse`, `db`, `executeTask`, `runAutonomousLoop`, `pickAgentForMessage`, types.
- **Callers**: `chat-panel.tsx:103` (POST).
- **Status**: Functional.
- **Bugs**:
  - No authentication. Anyone can send messages.
  - No rate limiting.
  - `maxDuration = 300` (line 12) — 5 minutes. May exceed platform limits on some hosts.
  - No input size validation on `message` — could be megabytes.
  - `controller.close()` in `finally` (line 114) — if `start()` throws synchronously, the stream is closed without an error event.

### `src/app/api/preview/[id]/route.ts` (84 lines)

- **What it does**: Serves artifact content with appropriate Content-Type. Wraps partial HTML in full document.
- **Imports**: `NextRequest`, `NextResponse`, `db`.
- **Callers**: `preview-panel.tsx:46`, `inline-preview.tsx:28`.
- **Status**: Functional.
- **Bugs**:
  - No CSP header.
  - `artifact.name` injected into `<title>` (line 46) without HTML escaping. **XSS smell** (mitigated by sandbox, but still wrong).
  - No caching headers (line 79: `Cache-Control: no-cache` — OK).

### `src/app/api/conversations/route.ts` (35 lines), `[id]/route.ts` (70 lines)

- **What it does**: Standard CRUD. GET list (50, with counts), POST create, GET single (with messages/tasks/artifacts/decisions/memories/executions), PATCH (title/goal/status/autonomous/projectType/projectId/pinned/tags), DELETE.
- **Imports**: `NextRequest`, `NextResponse`, `db`.
- **Callers**: `mimo-store.ts` loaders.
- **Status**: Functional.
- **Bugs**: No auth. No pagination on GET list (hardcoded `take: 50`). GET single loads ALL messages (no pagination) — large conversations will OOM.

### `src/app/api/projects/route.ts` (35 lines), `[id]/route.ts` (67 lines)

- **What it does**: Standard CRUD for projects.
- **Imports**: `NextRequest`, `NextResponse`, `db`.
- **Callers**: `mimo-store.ts:188`, `projects-panel.tsx:24,41`.
- **Status**: Functional but **projects are decorative** — no conversation linking UI, no entity management, no memory scoping by project.
- **Bugs**: No auth. `goals`, `techStack`, `requirements` are JSON-stringified in API (lines 28-30) — client must parse. No validation.

### `src/app/api/state/route.ts` (68 lines)

- **What it does**: Returns system counts + 10 recent execution logs.
- **Imports**: `NextResponse`, `db`, `listAgents`, `listSkills`, `listTools`.
- **Callers**: `mimo-store.ts:276`.
- **Status**: Functional.
- **Bugs**: `listSkills()` does filesystem I/O on every call (cached 60s). `listAgents()` and `listTools()` are synchronous. `Promise.all` (line 19) mixes async and sync — works but inconsistent.

### `src/app/api/tools/route.ts` (15 lines), `agents/route.ts` (9 lines), `skills/route.ts` (10 lines)

- **What it does**: List endpoints for tools, agents, skills.
- **Status**: Functional. Trivial pass-throughs.

### `src/app/api/memory/route.ts` (30 lines), `tasks/route.ts` (37 lines), `artifacts/route.ts` (16 lines), `decisions/route.ts` (16 lines)

- **What it does**: GET (by conversationId) and sometimes POST.
- **Status**: Functional.
- **Bugs**:
  - `artifacts/route.ts` has GET only — no POST. Artifacts can only be created via the execution engine.
  - `decisions/route.ts` has GET only — decisions only created by autonomous loop.
  - `tasks/route.ts` POST exists but is never called by frontend.

### `src/app/api/route.ts` (5 lines) — DEAD

- **What it does**: Returns `{"message":"Hello, world!"}`.
- **Callers**: none.
- **Status**: DEAD CODE. Should be removed.

### `src/components/mimo/chat-panel.tsx` (521 lines)

- **What it does**: Main chat UI. Message list, streaming display, agent selector, autonomous toggle, composer with send/stop.
- **Imports**: React hooks, `useMimo`, UI components, `getAgentIcon`, `Markdown`, `InlinePreview`, `cn`, `t`, `getDirection`.
- **Callers**: `workspace.tsx:220,225`.
- **Status**: Functional. Many hardcoded English strings (Q10).
- **Bugs**:
  - `stop()` (line 63-75): aborts the fetch but the server-side `executeTask` continues running, consuming tokens and writing to DB. No server-side cancellation.
  - User message added to UI immediately (line 84-97) — but if the API call fails, the message stays in UI without a corresponding DB row. State drift.
  - EmptyState (line 402-433) is hardcoded English.
  - Agent selector buttons (line 340-358) render all 15 agents — cluttered.

### `src/components/mimo/workspace.tsx` (256 lines)

- **What it does**: Top-level layout. Sidebar + main area (chat or chat+aside panel). Header with panel switcher, command palette button, theme toggle, language toggle, settings.
- **Imports**: React, `useMimo`, all panels, `cn`, `t`, `getDirection`, lucide icons.
- **Callers**: `page.tsx:4`.
- **Status**: Functional.
- **Bugs**: `useEffect` initial load (line 75-82) has 6 dependency-array entries — all stable function references from Zustand, so it runs once. OK. Periodic refresh every 10s (line 85-90) — fetches `/api/state` even when tab is hidden. Wasteful.

### `src/components/mimo/preview-panel.tsx` (221 lines)

- **What it does**: Full-page preview with view mode (preview/code), device sizes (desktop/tablet/mobile), refresh, open-external.
- **Imports**: React, `useMimo`, UI components, `cn`, `t`, lucide.
- **Callers**: `workspace.tsx:216`.
- **Status**: Functional.
- **Bugs**: `isLoading` state (line 35) is set but never set to `true` — the `onLoad` handler only sets it to `false` (line 205). Dead state.

### `src/components/mimo/inline-preview.tsx` (108 lines)

- **What it does**: Inline iframe preview in chat messages. Toggle code view, refresh, expand/collapse.
- **Imports**: React, UI, `cn`, lucide.
- **Callers**: `chat-panel.tsx:24,317,513`.
- **Status**: Functional.
- **Bugs**: `iframeRef` (line 19) is assigned but never read. Dead ref.

### `src/components/mimo/sidebar.tsx` (273 lines)

- **What it does**: Conversation list with search, pin, rename, delete. System state stats at bottom.
- **Imports**: React, `useMimo`, UI, `cn`, `date-fns`, `t`, `getDirection`, lucide.
- **Callers**: `workspace.tsx:128`.
- **Status**: Functional.
- **Bugs**: `(conv as { pinned?: boolean }).pinned` casts (lines 63, 64, 142) — `pinned` is not in the `Conversation` type (`ai-client.ts:42-57`). The field exists in Prisma but isn't surfaced in the client type. Type unsoundness.

### `src/components/mimo/markdown.tsx` (174 lines)

- **What it does**: Custom mini-markdown renderer. Parses code blocks and inline formatting (inline code, bold). No headers, lists, links, images, tables.
- **Imports**: React, `cn`, lucide.
- **Callers**: `chat-panel.tsx:23,310,507`.
- **Status**: Functional but **extremely limited**. `react-markdown` is in `package.json:69` but unused — this custom renderer replaces it.
- **Bugs**:
  - No support for `# Headers`, `- lists`, `[links](url)`, `![images](url)`, `> quotes`, `| tables |`. Most markdown content renders as plain text.
  - `renderText` (line 51) splits by `\n` and renders each line with `<br />` — breaks paragraphs.
  - Bold regex (line 81) `/\*\*([^*]+)\*\*/g` doesn't handle `__bold__` or nested formatting.

### `src/components/mimo/settings-dialog.tsx` (150 lines)

- **What it does**: Settings dialog with language, theme, direction info, system info.
- **Imports**: `useMimo`, `t`, `getDirection`, `listLocales`, UI, lucide, `cn`.
- **Callers**: `workspace.tsx:252`.
- **Status**: Functional.
- **Bugs**: Hardcoded "10 agents · 6 tools · 69 skills" (line 115) — wrong (15 agents, 10 tools, variable skills). "v2.0" string hardcoded (line 114).

### `src/components/mimo/command-palette.tsx` (131 lines)

- **What it does**: Cmd+K palette with 11 commands (new, chat, tasks, agents, artifacts, memory, decisions, timeline, skills, settings, autonomous).
- **Imports**: React, `useMimo`, UI, lucide.
- **Callers**: `workspace.tsx:249`.
- **Status**: Functional.
- **Bugs**: 100% English. No `t()` calls. `shouldFilter={false}` (line 94) + manual filter (line 103) — works but defeats cmdk's built-in fuzzy search.

### `src/components/mimo/projects-panel.tsx` (149 lines), `tools-panel.tsx` (64 lines), `tasks-panel.tsx` (97 lines), `agents-panel.tsx` (69 lines), `artifacts-panel.tsx` (104 lines), `memory-panel.tsx` (76 lines), `decisions-panel.tsx` (56 lines), `timeline-panel.tsx` (93 lines), `skills-panel.tsx` (61 lines)

- **What they do**: Read-only display panels for their respective data.
- **Status**: Functional but mostly hardcoded English (Q10). No create/edit/delete UI except projects-panel (create+delete) and the sidebar (rename+delete+pin conversations).
- **Bugs**:
  - `tasks-panel.tsx:33`: `tasks.filter(t => t.status === "completed").length` — recalculates on every render. Minor.
  - `artifacts-panel.tsx`: clicking opens a dialog with raw content in `<pre>` — no syntax highlighting, no preview, no download.
  - `memory-panel.tsx`: no edit/delete, no manual create UI (despite `/api/memory` POST existing).
  - `skills-panel.tsx:21`: `loadSkills(e.target.value)` on every keystroke — no debounce. Floods the API.

### `next.config.ts` (13 lines)

- **Status**: `ignoreBuildErrors: true` (Q8), `reactStrictMode: false`, `output: "standalone"`. No CSP, no security headers, no image optimization config, no experimental features.

### `package.json` (94 lines)

- **Status**: 36 dependencies, many unused. Notable: `next-auth` (unused — no auth), `@tanstack/react-query` (unused — Zustand instead), `react-markdown` (unused — custom renderer), `react-syntax-highlighter` (unused), `@mdxeditor/editor` (unused), `recharts` (unused), `react-resizable-panels` (unused), `framer-motion` (unused), `next-intl` (unused — custom i18n), `next-themes` (unused — custom theme). ~10 unused packages adding to bundle/install time.

### `src/app/layout.tsx` (53 lines)

- **Status**: Functional. Geist font, metadata. No theme provider (custom). No locale provider (custom). `Toaster` imported (line 4) — but `useToast` is never called in any MiMo component. Toast UI is dead.

### `src/app/page.tsx` (6 lines)

- **Status**: Functional. Renders `<Workspace />`.

### `src/app/globals.css` (137 lines)

- **Status**: Functional. Tailwind v4 with `@theme inline` mapping. Light + dark themes. Custom `@source` directives to limit content scanning (lines 9-18) — good.

### `src/components/mimo/agent-icons.ts` (43 lines)

- **Status**: Functional. Maps 15 icon names to lucide components.

---

## 4. ARCHITECTURAL VIOLATIONS SUMMARY

1. **TypeScript errors silenced** (`next.config.ts:7`) — production ships broken types.
2. **React strict mode disabled** (`next.config.ts:9`) — dev-mode sanity checks off.
3. **No authentication** on any API route — anyone can read/write all data.
4. **No rate limiting** — vulnerable to abuse.
5. **No CSRF protection** — Next.js defaults to same-origin, but no explicit tokens.
6. **No CSP headers** — no defense against injected scripts.
7. **SQLite in production** — won't scale, no concurrent writes.
8. **Streaming is fake** (`model.ts:126-169`) — adds latency, removes no real wait.
9. **Tool calls never fire** (`runtime.ts:36-62`) — tools are decorative.
10. **No real execution** (`execution-engine.ts`) — just file write, no run/test.
11. **No validation phase** in autonomous loop — tasks marked completed blindly.
12. **Memory consolidation never runs** (`memory.ts:110`) — lifecycle fictional.
13. **Knowledge graph models unused** — 3 dead Prisma models.
14. **Race conditions** in store (`mimo-store.ts:550-633`) — stale state overwrites.
15. **`file_read` reads any file** under project root — security risk.
16. **`safeJoin` prefix bug** (`tools/index.ts:23`) — accepts sibling directories.
17. **Hardcoded counts** ("10 agents", "6 tools", "69 skills") in UI strings.
18. **Arabic localization partial** — most panels hardcoded English.
19. **Custom markdown renderer** misses most markdown features.
20. **~10 unused npm dependencies** — bundle bloat, attack surface.

---

## 5. FINAL VERDICT

The MiMo AI Platform is a **functional prototype** with serious architectural issues. The core chat loop works (user sends message → model responds → response saved → code blocks written to disk → preview shown). The autonomous loop works in the sense that it runs multiple tasks sequentially. But:

- **Tools essentially never execute** (parseToolCalls broken).
- **No real execution** (just file write).
- **No validation** (tasks marked completed blindly).
- **No memory consolidation** (lifecycle fictional).
- **Knowledge graph is decorative** (3 dead models).
- **TypeScript errors silenced** in production builds.
- **No auth, no rate limit, no CSP**.
- **Race conditions** in client state management.
- **Arabic localization partial**.
- **Hardcoded counts** lie about the system's capabilities.

The system is **demoable but not production-ready**. It needs significant refactoring before it can be trusted with real work.
