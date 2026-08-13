# Phase 4 — Autonomous Engineering Implementation Plan

> 5 tasks. Duration: 2-3 weeks. Risk: High.
> Goal: Self-repair, checkpoints, approval gates, parallel execution.

---

## P4-1: Self-Repair Loop
- **Task ID**: P4-1
- **Objective**: Failed validation → diagnose → fix → retest automatically
- **Files affected**: `src/lib/ai/runtime.ts` (executeTask + runAutonomousLoop)
- **New files**: None
- **DB impact**: None
- **Dependencies**: P1-5 (validation), P3-2 (test execution)
- **Implementation sequence**:
  1. When validation fails, call debugger agent with error message
  2. Debugger produces diagnosis + fix
  3. Developer agent applies fix (file_write/patch)
  4. Re-run validation
  5. Repeat up to failure budget (3 retries)
  6. If budget exhausted, mark task failed
- **Acceptance**: When test fails, system diagnoses, fixes, and retests
- **Tests**: Create deliberately broken code → verify self-repair activates
- **Risk**: Medium | **Rollback**: Disable self-repair | **Complexity**: Medium (4 hours)

## P4-2: Checkpoints
- **Task ID**: P4-2
- **Objective**: Save execution state for resume after crash
- **Files affected**: NEW `src/lib/ai/checkpoint.ts`, `prisma/schema.prisma` (new model)
- **New files**: `src/lib/ai/checkpoint.ts`
- **DB impact**: ADD `Checkpoint` model
  ```prisma
  model Checkpoint {
    id             String   @id @default(cuid())
    conversationId String
    missionId      String
    taskGraph      String   // JSON: task IDs + statuses
    createdAt      DateTime @default(now())
  }
  ```
- **Dependencies**: P1-6 (task DAG)
- **Implementation sequence**: Save checkpoint after each task completion, on mission start save initial state, on resume load latest checkpoint
- **Acceptance**: Mission can resume from last checkpoint after server restart
- **Tests**: Start mission → kill server → restart → verify resume
- **Risk**: Medium (DB migration) | **Rollback**: Drop Checkpoint model | **Complexity**: Medium (3 hours)

## P4-3: Approval Gates
- **Task ID**: P4-3
- **Objective**: Pause execution for user approval on risky actions
- **Files affected**: `src/lib/ai/runtime.ts`, `src/components/mimo/chat-panel.tsx`
- **New files**: None
- **DB impact**: None (use Task.status = "waiting_for_approval")
- **Dependencies**: P1-1 (tool calling)
- **Implementation sequence**: Define risky actions (file_delete, file_write to existing file, shell command), when risky action detected, set task status to "waiting_for_approval", emit SSE event, UI shows approval dialog, on approval continue, on rejection skip
- **Acceptance**: Risky actions pause and ask user for approval
- **Tests**: Trigger risky action → verify pause → approve → verify continue
- **UI verification**: Use UI/UX Pro Max skill for approval dialog design
- **Risk**: Low | **Rollback**: Disable approval gates | **Complexity**: Medium (3 hours)

## P4-4: Parallel Task Execution
- **Task ID**: P4-4
- **Objective**: Independent tasks execute in parallel
- **Files affected**: `src/lib/ai/runtime.ts:runAutonomousLoop`
- **New files**: None
- **DB impact**: None
- **Dependencies**: P1-6 (task DAG)
- **Implementation sequence**: Identify tasks with no unmet dependencies, execute concurrently with Promise.all, wait for all to complete before moving to next dependency level
- **Acceptance**: Tasks with no dependencies run concurrently
- **Tests**: Create plan with 3 independent tasks → verify concurrent execution
- **Risk**: Medium (concurrency issues) | **Rollback**: Revert to sequential | **Complexity**: Medium (3 hours)

## P4-5: Failure Budget Tracking
- **Task ID**: P4-5
- **Objective**: Track failure budget per mission, abort when exhausted
- **Files affected**: `src/lib/ai/runtime.ts`
- **New files**: None
- **DB impact**: None (track in memory + log)
- **Dependencies**: P4-1 (self-repair)
- **Implementation sequence**: Define failure budget (e.g., 5 total failures per mission), increment on each task failure + self-repair failure, when budget exhausted abort mission with summary
- **Acceptance**: Mission aborts after failure budget exhausted
- **Tests**: Create mission with deliberate failures → verify abort after budget
- **Risk**: Low | **Rollback**: Disable budget tracking | **Complexity**: Low (1 hour)

---

## Phase 4 Completion Criteria (GATE 5)
- [ ] Self-repair loop works (diagnose → fix → retest)
- [ ] Checkpoints save and resume works
- [ ] Approval gates pause for risky actions
- [ ] Parallel task execution works
- [ ] Failure budget tracking prevents infinite retries
- [ ] find-bugs run, critical findings fixed

---

## Autonomous Execution State Machine

```
                    ┌─────────┐
                    │ PENDING │
                    └────┬────┘
                         ↓
                 ┌───────────────┐
                 │ IN_PROGRESS   │
                 └───────┬───────┘
                         ↓
              ┌─────────────────────┐
              │ VALIDATING          │
              └──────┬──────┬───────┘
                     │      │
              PASS ←─┘      └──→ FAIL
                     │              │
                     ↓              ↓
              ┌──────────┐  ┌──────────────┐
              │ COMPLETED│  │ RETRYING     │
              └──────────┘  └──────┬───────┘
                                   ↓
                           ┌───────────────┐
                           │ IN_PROGRESS   │ (retry)
                           └───────────────┘
                                   │
                           (budget exhausted)
                                   ↓
                           ┌───────────────┐
                           │ FAILED        │
                           └───────────────┘

Special states:
- WAITING_FOR_INPUT — needs user clarification
- WAITING_FOR_APPROVAL — risky action needs approval
- BLOCKED — dependency not met
- CANCELLED — user cancelled
```
