# Phase 3 — Validation / Build / Test / Runtime Implementation Plan

> 6 tasks. Duration: 2-3 weeks. Risk: Medium-High.
> Goal: Build projects, run tests, validate outputs, extend preview types, activate knowledge graph.

---

## P3-1: Build System
- **Task ID**: P3-1
- **Objective**: Build projects (npm/bun build) and capture output
- **Files affected**: NEW `src/lib/ai/runtime-service.ts`, NEW `src/app/api/build/route.ts`
- **New files**: `src/lib/ai/runtime-service.ts`, `src/app/api/build/route.ts`
- **DB impact**: None (use ExecutionLog for build results)
- **Dependencies**: P2-1 (project workspace)
- **Implementation sequence**: Create RuntimeService with `build(projectId)`, execute `bun run build` in project dir, capture stdout/stderr, return BuildResult { success, output, duration }
- **Acceptance**: Build command executes, output captured, success/fail determined
- **Tests**: Create simple project → build → verify success; Create broken project → build → verify failure captured
- **Risk**: Medium (process management) | **Rollback**: Remove runtime-service | **Complexity**: Medium (4 hours)

## P3-2: Test Execution
- **Task ID**: P3-2
- **Objective**: Run tests and capture results
- **Files affected**: `src/lib/ai/runtime-service.ts`, NEW `src/app/api/test/route.ts`
- **New files**: `src/app/api/test/route.ts`
- **DB impact**: None
- **Dependencies**: P3-1
- **Implementation sequence**: Add `test(projectId)` to RuntimeService, execute `bun run test`, parse output for pass/fail counts, return TestResult { passed, failed, output }
- **Acceptance**: Test command executes, pass/fail counts captured
- **Tests**: Create project with passing test → verify pass; Create with failing test → verify fail
- **Risk**: Low | **Rollback**: Remove test route | **Complexity**: Medium (3 hours)

## P3-3: Lint + Typecheck
- **Task ID**: P3-3
- **Objective**: Run lint and typecheck on projects
- **Files affected**: `src/lib/ai/runtime-service.ts`, NEW `src/app/api/lint/route.ts`
- **New files**: `src/app/api/lint/route.ts`
- **DB impact**: None
- **Dependencies**: P3-1
- **Implementation sequence**: Add `lint(projectId)` and `typecheck(projectId)` to RuntimeService, execute commands, parse output
- **Acceptance**: Lint/typecheck output captured
- **Tests**: Run lint on project → verify output
- **Risk**: Low | **Rollback**: Remove route | **Complexity**: Low (2 hours)

## P3-4: Extended Preview Types
- **Task ID**: P3-4
- **Objective**: Support Markdown, JSON, code previews beyond HTML
- **Files affected**: `src/app/api/preview/[id]/route.ts`, `src/components/mimo/inline-preview.tsx`
- **New files**: None
- **DB impact**: None
- **Dependencies**: None (independent of P3-1/2/3)
- **Implementation sequence**: 
  1. Markdown: Use react-markdown (already installed) to render
  2. JSON: Structured tree view with collapsible nodes
  3. Code: Use react-syntax-highlighter (already installed) with line numbers
  4. Update inline-preview to detect type and render appropriately
- **Acceptance**: Markdown rendered, JSON structured, code highlighted
- **Tests**: Create each type → verify preview renders correctly
- **UI verification**: Use UI/UX Pro Max skill for preview component design
- **Risk**: Low | **Rollback**: Git revert | **Complexity**: Medium (4 hours)

## P3-5: Knowledge Graph Activation
- **Task ID**: P3-5
- **Objective**: Use KnowledgeEntity/KnowledgeRelation models (currently orphaned)
- **Files affected**: NEW `src/lib/ai/knowledge.ts`, `src/lib/ai/context.ts`
- **New files**: `src/lib/ai/knowledge.ts`
- **DB impact**: None (models exist)
- **Dependencies**: P1 complete
- **Implementation sequence**: 
  1. Create knowledge.ts with entity extraction (simple NLP: detect proper nouns, technologies)
  2. `extractEntities(text: string): Entity[]`
  3. `storeEntity(projectId: string, entity: Entity): Promise<void>`
  4. `queryGraph(projectId: string, query: string): Promise<GraphResult>`
  5. Call from runtime after task completion
  6. Include in context assembly
- **Acceptance**: Entities extracted from conversations, stored, queryable
- **Tests**: Create conversation about "React" → verify "React" entity extracted and stored
- **NEEDS USER APPROVAL**: Whether to implement or remove KnowledgeEntity/KnowledgeRelation
- **Risk**: Medium | **Rollback**: Remove knowledge.ts | **Complexity**: Medium (4 hours)

## P3-6: Log/Terminal Output Streaming
- **Task ID**: P3-6
- **Objective**: Stream build/test/lint output in real-time
- **Files affected**: NEW `src/components/mimo/terminal.tsx`, `src/app/api/build/route.ts`
- **New files**: `src/components/mimo/terminal.tsx`
- **DB impact**: None
- **Dependencies**: P3-1
- **Implementation sequence**: Create terminal component, SSE endpoint for build output, stream stdout/stderr in real-time
- **Acceptance**: Build output streams in real-time in terminal
- **Tests**: Run build → verify streaming output in terminal
- **UI verification**: Use UI/UX Pro Max skill for terminal UX
- **Risk**: Low | **Rollback**: Remove component | **Complexity**: Medium (3 hours)

---

## Phase 3 Completion Criteria (GATE 4)
- [ ] Build system executes and captures output
- [ ] Test execution captures pass/fail counts
- [ ] Lint and typecheck work
- [ ] Markdown, JSON, code previews work
- [ ] Knowledge graph activated (or decision made to remove)
- [ ] Terminal streams build/test output
- [ ] find-bugs run, critical findings fixed

---

## Validation Taxonomy (never collapse these)

| Validator | What it checks | When | Owner |
|-----------|---------------|------|-------|
| Syntactic validity | Code is valid syntax | After file creation | Validation Layer |
| Type validity | TypeScript types correct | After file creation (typecheck) | Runtime Service |
| Build validity | Project builds successfully | After all files created | Runtime Service |
| Test validity | Tests pass | After build | Runtime Service |
| Runtime validity | App starts and responds | After build+test | Runtime Service |
| Requirement validity | Output meets requirements | After all above | Validation Layer |
| Visual validity | UI renders correctly | After preview | Browser verification |
