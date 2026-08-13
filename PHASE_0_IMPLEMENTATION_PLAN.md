# Phase 0 — Foundation / Safety / Correctness Implementation Plan

> 8 tasks. Duration: 1-2 weeks. Risk: Low-Medium.
> Goal: Fix broken foundations without changing architecture.

---

## P0-1: Type Safety Assessment + Fix

### P0-1a: Assess Type Errors
- **Task ID**: P0-1a
- **Objective**: Determine how many type errors exist with ignoreBuildErrors disabled
- **Reason**: `next.config.ts:7` has `ignoreBuildErrors: true` — type errors ship silently
- **Files affected**: `next.config.ts` (temporary change to assess)
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Prerequisites**: None
- **Implementation sequence**:
  1. Temporarily set `ignoreBuildErrors: false`
  2. Run `bun run build` 
  3. Capture all type errors
  4. Restore `ignoreBuildErrors: true`
  5. Document errors in worklog
- **Acceptance criteria**: Error count documented
- **Tests**: N/A (assessment only)
- **UI verification**: N/A
- **find-bugs**: Run after assessment to find runtime bugs
- **Risk**: Low — temporary change
- **Rollback**: Restore `ignoreBuildErrors: true`
- **Complexity**: Low (1 hour)

### P0-1b: Fix Type Errors + Disable ignoreBuildErrors
- **Task ID**: P0-1b
- **Objective**: Fix all type errors, permanently disable ignoreBuildErrors
- **Files affected**: `next.config.ts`, all files with type errors (from P0-1a)
- **Dependencies**: P0-1a
- **Acceptance**: `bun run build` passes with `ignoreBuildErrors: false`
- **Validation**: Build succeeds, dev server runs, chat works
- **Risk**: Medium — may reveal deep type issues
- **Rollback**: Revert to `ignoreBuildErrors: true`
- **Complexity**: Medium (4-8 hours depending on error count)

---

## P0-2: Fix Memory where.OR Bug

- **Task ID**: P0-2
- **Objective**: Stop memories leaking across conversations
- **Reason**: `memory.ts:70` — `where.OR` for conversationId is overwritten by keyword OR, causing memories from other conversations to appear
- **Files affected**: `src/lib/ai/memory.ts:55-77`
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Prerequisites**: None
- **Implementation sequence**:
  1. Change `where.OR` to `where.AND` for conversationId scoping
  2. Keep `OR` for keyword matching within the scoped set
  3. Use Prisma's `AND` + `OR` combination:
     ```
     where: {
       AND: [
         { OR: [{ conversationId: null }, { conversationId }] },
         { OR: keywordConditions }  // optional
       ]
     }
     ```
- **Acceptance criteria**: Memory retrieval only returns memories from current conversation + global
- **Tests**:
  1. Create memory in conversation A
  2. Retrieve memories in conversation B
  3. Verify A's memories NOT in B's results
  4. Verify global memories (conversationId: null) appear in both
- **UI verification**: Send message in conv A, switch to conv B, verify no leaked memories in context
- **find-bugs**: Run after fix to check for other memory issues
- **Risk**: Low
- **Rollback**: Git revert
- **Complexity**: Low (30 minutes)

---

## P0-3: Fix Store Race Conditions

- **Task ID**: P0-3
- **Objective**: Prevent stale fetches from corrupting state when switching conversations
- **Reason**: `mimo-store.ts:610-633` — 6 concurrent setTimeout fetches after `end` event use stale `convId` closures
- **Files affected**: `src/lib/mimo-store.ts` (end event handler + task event handler)
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Prerequisites**: None
- **Implementation sequence**:
  1. Capture `conversationId` at fetch start
  2. Before applying results, verify `get().currentConversation?.id === capturedId`
  3. If mismatch, discard results (conversation changed)
  4. Apply same guard to all 6 setTimeout fetches
- **Acceptance criteria**: Switching conversations within 800ms of `end` event doesn't show stale data
- **Tests**:
  1. Send message in conv A
  2. Within 500ms, switch to conv B
  3. Wait 2 seconds
  4. Verify conv B doesn't show conv A's tasks/artifacts/decisions
- **UI verification**: Rapid conversation switching test in browser
- **find-bugs**: Run after fix
- **Risk**: Low
- **Rollback**: Git revert
- **Complexity**: Low (1 hour)

---

## P0-4: Fix file_read Security Hole

- **Task ID**: P0-4
- **Objective**: Block reading sensitive files (.env, .db, .git/)
- **Reason**: `tools/index.ts:90-117` — `file_read` can read any file in /home/z/my-project/
- **Files affected**: `src/lib/ai/tools/index.ts:90-117`
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Prerequisites**: None
- **Implementation sequence**:
  1. Add blocked paths list: `.env`, `*.db`, `.git/**`, `node_modules/**`
  2. Check path against blocked list before reading
  3. Throw error if path matches blocked pattern
  4. Add allowlist for safe directories: `src/`, `upload/`, `prisma/`, `public/`
- **Acceptance criteria**: `file_read({ path: ".env" })` returns error
- **Tests**:
  1. Try reading `.env` → should fail
  2. Try reading `db/custom.db` → should fail
  3. Try reading `.git/config` → should fail
  4. Try reading `src/lib/ai/model.ts` → should succeed
- **UI verification**: N/A (tool not reachable yet, but fix is for future)
- **find-bugs**: N/A
- **Risk**: Low
- **Rollback**: Git revert
- **Complexity**: Low (30 minutes)

---

## P0-5: Remove Dead Code (SAFE only)

- **Task ID**: P0-5
- **Objective**: Remove confirmed dead code with 0 references
- **Reason**: Clean codebase reduces confusion and bundle size
- **Files affected**:
  - `prisma/schema.prisma` — remove `AgentActivity` model
  - `src/lib/ai/runtime.ts:88-133` — remove `looksLikeArtifact()` function
  - `src/lib/ai/runtime.ts:67-83` — remove `parseMemoryWrites()` function
  - `src/app/api/route.ts` — remove dead "Hello, world!" endpoint
- **New files**: None
- **DB impact**: Remove AgentActivity model (run `bun run db:push`)
- **Dependencies**: None
- **Prerequisites**: Verify 0 references (already confirmed in audit)
- **Implementation sequence**:
  1. Remove `AgentActivity` from schema → `bun run db:push`
  2. Remove `looksLikeArtifact()` from runtime.ts
  3. Remove `parseMemoryWrites()` from runtime.ts
  4. Remove `api/route.ts` (delete file)
  5. Run lint
  6. Run dev server, test chat
- **Acceptance criteria**: Lint passes, build passes, chat works
- **Tests**: Send message, verify AI responds, verify no errors
- **UI verification**: Open app, send message, verify works
- **find-bugs**: Run after removal
- **Risk**: Low (0 references confirmed)
- **Rollback**: Git revert + restore AgentActivity model
- **Complexity**: Low (1 hour)

---

## P0-6: Fix Documentation Mismatches

- **Task ID**: P0-6
- **Objective**: Correct false claims in code comments
- **Reason**: Comments say "10 agents" (actually 15), "6 tools" (actually 10), "7 types" (actually 9)
- **Files affected**:
  - `src/lib/ai/agents/index.ts:2` — "10 agents" → "15 agents"
  - `src/lib/ai/tools/index.ts:2` — "6 tools" → "10 tools"
  - `src/components/mimo/settings-dialog.tsx:115` — "10 agents · 6 tools" → "15 agents · 10 tools"
  - `prisma/schema.prisma:139` — "7 types" → "9 types"
- **Dependencies**: None
- **Acceptance**: All comments match actual counts
- **Risk**: None
- **Rollback**: Git revert
- **Complexity**: Trivial (15 minutes)

---

## P0-7: Install find-bugs Skill

- **Task ID**: P0-7
- **Objective**: Install OMEN find-bugs skill for QA
- **Reason**: Needed for bug discovery after P0 changes
- **Command**: `npx skillfish add panbanda/omen find-bugs`
- **Installation location**: `skills/find-bugs/` (estimated)
- **Dependencies**: None
- **Prerequisites**: Verify npx available (confirmed)
- **Implementation sequence**:
  1. Run `npx skillfish add panbanda/omen find-bugs`
  2. Verify installation in `skills/find-bugs/`
  3. Read SKILL.md to understand usage
  4. Document in QA_AND_BUG_FINDING_STRATEGY.md
- **Acceptance**: Skill installed, SKILL.md readable
- **Risk**: Low — skill installation only
- **Rollback**: Remove `skills/find-bugs/` directory
- **Complexity**: Trivial (5 minutes)

---

## P0-8: Run find-bugs After P0 Changes

- **Task ID**: P0-8
- **Objective**: Discover bugs introduced or revealed by P0 changes
- **Reason**: Foundational changes may reveal hidden issues
- **Dependencies**: P0-1 through P0-7
- **Implementation sequence**:
  1. Run find-bugs skill on codebase
  2. Document findings
  3. Classify: critical / high / medium / low
  4. Fix critical findings before GATE 1
- **Acceptance**: Find-bugs report produced, critical issues fixed
- **Risk**: Low — analysis only
- **Rollback**: N/A
- **Complexity**: Low (1-2 hours)

---

## Phase 0 Completion Criteria (GATE 1)

- [ ] `ignoreBuildErrors: false` and build passes
- [ ] Memory retrieval doesn't leak across conversations
- [ ] Rapid conversation switching doesn't corrupt state
- [ ] `file_read` blocks sensitive files
- [ ] Dead code removed, lint clean
- [ ] Documentation matches actual counts
- [ ] find-bugs installed and run
- [ ] All critical find-bugs findings fixed
- [ ] Dev server runs without errors
- [ ] Chat streaming works
- [ ] HTML preview works
- [ ] Conversation CRUD works
