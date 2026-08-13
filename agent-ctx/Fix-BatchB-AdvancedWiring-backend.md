# Task Fix-BatchB-AdvancedWiring — Backend Engineer (Advanced Wiring)

## Task
Wire 5 advanced.ts features into the live runtime path (non-breaking, fire-and-forget).

## Files Modified
1. `src/lib/ai/context.ts` — Adaptive Personality (feature #1)
2. `src/lib/ai/runtime.ts` — features #2, #3, #4, #5

## Wiring Summary

| # | Feature                | File           | Location                                              | Pattern                              |
|---|------------------------|----------------|-------------------------------------------------------|--------------------------------------|
| 1 | Adaptive Personality   | context.ts     | assembleContext() after system build                  | `try { await loadPersonaProfile() ... applyPersona() } catch {}` |
| 2 | Dual-Stream Memory     | runtime.ts     | executeTask() before final return, gated on success   | `void extractImplicitPreferences().catch(()=>{})` |
| 3 | Offline Consolidation  | runtime.ts     | runAutonomousLoop() before final return               | `void consolidateMemory().catch(()=>{})` + `void extractLessons().catch(()=>{})` |
| 4 | Entity Resolution      | runtime.ts     | executeTask() inside `if (projectId && ...)` block    | `void resolveEntities(projectId).catch(()=>{})` |
| 5 | Contradiction Detection| runtime.ts     | executeTask() right after auto-memory write           | `void detectContradictions().catch(()=>{})` |

## Deferred (per task spec)
- `predictUserBehavior` (model.ts) — needs user opt-in
- `createDynamicAgent` (advanced.ts) — too risky
- `debatePattern` (advanced.ts) — too risky
- `optimizePrompt` / `replayTrajectory` (model.ts) — too risky

## Verification
- `bunx tsc --noEmit` → PASS
- `bun run lint` → PASS

## Side Effects Introduced
- New `taskSucceeded: boolean` local in executeTask() (let, initialized from taskValidation.passed, set true after self-repair). Read-only outside completion branch.
- `const system` → `let system` in context.ts (reassigned by persona block).
- No DB schema changes. No new deps. No signature changes.
