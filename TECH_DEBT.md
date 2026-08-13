# MiMo AI Platform — Technical Debt Register

> Every debt item: severity, evidence, impact, fix size, interest (compounds if unpaid).
> Sorted by severity (CRITICAL → LOW).

---

## Severity Scale

| Level | Meaning |
|---|---|
| 🔴 CRITICAL | Security, data loss, or production-breaking |
| 🟠 HIGH | Architectural violation, blocks future work |
| 🟡 MEDIUM | Bug, race condition, or significant UX issue |
| 🟢 LOW | Code smell, dead code, minor inconsistency |

---

## CRITICAL (🔴) — Must fix before any production use

### TD-001: `ignoreBuildErrors: true` ships broken types to production
- **Evidence**: `next.config.ts:7`
- **Impact**: Any TypeScript error introduced by a future edit passes `next build` silently and manifests at runtime. Type safety is effectively disabled in production.
- **Interest**: Compounds — every new file may introduce untyped bugs that ship undetected.
- **Fix size**: S (remove 1 line). But will surface existing errors that need fixing.
- **Fix**: Remove `typescript: { ignoreBuildErrors: true }` and fix all surfaced errors.

### TD-002: `reactStrictMode: false` disables React sanity checks
- **Evidence**: `next.config.ts:9`
- **Impact**: React's dev-mode checks for impure renders, missing keys, effect leaks, deprecated APIs are all disabled. Bugs that React would catch in development go unnoticed.
- **Interest**: Compounds — subtle effect bugs accumulate.
- **Fix size**: S (remove 1 line). May surface double-render warnings that need fixing.
- **Fix**: Remove `reactStrictMode: false` and fix any double-render issues.

### TD-003: No authentication on any API route
- **Evidence**: No `getServerSession`, no `withAuth`, no auth check in any `src/app/api/*/route.ts`. `next-auth` is in `package.json:61` but unused.
- **Impact**: Anyone with network access can read/write/delete ALL conversations, projects, memories, artifacts, decisions. Can execute file_read on `.env`. Can execute file_write to upload arbitrary files. Can exhaust the AI model quota.
- **Interest**: Compounds — every new API route inherits the vulnerability.
- **Fix size**: M (implement auth middleware + login flow).
- **Fix**: Implement next-auth with credentials/OAuth, add `getServerSession()` check to every route, add user-scoped queries.

### TD-004: No rate limiting
- **Evidence**: No rate limit middleware. Only retry/backoff on outbound model calls (`model.ts:51-65`).
- **Impact**: Any single client can flood the API, exhaust AI quota, DoS the ZAI SDK account.
- **Interest**: Linear — abuse risk grows with traffic.
- **Fix size**: M (add rate limit middleware, e.g., `upstash/ratelimit`).
- **Fix**: Add per-IP and per-user rate limits on `/api/chat` (especially) and all write endpoints.

### TD-005: `file_read` tool reads any file under project root
- **Evidence**: `tools/index.ts:90-117` — `safeJoin(SANDBOX_ROOT, relPath)` allows reading any file under `/home/z/my-project/`. No allowlist.
- **Impact**: If the model is prompted (or prompt-injected) to read `.env`, `dev.log`, `server.log`, `bun.lock`, or any secret file, the contents leak into the chat history and DB.
- **Interest**: Static — vulnerability doesn't grow but remains exploitable.
- **Fix size**: S (add allowlist of readable directories).
- **Fix**: Restrict `file_read` to `/upload/`, `/src/`, `/tests/`, `/public/`. Explicitly deny `.env*`, `*.log`, `bun.lock`, `package-lock.json`.

### TD-006: `safeJoin` prefix check accepts sibling directories
- **Evidence**: `tools/index.ts:23-29` — `resolved.startsWith(base)` where `base = "/home/z/my-project"`.
- **Impact**: A path like `/home/z/my-project-evil/secret.txt` passes the check (it starts with the string `/home/z/my-project`). Path traversal via sibling directory.
- **Interest**: Static.
- **Fix size**: S (1-line fix).
- **Fix**: Change to `resolved.startsWith(base + path.sep)` or use `path.relative()` and check it doesn't start with `..`.

### TD-007: SQLite in production
- **Evidence**: `schema.prisma:13` — `provider = "sqlite"`.
- **Impact**: No concurrent writes (SQLite locks whole DB on write). Won't scale beyond a single user. No replication, no failover, no backup story.
- **Interest**: Compounds — every new user increases write contention.
- **Fix size**: L (migrate to Postgres, update `schema.prisma`, run migrations, update `DATABASE_URL`).
- **Fix**: Switch to Postgres. Update schema provider. Run `prisma migrate`. Test all queries (SQLite has no `JSON` type, Postgres does — some `String?` fields should become `Json?`).

---

## HIGH (🟠) — Architectural violations, blocks future work

### TD-008: `parseToolCalls` regex never matches model output (tools effectively dead)
- **Evidence**: `runtime.ts:36-62` — requires exact `{"tool":"name","input":{...}}` JSON. No agent prompt instructs this format (read all 15 prompts in `agents/index.ts:25-593`).
- **Impact**: All 10 tools (`web_search`, `web_reader`, `file_read`, `file_write`, `memory_store`, `knowledge_search`, `file_search`, `code_search`, `patch`, `diff`) are essentially never invoked. The "tool system" is decorative.
- **Interest**: Compounds — every feature that assumes tools work (research, code analysis, file ops) is broken.
- **Fix size**: M (use ZAI SDK's native function calling, or add tool-call instructions to every agent prompt).
- **Fix**: Either (a) switch to ZAI SDK's `tools` parameter for native function calling, or (b) add explicit JSON tool-call format to every agent system prompt + parse robustly.

### TD-009: Streaming is fake (adds latency, removes no wait)
- **Evidence**: `model.ts:126-169` — `chatStream` calls non-streaming `chat()`, then chunks the full response into 3-word bursts with 20ms delay.
- **Impact**: User waits for full model response (could be 30-60s) before seeing ANY output. Then the chunked delivery adds artificial delay. Worst of both worlds.
- **Interest**: Static — but UX is permanently degraded.
- **Fix size**: M (investigate ZAI SDK streaming; if truly broken, at least remove the artificial chunking and yield full content immediately).
- **Fix**: Either (a) get real streaming working with ZAI SDK, or (b) remove the chunk-by-word loop and yield the full response in one `delta` event.

### TD-010: No validation phase in autonomous loop
- **Evidence**: `runtime.ts:482-491` — task marked `completed` immediately after model responds. No validation rules checked (despite `Task.validationRules` field in `schema.prisma:73`). No QA/reviewer agent auto-invoked. `ExecutionPhase` type includes `validate | repair | retest | review` (`types.ts:46-49`) but these are never emitted.
- **Impact**: Autonomous missions "complete" with broken or low-quality output. User has no signal that work was validated. The "QA Engineer" and "Reviewer" agents exist but are never auto-invoked.
- **Interest**: Compounds — every autonomous mission may produce unvalidated work that erodes user trust.
- **Fix size**: L (add validation phase: invoke QA agent, check validationRules, optionally invoke reviewer, retry on failure).
- **Fix**: After `executeTask`, invoke `qa` agent with the task + output. If QA returns FAIL, invoke `debugger` agent to repair, then re-test. Update task status to `validating` → `completed` or `failed` based on QA verdict.

### TD-011: Memory consolidation never runs
- **Evidence**: `memory.ts:110-131` `consolidateMemories` is exported but never imported/called.
- **Impact**: Short_term memories never promote to long_term. The "Memory Lifecycle" described in architecture docs is fictional. Memory table grows unbounded with low-value auto-memories.
- **Interest**: Compounds — memory table bloats, retrieval quality degrades over time.
- **Fix size**: S (call `consolidateMemories(conversationId)` after each `executeTask` completes, or on a timer).
- **Fix**: Add `await consolidateMemories(conversationId)` at the end of `executeTask` (runtime.ts:513). Or run as a cron/background job.

### TD-012: Knowledge graph is dead (3 Prisma models unused)
- **Evidence**: `KnowledgeEntity` (schema.prisma:255-269), `KnowledgeRelation` (schema.prisma:271-282), `AgentActivity` (schema.prisma:96-112) — 0 references in `src/`.
- **Impact**: Dead schema adds maintenance burden (migrations, type generation). UI shows "0 entities" on projects. `knowledge_search` tool queries empty `KnowledgeEntry` table (also never written to).
- **Interest**: Static.
- **Fix size**: S (remove models from schema) or L (implement the knowledge graph properly).
- **Fix**: Either (a) remove the 3 dead models + `KnowledgeEntry` (if also unused) from `schema.prisma`, or (b) implement entity extraction on artifacts, relation inference, and write paths.

### TD-013: Race conditions in `mimo-store.ts` setTimeout fetches
- **Evidence**: `mimo-store.ts:610-633` — "end" event fires `setTimeout(..., 800)` and `setTimeout(..., 1000)` with captured `convId`. If user switches conversation, stale state overwrites.
  Also: `mimo-store.ts:460-466` — "artifact" event fires immediate fetch; multiple events race.
  Also: `mimo-store.ts:374-388` — "start" event fires two parallel fetches for same data.
- **Impact**: User switches conversation during streaming → previous conversation's tasks/artifacts/decisions/memories overwrite the new conversation's view. UI shows wrong data.
- **Interest**: Static — bug triggers on user action, not automatically.
- **Fix size**: M (add conversation ID validation in fetch callbacks, or use AbortController).
- **Fix**: Capture `convId` AND verify `state.currentConversation?.id === convId` before calling `set()`. Or use AbortController per conversation.

### TD-014: Memory retrieval `where.OR` overwrite bug
- **Evidence**: `memory.ts:69-77` — when keywords exist, `where.OR` is overwritten (line 70). The conversationId OR filter (set at line 57) is lost.
- **Impact**: When keywords are present, memories from ALL conversations are returned, not just the current one. Privacy leak + noisy retrieval.
- **Interest**: Static.
- **Fix size**: S (merge OR arrays instead of overwriting).
- **Fix**: Change line 70 from `where.OR = [...]` to `where.OR = [...(where.OR ?? []), ...keywordOrs]` and use `AND` for conversationId filter:
  ```ts
  if (conversationId) {
    where.AND = [{ OR: [{ conversationId: null }, { conversationId }] }];
  }
  ```

### TD-015: Hardcoded counts in UI ("10 agents · 6 tools · 69 skills")
- **Evidence**: `settings-dialog.tsx:115`, `chat-panel.tsx:411`, `i18n.ts:43`.
- **Impact**: UI lies. Actual: 15 agents, 10 tools, variable skills (depends on `/skills/` folder). User trust erodes when they count and find different numbers.
- **Interest**: Static.
- **Fix size**: S (replace hardcoded strings with dynamic counts from `systemState`).
- **Fix**: Use `systemState.agents`, `systemState.tools`, `systemState.skills` from `useMimo()`.

### TD-016: No CSP headers
- **Evidence**: `next.config.ts` has no `headers()` config. `api/preview/[id]/route.ts:76-82` sets only `X-Content-Type-Options: nosniff`.
- **Impact**: No defense-in-depth against injected scripts. If sandbox is ever weakened, XSS becomes trivial.
- **Interest**: Static.
- **Fix size**: S (add `Content-Security-Policy` header to all routes).
- **Fix**: Add `headers()` to `next.config.ts` with CSP `default-src 'self'; script-src 'self'; ...`.

### TD-017: ~20 unused npm dependencies
- **Evidence**: `package.json` — `next-auth`, `next-intl`, `next-themes`, `react-markdown`, `react-syntax-highlighter`, `@tanstack/react-query`, `@tanstack/react-table`, `@mdxeditor/editor`, `recharts`, `react-resizable-panels`, `framer-motion`, `react-hook-form`, `@hookform/resolvers`, `zod`, `react-day-picker`, `embla-carousel-react`, `input-otp`, `@dnd-kit/*` (3), `@reactuses/core`, `vaul`, `sonner`, `uuid`.
- **Impact**: Slower installs, larger `node_modules`, larger bundle, larger attack surface, more vulnerability advisories to triage.
- **Interest**: Compounds — every `bun install` pulls + audits them.
- **Fix size**: M (remove each, verify build still works).
- **Fix**: `bun remove <package>` for each unused. Re-run `bun run build` to catch any indirect usage.

### TD-018: ~37 unused shadcn/ui components
- **Evidence**: `src/components/ui/` has 48 files. MiMo imports only ~9 (button, card, badge, input, textarea, dialog, command, scroll-area, progress, separator).
- **Impact**: Maintenance burden, bundle size, confusing for new contributors.
- **Interest**: Static.
- **Fix size**: M (delete unused files, update `components.json`).
- **Fix**: Delete all `ui/*.tsx` not imported by `src/components/mimo/*` or `src/app/*`.

### TD-019: No server-side cancellation when user clicks Stop
- **Evidence**: `chat-panel.tsx:63-75` — `abortRef.current.abort()` aborts the client fetch, but the server-side `executeTask` continues running (no AbortSignal passed to `chat()` or `executeTool()`). Tokens are consumed, DB writes happen, files are created — all for a response the user will never see.
- **Impact**: Wasted AI quota, wasted compute, orphaned DB rows and files.
- **Interest**: Linear — every Stop click wastes resources.
- **Fix size**: M (pass AbortSignal through the call chain).
- **Fix**: Pass `req.signal` from `api/chat/route.ts` to `executeTask` to `chat()` to `zai.chat.completions.create({ signal })`. Check `signal.aborted` before DB writes.

### TD-020: `failurePolicy` field on Task is ignored
- **Evidence**: `schema.prisma:74` defines `failurePolicy` (`retry | skip | abort | escalate`). `runtime.ts:706` always `break`s on failure regardless of policy. `runtime.ts:614` always sets `failurePolicy: "retry"`.
- **Impact**: The "failure policy" feature is decorative. No skip/abort/escalate logic exists.
- **Interest**: Static.
- **Fix size**: M (implement policy-based failure handling).
- **Fix**: Read `task.failurePolicy` in autonomous loop. `retry` → retry up to `maxRetries`. `skip` → mark failed, continue. `abort` → stop mission. `escalate` → invoke orchestrator to replan.

### TD-021: Task dependencies (DAG) never enforced
- **Evidence**: `schema.prisma:70` `dependencies` field (JSON array of task IDs). Never read by `runtime.ts`. Tasks run in `executionOrder` array order, not DAG.
- **Impact**: Parallel-capable tasks run sequentially. No topological sort. No blocked-task detection.
- **Interest**: Static.
- **Fix size**: L (implement DAG execution).
- **Fix**: Parse `dependencies`, build graph, topological sort, execute independent tasks in parallel (with concurrency limit).

---

## MEDIUM (🟡) — Bugs, UX issues

### TD-022: Auto-routing keyword bugs in `pickAgentForMessage`
- **Evidence**: `agents/index.ts:641-761`:
  - Line 656: `"find"` matches "find me a coffee" → researcher.
  - Line 678: `"write"` and `"create"` match "write a thank-you note" → developer.
  - Line 670 vs 661: `"design"` ambiguous between planner and architect.
- **Impact**: Wrong agent selected for common messages. User must manually override.
- **Fix size**: M (use intent classification or scoring instead of first-match keywords).
- **Fix**: Replace with scoring system: each keyword adds points to an agent; highest score wins. Or use a small LLM call to classify intent.

### TD-023: Custom markdown renderer misses most features
- **Evidence**: `markdown.tsx:17-114` — handles only code blocks, inline code, bold. No headers, lists, links, images, tables, blockquotes.
- **Impact**: Model responses (which use full markdown) render poorly. Headers show as plain text, lists as flat lines, links as raw URLs.
- **Fix size**: S (replace with `react-markdown` which is already in deps).
- **Fix**: `bun remove` nothing (react-markdown is installed but unused). Replace `markdown.tsx` content with `react-markdown` + `remark-gfm` wrapper. Delete custom renderer.

### TD-024: Arabic localization partial (most panels hardcoded English)
- **Evidence**: See Q10 in SYSTEM_AUDIT.md. `tasks-panel.tsx`, `agents-panel.tsx`, `artifacts-panel.tsx`, `memory-panel.tsx`, `decisions-panel.tsx`, `timeline-panel.tsx`, `skills-panel.tsx`, `command-palette.tsx` — 100% hardcoded English.
- **Impact**: Arabic speakers get a half-translated UI.
- **Fix size**: M (add `t()` calls + translation keys for every string).
- **Fix**: Audit every `.tsx` for hardcoded strings. Add keys to `i18n.ts`. Use `t(key, locale)`.

### TD-025: Skills panel search has no debounce
- **Evidence**: `skills-panel.tsx:18-21` — `loadSkills(e.target.value)` on every keystroke.
- **Impact**: Floods `/api/skills?q=...` with requests. Server does filesystem I/O on every call (cached 60s, but still).
- **Fix size**: S (add 300ms debounce).
- **Fix**: Wrap `loadSkills` in `useDebouncedCallback` or `setTimeout`-based debounce.

### TD-026: No client state persistence
- **Evidence**: `mimo-store.ts` has no `persist` middleware. `locale`, `theme`, `autonomousMode`, `selectedAgent` lost on page refresh.
- **Impact**: User must reconfigure settings every session.
- **Fix size**: S (add Zustand `persist` middleware for selected slices).
- **Fix**: `import { persist } from 'zustand/middleware'`. Wrap `useMimo` with `persist({ name: 'mimo-settings', partialize: ({ locale, theme, autonomousMode, selectedAgent }) => ({ locale, theme, autonomousMode, selectedAgent }) })`.

### TD-027: `api/preview/[id]/route.ts` doesn't HTML-escape `artifact.name`
- **Evidence**: `api/preview/[id]/route.ts:46` — `<title>${artifact.name}</title>` without escaping.
- **Impact**: If a filename contains `</title><script>...`, the script executes in the iframe. Confined by sandbox, but still a code-injection smell.
- **Fix size**: S (escape HTML entities).
- **Fix**: `const safeName = artifact.name.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]!))`.

### TD-028: `executeTool` timeout doesn't cancel the tool
- **Evidence**: `tools/index.ts:478-483` — `Promise.race` between `tool.execute(input)` and a timeout promise. On timeout, the tool's promise continues running, just its result is ignored.
- **Impact**: Long-running tools (e.g., `code_search` on a large repo) consume CPU/disk even after timeout.
- **Fix size**: M (use `AbortController` in each tool's `execute`).
- **Fix**: Add `AbortSignal` to `ToolDefinition.execute` signature. Each tool checks `signal.aborted` and rejects. `executeTool` passes a signal that aborts on timeout.

### TD-029: `executeResponse` regex misses single-line code blocks
- **Evidence**: `execution-engine.ts:54` — `/```(\w+)?\s*\n([\s\S]*?)\n```/g` requires `\n` after fence.
- **Impact**: ```` ```js const x = 1 ``` ```` (single line) is not extracted. No file created.
- **Fix size**: S (make `\n` optional).
- **Fix**: Change to `/```(\w+)?\s*\n?([\s\S]*?)\n?```/g`.

### TD-030: `extractCodeBlocks` filename hint limited to 200 chars before block
- **Evidence**: `execution-engine.ts:63` — `content.slice(Math.max(0, blockStart - 200), blockStart)`.
- **Impact**: If model says "create file X" 300 chars before the code block, the hint is missed. File gets auto-generated name.
- **Fix size**: S (increase window or scan whole response).
- **Fix**: Scan the entire response before the block, or use a smarter heuristic (closest "create file" mention).

### TD-031: No pagination on conversation messages
- **Evidence**: `api/conversations/[id]/route.ts:13` — `messages: { orderBy: { createdAt: "asc" } }` — loads ALL messages.
- **Impact**: Large conversations (1000+ messages) OOM the server and client.
- **Fix size**: M (add cursor-based pagination).
- **Fix**: `messages: { take: 50, skip: offset, orderBy: ... }` or cursor-based. Add `?cursor=` query param.

### TD-032: `db.ts` logs every query in dev
- **Evidence**: `db.ts:10` — `log: ['query']`.
- **Impact**: Console flooded with SQL. Potential info leak if logs are exposed. Performance impact.
- **Fix size**: S (remove or gate behind env var).
- **Fix**: `log: process.env.DEBUG_QUERIES ? ['query'] : ['error']`.

### TD-033: `Toaster` imported but `useToast` never called
- **Evidence**: `layout.tsx:4` imports `Toaster`. No `useToast` in any MiMo component.
- **Impact**: Dead UI. Errors shown via `setError()` in store, not toasts.
- **Fix size**: S (either remove Toaster or wire up toasts for errors).
- **Fix**: Either remove `Toaster` from layout, or replace `setError` with `toast.error()` in store.

### TD-034: User message added to UI before API confirmation
- **Evidence**: `chat-panel.tsx:84-97` — user message added to `messages` array immediately. If API call fails (line 170-192), the message stays in UI without a corresponding DB row.
- **Impact**: State drift between UI and DB. On page refresh, the message disappears.
- **Fix size**: S (optimistic update with rollback on error).
- **Fix**: In the `catch` block, remove the user message from `messages` if it wasn't saved.

### TD-035: `runtime.ts:294` caps tool calls at 3 per turn
- **Evidence**: `runtime.ts:294` — `toolCalls.slice(0, 3)`.
- **Impact**: If model legitimately needs 4+ tool calls, the rest are ignored. No feedback to model.
- **Fix size**: S (increase limit or make configurable).
- **Fix**: Increase to 10, or add a "maxToolCallsPerTurn" option to `executeTask`.

### TD-036: `runtime.ts:376` caps memory writes at 3 per turn
- **Evidence**: `runtime.ts:376` — `memoryWrites.slice(0, 3)`.
- **Impact**: Same as TD-035 for memories.
- **Fix size**: S.
- **Fix**: Increase limit.

### TD-037: Autonomous loop breaks on first task failure
- **Evidence**: `runtime.ts:706` — `break; // stop the mission on failure`.
- **Impact**: One failed task aborts the entire mission. No partial success. `failurePolicy: "skip"` would continue, but it's ignored (TD-020).
- **Fix size**: M (depends on TD-020).
- **Fix**: Honor `failurePolicy`. For `skip`, mark task failed and continue to next.

### TD-038: Follow-up model call after tool result is non-streaming
- **Evidence**: `runtime.ts:346` — uses `chat()` not `chatStream()`.
- **Impact**: User sees no progress during tool-result synthesis. Long pauses.
- **Fix size**: S (switch to `chatStream`).
- **Fix**: Replace `chat(...)` with `chatStream(...)` and stream deltas to client.

### TD-039: `code_search` and `file_search` walk entire project tree
- **Evidence**: `tools/index.ts:263-292,319-358` — recursive `walkDir` from `SANDBOX_ROOT`.
- **Impact**: Slow on large repos. Reads every file under 100KB. Could be DoS vector if exposed.
- **Fix size**: M (use ripgrep or index files).
- **Fix**: Use `child_process.exec('rg ...')` for code search. Cache file list. Limit depth.

### TD-040: No log retention policy
- **Evidence**: `ExecutionLog` model (`schema.prisma:192-212`) — no TTL, no cleanup job.
- **Impact**: Logs accumulate forever. DB bloats. `api/state/route.ts:34-48` returns only 10 recent, but table grows unbounded.
- **Fix size**: S (add cron job to delete logs older than 30 days).
- **Fix**: Add `db.executionLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30*24*60*60*1000) } } })` on a daily timer.

### TD-041: Auto-memory content is low-value
- **Evidence**: `runtime.ts:396-404` — writes `"Agent X responded to: Y. Output summary: Z"`.
- **Impact**: Memory table fills with copies of responses, not distilled facts. Retrieval quality degrades.
- **Fix size**: M (use a separate LLM call to extract key facts).
- **Fix**: After `executeTask`, invoke `knowledge` agent with the response and ask it to extract 0-3 key facts worth remembering. Write those as memories.

---

## LOW (🟢) — Code smells, dead code, inconsistencies

### TD-042: Documentation mismatches in comments
- **Evidence**:
  - `agents/index.ts:2` says "10 specialized agents" — actually 15.
  - `tools/index.ts:2` says "6 real tools" — actually 10.
  - `schema.prisma:139` says "7 types" then enumerates 9 memory types.
- **Fix size**: S (update comments).
- **Fix**: Update comments to match reality.

### TD-043: 10 dead exported functions
- **Evidence**: See "DEAD CODE" section in DEPENDENCY_MAP.md.
- **Fix size**: S (delete each).
- **Fix**: Remove `looksLikeArtifact`, `shouldSuggestAutonomous`, `getMemoriesByType`, `consolidateMemories` (if not fixing TD-011), `getArtifactForPreview`, `getSkill`, `clearSkillsCache`, `getTranslations`, `checkServerHealth`.

### TD-044: `types.ts` and `ai-client.ts` duplicate near-identical types
- **Evidence**: `types.ts:5-20` `AgentRole` (15 values) vs `ai-client.ts:3-14` `AgentDefinition`. Both define `StreamEvent`, `SystemState`, etc.
- **Impact**: Manual sync required. Drift over time.
- **Fix size**: M (merge into single file, import from both server and client).
- **Fix**: Move all shared types to `ai-client.ts` (or `types.ts`). Delete the other. Use `import type` to ensure no server code leaks to client bundle.

### TD-045: `Conversation` type missing `pinned` field
- **Evidence**: `ai-client.ts:42-57` — no `pinned` field. But `sidebar.tsx:63,64,142` casts `(conv as { pinned?: boolean }).pinned`.
- **Impact**: Type unsoundness. `pinned` exists in Prisma schema (`schema.prisma:27`) but not in client type.
- **Fix size**: S (add field to type).
- **Fix**: Add `pinned: boolean` to `Conversation` in `ai-client.ts:42`. Update `api/conversations/route.ts` to include `pinned` in response (Prisma returns it by default).

### TD-046: `systemState` type mismatch between server and client
- **Evidence**: `types.ts:138-149` has `SystemState` with `agents: number` and no `tools`/`projects`. `ai-client.ts:136-149` has `agents: number`, `tools: number`, `projects: number`. `api/state/route.ts:50-66` returns `{ agents: agents.length, tools: tools.length, projects }`.
- **Impact**: `types.ts` `SystemState` is stale/wrong.
- **Fix size**: S (sync types).
- **Fix**: Update `types.ts:SystemState` to match `ai-client.ts:SystemState`.

### TD-047: `examples/websocket/` is dead example code
- **Evidence**: `examples/websocket/server.ts` and `frontend.tsx` — no integration with main app.
- **Impact**: Confusing for contributors. May imply websocket support exists.
- **Fix size**: S (delete or move to `docs/examples/`).
- **Fix**: Delete the directory or move it.

### TD-048: `tests/` folder only has shell scripts
- **Evidence**: `tests/database-runtime-build.sh`, `tests/python-runtime-build.sh`, `tests/python-runtime-container.sh`.
- **Impact**: No unit tests, no integration tests. No regression protection.
- **Fix size**: L (write test suite).
- **Fix**: Add `vitest` + `@testing-library/react`. Write tests for: `parseToolCalls`, `extractCodeBlocks`, `pickAgentForMessage`, `safeJoin`, `assembleContext`, store reducers, API routes (with test DB).

### TD-049: `keep-alive.sh`, `start-dev.sh`, `start-server.sh` scripts
- **Evidence**: Root directory has shell scripts for keeping the dev server alive.
- **Impact**: Indicates the dev server crashes/hangs frequently. Workaround for instability.
- **Fix size**: S (delete if stability is fixed) or M (fix underlying instability).
- **Fix**: Investigate why dev server needs keep-alive. Fix root cause.

### TD-050: Hardcoded model name "GLM-4-plus" in settings dialog
- **Evidence**: `settings-dialog.tsx:117` — `"z-ai-web-dev-sdk · GLM-4-plus"`.
- **Impact**: If model changes, string is stale.
- **Fix size**: S (remove or make dynamic).
- **Fix**: Remove the line or query the model name from `getModel()`.

### TD-051: `dev.log` and `server.log` written to project root
- **Evidence**: `package.json:6,8` — `next dev ... 2>&1 | tee dev.log` and `bun .next/standalone/server.js 2>&1 | tee server.log`.
- **Impact**: Log files accumulate in project root. May contain sensitive info. `file_read` tool can read them.
- **Fix size**: S (move to `logs/` directory, add to `.gitignore`).
- **Fix**: Change to `tee logs/dev.log`. Add `logs/` to `.gitignore`. Ensure `file_read` tool denies `*.log`.

### TD-052: `Caddyfile` exists but not documented
- **Evidence**: `/home/z/my-project/Caddyfile`.
- **Impact**: Unclear if Caddy is the production reverse proxy. No docs on deployment.
- **Fix size**: S (document or delete).
- **Fix**: Add deployment docs to README or delete if unused.

### TD-053: No `.env.example` file
- **Evidence**: No `.env.example` in project root (checked via LS).
- **Impact**: New contributors don't know which env vars are required (`DATABASE_URL`, etc.).
- **Fix size**: S (create `.env.example`).
- **Fix**: Create `.env.example` with `DATABASE_URL="file:./dev.db"` and any other required vars.

### TD-054: `prisma/migrations/` folder doesn't exist
- **Evidence**: `package.json:10` has `db:push` (accept-data-loss) but no `prisma/migrations/`.
- **Impact**: Schema changes are not versioned. No rollback. `db push --accept-data-loss` can destroy data.
- **Fix size**: M (adopt `prisma migrate dev` workflow).
- **Fix**: Run `prisma migrate dev --name init` to create baseline. Use `prisma migrate deploy` in CI/CD.

---

## SUMMARY

| Severity | Count | Examples |
|---|---|---|
| 🔴 CRITICAL | 7 | ignoreBuildErrors, no auth, no rate limit, file_read secrets, safeJoin bug, SQLite, no CSP |
| 🟠 HIGH | 14 | parseToolCalls dead, fake streaming, no validation, memory consolidation dead, knowledge graph dead, race conditions, hardcoded counts, unused deps, no cancellation, failurePolicy ignored, DAG ignored |
| 🟡 MEDIUM | 20 | routing bugs, markdown limited, Arabic partial, no debounce, no persistence, HTML escape, tool timeout, regex misses, no pagination, query logging, dead Toaster, optimistic update drift, caps, autonomous break, non-streaming followup, slow search, no retention, low-value memory |
| 🟢 LOW | 13 | doc mismatches, dead exports, type duplication, missing fields, dead examples, no tests, keep-alive scripts, hardcoded model name, log files, Caddyfile, no .env.example, no migrations |
| **TOTAL** | **54** | |

## TOP 10 PRIORITIES (fix in this order)

1. **TD-001 + TD-002**: Remove `ignoreBuildErrors` and `reactStrictMode: false`. (Unlocks all other fixes by surfacing real errors.)
2. **TD-003**: Add authentication.
3. **TD-005 + TD-006**: Fix `file_read` allowlist and `safeJoin` prefix.
4. **TD-008**: Fix `parseToolCalls` or switch to native function calling.
5. **TD-010**: Add validation phase to autonomous loop.
6. **TD-011**: Wire up `consolidateMemories`.
7. **TD-013**: Fix race conditions in store.
8. **TD-014**: Fix memory retrieval `where.OR` bug.
9. **TD-009**: Fix fake streaming.
10. **TD-019**: Add server-side cancellation.
