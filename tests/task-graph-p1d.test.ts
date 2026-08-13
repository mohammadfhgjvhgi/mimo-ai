// ===================================================================
// P1-D: TaskGraphService Tests
// ===================================================================
// Tests for the canonical task graph boundary.
// Run with: bun run tests/task-graph-p1d.test.ts
// ===================================================================

import {
  createTaskGraph,
  validateGraph,
  getReadyTasks,
  getBlockedTasks,
  getPendingTasks,
  updateTaskStatus,
  getNewlyReadyTasks,
  blockDependentTasks,
  getGraphState,
  getTopologicalOrder,
  type TaskGraph,
} from "../src/lib/ai/task-graph";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log("  ✅ PASS:", message);
    passed++;
  } else {
    console.log("  ❌ FAIL:", message);
    failed++;
  }
}

function makeTask(id: string, title: string, deps: string[] = []) {
  return { id, title, dependencies: deps };
}

// ─── Tests ──────────────────────────────────────────────────────────

console.log("\n=== 1. Empty Graph → PASS ===");
{
  const graph = createTaskGraph([]);
  const validation = validateGraph(graph);
  assert(validation.valid === true, "empty graph should be valid");
  assert(getReadyTasks(graph).length === 0, "no ready tasks in empty graph");
  assert(getGraphState(graph).total === 0, "0 total tasks");
}

console.log("\n=== 2. Single Task → PASS ===");
{
  const graph = createTaskGraph([makeTask("A", "Task A")]);
  const validation = validateGraph(graph);
  assert(validation.valid === true, "single task should be valid");
  const ready = getReadyTasks(graph);
  assert(ready.length === 1, "1 ready task (no deps)");
  assert(ready[0] === "A", "ready task is A");
}

console.log("\n=== 3. Linear Dependency A → B → C ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
    makeTask("C", "Task C", ["B"]),
  ]);
  const validation = validateGraph(graph);
  assert(validation.valid === true, "linear graph should be valid");

  // Only A is ready initially
  const ready = getReadyTasks(graph);
  assert(ready.length === 1, "only 1 ready task initially");
  assert(ready[0] === "A", "A is ready");

  // After A completes, B becomes ready
  updateTaskStatus(graph, "A", "completed");
  const readyAfterA = getNewlyReadyTasks(graph, "A");
  assert(readyAfterA.length === 1, "B becomes ready after A");
  assert(readyAfterA[0] === "B", "newly ready is B");

  // After B completes, C becomes ready
  updateTaskStatus(graph, "B", "completed");
  const readyAfterB = getNewlyReadyTasks(graph, "B");
  assert(readyAfterB.length === 1, "C becomes ready after B");
  assert(readyAfterB[0] === "C", "newly ready is C");
}

console.log("\n=== 4. Branching Graph (A → B, A → C) ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
    makeTask("C", "Task C", ["A"]),
  ]);
  assert(validateGraph(graph).valid === true, "branching graph valid");

  // Only A ready
  assert(getReadyTasks(graph).length === 1, "only A ready");

  // After A completes, both B and C become ready
  updateTaskStatus(graph, "A", "completed");
  const newlyReady = getNewlyReadyTasks(graph, "A");
  assert(newlyReady.length === 2, "B and C both become ready");
  assert(newlyReady.includes("B"), "B is ready");
  assert(newlyReady.includes("C"), "C is ready");
}

console.log("\n=== 5. Merging Graph (A → B, A → C, B → D, C → D) ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
    makeTask("C", "Task C", ["A"]),
    makeTask("D", "Task D", ["B", "C"]),
  ]);
  assert(validateGraph(graph).valid === true, "merging graph valid");

  // Only A ready
  assert(getReadyTasks(graph).length === 1, "only A ready");

  // After A, B and C become ready
  updateTaskStatus(graph, "A", "completed");
  assert(getNewlyReadyTasks(graph, "A").length === 2, "B and C ready after A");

  // After B completes, D is NOT ready (C still pending)
  updateTaskStatus(graph, "B", "completed");
  assert(getNewlyReadyTasks(graph, "B").length === 0, "D NOT ready after only B");

  // After C completes, D becomes ready
  updateTaskStatus(graph, "C", "completed");
  const readyD = getNewlyReadyTasks(graph, "C");
  assert(readyD.length === 1, "D becomes ready after C");
  assert(readyD[0] === "D", "newly ready is D");
}

console.log("\n=== 6. Multiple Ready Tasks ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B"),
    makeTask("C", "Task C"),
  ]);
  const ready = getReadyTasks(graph);
  assert(ready.length === 3, "all 3 tasks ready (no deps)");
  assert(ready.includes("A"), "A ready");
  assert(ready.includes("B"), "B ready");
  assert(ready.includes("C"), "C ready");
}

console.log("\n=== 7. Missing Dependency → FAIL ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A", ["X"]), // X doesn't exist
  ]);
  const validation = validateGraph(graph);
  assert(validation.valid === false, "missing dependency should FAIL");
  assert(validation.errors.some((e) => e.includes("missing task X")), "error should mention missing X");
}

console.log("\n=== 8. Self Dependency → FAIL ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A", ["A"]), // A depends on itself
  ]);
  const validation = validateGraph(graph);
  assert(validation.valid === false, "self dependency should FAIL");
  assert(validation.errors.some((e) => e.includes("depends on itself")), "error should mention self-dependency");
}

console.log("\n=== 9. Circular Dependency A → B → A ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A", ["B"]),
    makeTask("B", "Task B", ["A"]),
  ]);
  const validation = validateGraph(graph);
  assert(validation.valid === false, "A→B→A cycle should FAIL");
  assert(validation.errors.some((e) => e.includes("Circular dependency")), "error should mention circular");
}

console.log("\n=== 10. Circular Dependency A → B → C → A ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A", ["C"]),
    makeTask("B", "Task B", ["A"]),
    makeTask("C", "Task C", ["B"]),
  ]);
  const validation = validateGraph(graph);
  assert(validation.valid === false, "A→B→C→A cycle should FAIL");
  assert(validation.errors.some((e) => e.includes("Circular dependency")), "error should mention circular");
}

console.log("\n=== 11. Duplicate Edge → FAIL ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A", "A"]), // duplicate
  ]);
  const validation = validateGraph(graph);
  assert(validation.valid === false, "duplicate edge should FAIL");
  assert(validation.errors.some((e) => e.includes("duplicate dependency")), "error should mention duplicate");
}

console.log("\n=== 12. Failed Dependency → Dependent Task Blocked ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
    makeTask("C", "Task C", ["B"]),
  ]);

  // A fails
  updateTaskStatus(graph, "A", "failed");
  const blocked = blockDependentTasks(graph, "A");
  assert(blocked.length === 2, "B and C should be blocked");
  assert(blocked.includes("B"), "B is blocked");
  assert(blocked.includes("C"), "C is blocked (recursively)");

  // Verify B and C status
  assert(graph.nodes.get("B")?.status === "blocked", "B status is blocked");
  assert(graph.nodes.get("C")?.status === "blocked", "C status is blocked");

  // B and C should NOT appear in ready tasks
  assert(getReadyTasks(graph).length === 0, "no ready tasks after failure");
}

console.log("\n=== 13. Completed Dependency → Dependent Task Ready ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
  ]);

  updateTaskStatus(graph, "A", "completed");
  const ready = getReadyTasks(graph);
  assert(ready.length === 1, "B should be ready after A completes");
  assert(ready[0] === "B", "ready task is B");
}

console.log("\n=== 14. Partial Dependency Completion → Remains Pending ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B"),
    makeTask("D", "Task D", ["A", "B"]),
  ]);

  // Only A completes
  updateTaskStatus(graph, "A", "completed");
  const ready = getReadyTasks(graph);
  assert(ready.length === 1, "only B ready (D still pending — B not done)");
  assert(ready[0] === "B", "B is ready, D is not");

  // D should be in pending (not ready, not blocked)
  const pending = getPendingTasks(graph);
  assert(pending.includes("D"), "D should be pending");
}

console.log("\n=== 15. Validation Failure → Task Does Not Unlock Dependents ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
  ]);

  // A fails validation → status = failed
  updateTaskStatus(graph, "A", "failed");

  // B should NOT become ready
  const newlyReady = getNewlyReadyTasks(graph, "A");
  assert(newlyReady.length === 0, "B should NOT become ready after A fails");

  // B should be blocked
  const blocked = blockDependentTasks(graph, "A");
  assert(blocked.includes("B"), "B should be blocked after A fails");
}

console.log("\n=== 16. TaskGraph Does Not Mark Tasks Completed ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
  ]);

  // updateTaskStatus can set "completed" but this is called by the
  // EXECUTION LAYER after ValidationService passes, NOT by TaskGraph itself.
  // TaskGraph only provides getNewlyReadyTasks() after completion.
  // This test verifies that TaskGraph has no "completeTask" method.
  assert(typeof (graph as unknown as Record<string, unknown>).completeTask === "undefined", "TaskGraph should not have completeTask method");
  assert(typeof (graph as unknown as Record<string, unknown>).markCompleted === "undefined", "TaskGraph should not have markCompleted method");
}

console.log("\n=== 17. Topological Order — Linear ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
    makeTask("C", "Task C", ["B"]),
  ]);
  const order = getTopologicalOrder(graph);
  assert(order !== null, "topological order should exist");
  assert(order!.length === 3, "order has 3 tasks");
  assert(order!.indexOf("A") < order!.indexOf("B"), "A before B");
  assert(order!.indexOf("B") < order!.indexOf("C"), "B before C");
}

console.log("\n=== 18. Topological Order — Diamond ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
    makeTask("C", "Task C", ["A"]),
    makeTask("D", "Task D", ["B", "C"]),
  ]);
  const order = getTopologicalOrder(graph);
  assert(order !== null, "topological order should exist");
  assert(order!.indexOf("A") === 0, "A is first");
  assert(order!.indexOf("D") === 3, "D is last");
  assert(order!.indexOf("B") < order!.indexOf("D"), "B before D");
  assert(order!.indexOf("C") < order!.indexOf("D"), "C before D");
}

console.log("\n=== 19. Topological Order — Cycle Returns Null ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A", ["B"]),
    makeTask("B", "Task B", ["A"]),
  ]);
  const order = getTopologicalOrder(graph);
  assert(order === null, "topological order should be null for cyclic graph");
}

console.log("\n=== 20. Graph State Summary ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
    makeTask("C", "Task C", ["A"]),
    makeTask("D", "Task D", ["B", "C"]),
  ]);

  // Initial state: 1 ready, 3 pending
  let state = getGraphState(graph);
  assert(state.total === 4, "4 total tasks");
  assert(state.ready === 1, "1 ready (A)");
  assert(state.pending === 3, "3 pending (B, C, D)");

  // After A completes: 2 ready, 1 pending
  updateTaskStatus(graph, "A", "completed");
  state = getGraphState(graph);
  assert(state.ready === 2, "2 ready (B, C)");
  assert(state.pending === 1, "1 pending (D)");
  assert(state.completed === 1, "1 completed (A)");

  // After B completes: 1 ready, 0 pending
  updateTaskStatus(graph, "B", "completed");
  state = getGraphState(graph);
  assert(state.ready === 1, "1 ready (C)");
  assert(state.pending === 1, "1 pending (D)");

  // After C completes: 1 ready (D), 0 pending
  updateTaskStatus(graph, "C", "completed");
  state = getGraphState(graph);
  assert(state.ready === 1, "1 ready (D)");
  assert(state.pending === 0, "0 pending");
  assert(state.completed === 3, "3 completed (A, B, C)");
}

console.log("\n=== 21. Complex Graph — Deep Chain + Branch ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Setup"),
    makeTask("B", "Config", ["A"]),
    makeTask("C", "Build", ["B"]),
    makeTask("D", "Test", ["C"]),
    makeTask("E", "Deploy", ["D"]),
    makeTask("F", "Notify", ["E"]),
    makeTask("G", "Cleanup", ["A"]), // independent branch from A
    makeTask("H", "Report", ["F", "G"]), // merges both branches
  ]);
  assert(validateGraph(graph).valid === true, "complex graph should be valid");

  const order = getTopologicalOrder(graph);
  assert(order !== null, "topological order exists");
  assert(order!.length === 8, "8 tasks in order");
  assert(order!.indexOf("A") === 0, "A is first");
  assert(order!.indexOf("H") === 7, "H is last");
}

// ─── Summary ───────────────────────────────────────────────────────

console.log("\n=== Summary ===");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${passed + failed}`);

if (failed > 0) {
  console.log("\n❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED");
  process.exit(0);
}
