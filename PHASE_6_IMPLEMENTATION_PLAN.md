# Phase 6 — Optimization / Hardening Implementation Plan

> 5 tasks. Duration: 1-2 weeks. Risk: Low.
> Goal: DB indexes, dependency cleanup, agent consolidation, observability metrics, final hardening.

---

## P6-1: Database Indexes
- **Task ID**: P6-1
- **Objective**: Add indexes for common queries
- **Files affected**: `prisma/schema.prisma`
- **New files**: None
- **DB impact**: Add indexes (non-destructive)
- **Dependencies**: All phases complete
- **Implementation sequence**: Add `@@index` to: Message(conversationId, createdAt), Task(conversationId, status), ExecutionLog(conversationId, createdAt), Memory(type, conversationId), Artifact(conversationId, type)
- **Acceptance**: Queries faster on large datasets, no data loss
- **Tests**: Benchmark before/after with 1000+ records
- **Risk**: Low | **Rollback**: Remove indexes | **Complexity**: Low (1 hour)

## P6-2: Dependency Cleanup
- **Task ID**: P6-2
- **Objective**: Remove unused npm dependencies
- **Files affected**: `package.json`
- **New files**: None
- **DB impact**: None
- **Dependencies**: All features complete (verify nothing breaks)
- **Implementation sequence**:
  1. Run `npx depcheck` to identify unused deps
  2. Cross-reference with SAFE_CLEANUP_PLAN.md
  3. Remove confirmed unused: `next-auth`, `next-intl`, `@dnd-kit/*`, `react-hook-form`, `@hookform/resolvers`, `@tanstack/*`, `react-syntax-highlighter` (if not used by P3-4), `@mdxeditor/editor`, `embla-carousel-react`, `react-day-picker`, `react-markdown` (if not used by P3-4), `input-otp`, `vaul`
  4. KEEP: `cmdk` (command palette), `react-resizable-panels` (P5-1), `recharts` (P5-5), `zod`, `zustand`, `framer-motion`, `lucide-react`, `date-fns`, `sharp`, `z-ai-web-dev-sdk`
  5. Run build + test after each removal
- **Acceptance**: `depcheck` confirms no unused deps, build passes, all features work
- **Tests**: Build, lint, run dev server, test chat + tools + preview
- **Risk**: Medium (hidden imports) | **Rollback**: Reinstall deps | **Complexity**: Medium (2 hours)

## P6-3: Agent Consolidation
- **Task ID**: P6-3
- **Objective**: Merge overlapping agents (15 → 12)
- **Files affected**: `src/lib/ai/agents/index.ts`
- **New files**: None
- **DB impact**: None
- **Dependencies**: All features complete
- **NEEDS USER APPROVAL**: Which agents to merge
- **Implementation sequence**:
  1. Merge `architect` + `planner` → `architect` (system design + task planning)
  2. Merge `code_analyst` + `reviewer` → `reviewer` (analysis + judgment)
  3. Merge `refactoring` + `developer` → `developer` (new code + refactoring)
  4. Update `pickAgentForMessage()` routing
  5. Update `settings-dialog.tsx` agent count
  6. Update agent selector in chat-panel
- **Acceptance**: 12 agents, all workflows still work
- **Tests**: Test all agent types still selectable, verify routing works
- **Risk**: Medium (routing changes) | **Rollback**: Git revert | **Complexity**: Medium (2 hours)

## P6-4: Observability Metrics
- **Task ID**: P6-4
- **Objective**: Add metrics aggregation (success rate, avg duration, tool usage)
- **Files affected**: `src/app/api/state/route.ts`
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Implementation sequence**: Add aggregation queries: success rate = completed / (completed + failed), avg duration = AVG(durationMs), tool usage counts, agent usage counts
- **Acceptance**: State API returns metrics, UI displays them
- **Tests**: Create tasks → verify metrics computed
- **Risk**: Low | **Rollback**: Git revert | **Complexity**: Low (2 hours)

## P6-5: Final Hardening
- **Task ID**: P6-5
- **Objective**: Security review, CSP headers, rate limiting
- **Files affected**: `src/app/layout.tsx`, `src/app/api/chat/route.ts`
- **New files**: None
- **DB impact**: None
- **Dependencies**: All phases complete
- **Implementation sequence**:
  1. Add CSP headers in layout.tsx
  2. Add rate limiting to /api/chat (max 10 requests per minute per IP)
  3. Add input validation to all API routes (use zod schemas)
  4. Run find-bugs final scan
  5. Fix all remaining findings
- **Acceptance**: CSP headers set, rate limiting works, input validation enforced
- **Tests**: Verify CSP headers in response, verify rate limit triggers after 10 requests
- **find-bugs**: Final comprehensive scan
- **Risk**: Medium (rate limiting may affect legitimate use) | **Rollback**: Remove limits | **Complexity**: Medium (3 hours)

---

## Phase 6 Completion Criteria (FINAL)
- [ ] Database indexes added
- [ ] Unused dependencies removed
- [ ] Agents consolidated to 12
- [ ] Observability metrics computed and displayed
- [ ] CSP headers, rate limiting, input validation added
- [ ] find-bugs final scan complete, all findings fixed
- [ ] Build passes with `ignoreBuildErrors: false`
- [ ] All P0-P5 features still work
- [ ] Full E2E test: "Build a smart building management system" → system completes full lifecycle
