// ===================================================================
// P1-E: TaskGraph Integration Tests
// ===================================================================
// Tests for the graph-based autonomous execution loop.
// Run with: bun run tests/task-graph-integration-p1e.test.ts
// ===================================================================

import {
  createTaskGraph,
  validateGraph,
  getReadyTasks,
  updateTaskStatus,
  getNewlyReadyTasks,
  blockDependentTasks,
  getGraphState,
  getTopologicalOrder,
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
  return { id, title, dependencies: deps, status: "pending" as const };
}

// ─── Integration: Simulated Graph-Based Execution ───────────────────

console.log("\n=== 1. Independent Tasks Execute ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B"),
    makeTask("C", "Task C"),
  ]);

  const executed: string[] = [];
  const maxIter = 4;

  for (let i = 0; i < maxIter; i++) {
    const ready = getReadyTasks(graph);
    if (ready.length === 0) break;

    for (const taskId of ready) {
      if (executed.includes(taskId)) continue;
      updateTaskStatus(graph, taskId, "running");
      // Simulate execution + validation passing
      updateTaskStatus(graph, taskId, "completed");
      executed.push(taskId);
    }
  }

  assert(executed.length === 3, "all 3 independent tasks should execute");
  assert(executed.includes("A"), "A executed");
  assert(executed.includes("B"), "B executed");
  assert(executed.includes("C"), "C executed");

  const state = getGraphState(graph);
  assert(state.completed === 3, "3 completed");
  assert(state.pending === 0, "0 pending");
}

console.log("\n=== 2. Dependent Task Waits ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
  ]);

  // Initially only A is ready
  let ready = getReadyTasks(graph);
  assert(ready.length === 1, "only A ready initially");
  assert(ready[0] === "A", "A is the ready one");

  // B should NOT be ready
  assert(!ready.includes("B"), "B should NOT be ready");

  const state = getGraphState(graph);
  assert(state.ready === 1, "1 ready");
  assert(state.pending === 1, "1 pending (B)");
}

console.log("\n=== 3. Dependency Completion Unlocks Task ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
  ]);

  // Execute A
  updateTaskStatus(graph, "A", "running");
  updateTaskStatus(graph, "A", "completed");

  // Now B should be ready
  const newlyReady = getNewlyReadyTasks(graph, "A");
  assert(newlyReady.length === 1, "B becomes ready after A");
  assert(newlyReady[0] === "B", "newly ready is B");

  const ready = getReadyTasks(graph);
  assert(ready.length === 1, "1 ready (B)");
  assert(ready[0] === "B", "B is ready");
}

console.log("\n=== 4. Failed Dependency Blocks Downstream ===");
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
  assert(blocked.includes("B"), "B blocked");
  assert(blocked.includes("C"), "C blocked recursively");

  // B and C should NOT be in ready tasks
  const ready = getReadyTasks(graph);
  assert(ready.length === 0, "no ready tasks after failure");

  // Simulate execution loop — should not execute anything
  const executed: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = getReadyTasks(graph);
    if (r.length === 0) break;
    for (const id of r) {
      updateTaskStatus(graph, id, "completed");
      executed.push(id);
    }
  }
  assert(executed.length === 0, "no tasks should execute after failure");
}

console.log("\n=== 5. Cycle Rejection ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A", ["B"]),
    makeTask("B", "Task B", ["A"]),
  ]);

  const validation = validateGraph(graph);
  assert(validation.valid === false, "cycle should be rejected");
  assert(validation.errors.some((e) => e.includes("Circular")), "error mentions circular");
}

console.log("\n=== 6. Missing Dependency Rejection ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A", ["X"]), // X doesn't exist
  ]);

  const validation = validateGraph(graph);
  assert(validation.valid === false, "missing dependency should be rejected");
  assert(validation.errors.some((e) => e.includes("missing")), "error mentions missing");
}

console.log("\n=== 7. Duplicate Execution Prevention ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B"),
  ]);

  const executed = new Set<string>();

  // Simulate execution loop with duplicate prevention
  for (let i = 0; i < 5; i++) {
    const ready = getReadyTasks(graph);
    if (ready.length === 0) break;

    for (const taskId of ready) {
      if (executed.has(taskId)) continue; // Prevent duplicate
      executed.add(taskId);
      updateTaskStatus(graph, taskId, "completed");
    }
  }

  assert(executed.size === 2, "exactly 2 tasks executed (no duplicates)");
}

console.log("\n=== 8. Backward Compatibility — Linear/No-Dependency Tasks ===");
{
  // Simulate old-style plan: tasks with no dependencies, executed in order
  const graph = createTaskGraph([
    makeTask("T1", "Task 1"),
    makeTask("T2", "Task 2"),
    makeTask("T3", "Task 3"),
  ]);

  assert(validateGraph(graph).valid === true, "no-dep graph should be valid");

  // All tasks should be immediately ready (no deps)
  const ready = getReadyTasks(graph);
  assert(ready.length === 3, "all 3 ready immediately");

  // Execute in order
  const executed: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = getReadyTasks(graph);
    if (r.length === 0) break;
    for (const id of r) {
      if (executed.includes(id)) continue;
      updateTaskStatus(graph, id, "completed");
      executed.push(id);
    }
  }

  assert(executed.length === 3, "all 3 executed");
  assert(getGraphState(graph).completed === 3, "3 completed");
}

console.log("\n=== 9. Diamond Graph — Full Execution ===");
{
  // A → B → D
  // A → C → D
  const graph = createTaskGraph([
    makeTask("A", "Setup"),
    makeTask("B", "Build", ["A"]),
    makeTask("C", "Test", ["A"]),
    makeTask("D", "Deploy", ["B", "C"]),
  ]);

  assert(validateGraph(graph).valid === true, "diamond graph valid");

  const executed: string[] = [];
  const maxIter = 5;

  for (let i = 0; i < maxIter; i++) {
    const ready = getReadyTasks(graph);
    if (ready.length === 0) break;

    for (const taskId of ready) {
      if (executed.includes(taskId)) continue;
      updateTaskStatus(graph, taskId, "completed");
      executed.push(taskId);
    }
  }

  assert(executed.length === 4, "all 4 tasks executed");
  assert(executed[0] === "A", "A first (no deps)");
  assert(executed[executed.length - 1] === "D", "D last (depends on B+C)");
  assert(executed.includes("B"), "B executed");
  assert(executed.includes("C"), "C executed");

  // Verify D was NOT executed before B and C
  const dIndex = executed.indexOf("D");
  const bIndex = executed.indexOf("B");
  const cIndex = executed.indexOf("C");
  assert(dIndex > bIndex, "D after B");
  assert(dIndex > cIndex, "D after C");
}

console.log("\n=== 10. Topological Order — Linear Chain ===");
{
  const graph = createTaskGraph([
    makeTask("A", "A"),
    makeTask("B", "B", ["A"]),
    makeTask("C", "C", ["B"]),
    makeTask("D", "D", ["C"]),
  ]);

  const order = getTopologicalOrder(graph);
  assert(order !== null, "topo order exists");
  assert(order!.length === 4, "4 tasks");
  assert(order![0] === "A", "A first");
  assert(order![1] === "B", "B second");
  assert(order![2] === "C", "C third");
  assert(order![3] === "D", "D fourth");
}

console.log("\n=== 11. Infinite Loop Prevention ===");
{
  const graph = createTaskGraph([
    makeTask("A", "Task A"),
    makeTask("B", "Task B", ["A"]),
  ]);

  const executed = new Set<string>();
  const maxIterations = 3; // tasks.length + 1

  for (let i = 0; i < maxIterations; i++) {
    const ready = getReadyTasks(graph);
    if (ready.length === 0) break;

    for (const taskId of ready) {
      if (executed.has(taskId)) continue;
      executed.add(taskId);
      updateTaskStatus(graph, taskId, "completed");
    }
  }

  // Should execute exactly 2 tasks, not loop forever
  assert(executed.size === 2, "exactly 2 tasks (no infinite loop)");
}

console.log("\n=== 12. Graph State After Partial Execution ===");
{
  const graph = createTaskGraph([
    makeTask("A", "A"),
    makeTask("B", "B", ["A"]),
    makeTask("C", "C", ["A"]),
    makeTask("D", "D", ["B", "C"]),
  ]);

  // Execute A
  updateTaskStatus(graph, "A", "completed");

  let state = getGraphState(graph);
  assert(state.completed === 1, "1 completed (A)");
  assert(state.ready === 2, "2 ready (B, C)");
  assert(state.pending === 1, "1 pending (D)");

  // Execute B
  updateTaskStatus(graph, "B", "completed");
  state = getGraphState(graph);
  assert(state.completed === 2, "2 completed (A, B)");
  assert(state.ready === 1, "1 ready (C)");
  assert(state.pending === 1, "1 pending (D)");

  // Execute C — D becomes ready
  updateTaskStatus(graph, "C", "completed");
  state = getGraphState(graph);
  assert(state.completed === 3, "3 completed (A, B, C)");
  assert(state.ready === 1, "1 ready (D)");
  assert(state.pending === 0, "0 pending");
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
