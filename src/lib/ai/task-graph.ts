// ===================================================================
// MiMo AI — TaskGraphService
// ===================================================================
// CANONICAL TASK GRAPH BOUNDARY.
//
// Responsibilities:
// 1. Task nodes with dependencies
// 2. Dependency validation
// 3. Cycle detection (DFS-based)
// 4. Missing dependency detection
// 5. Duplicate edge detection
// 6. Ready-task calculation
// 7. Dependency completion checks
// 8. Graph state calculation
//
// The graph is:
// - directed
// - acyclic (validated before execution)
// - explicitly validated
// - deterministic
//
// TaskGraphService does NOT execute tasks.
// It only determines graph structure and which tasks are eligible.
//
// TASK COMPLETION is handled by ValidationService (P1-C).
// TaskGraphService only updates dependency availability.
// ===================================================================

// ─── Types ──────────────────────────────────────────────────────────

export type TaskNodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

export interface TaskNode {
  id: string;
  title: string;
  dependencies: string[]; // IDs of tasks that must complete before this one
  status: TaskNodeStatus;
}

export interface TaskGraph {
  nodes: Map<string, TaskNode>;
  // adjacency list: taskId → tasks that depend on it
  dependents: Map<string, string[]>;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Graph Creation ─────────────────────────────────────────────────

/**
 * Create a task graph from plan tasks.
 * Each task can declare dependencies (array of task IDs).
 */
export function createTaskGraph(
  tasks: Array<{
    id: string;
    title: string;
    dependencies?: string[];
    status?: TaskNodeStatus;
  }>
): TaskGraph {
  const nodes = new Map<string, TaskNode>();
  const dependents = new Map<string, string[]>();

  // Initialize nodes
  for (const task of tasks) {
    const deps = task.dependencies ?? [];
    nodes.set(task.id, {
      id: task.id,
      title: task.title,
      dependencies: deps,
      status: task.status ?? "pending",
    });

    // Initialize dependents map
    if (!dependents.has(task.id)) {
      dependents.set(task.id, []);
    }

    // Register as dependent of each dependency
    for (const depId of deps) {
      if (!dependents.has(depId)) {
        dependents.set(depId, []);
      }
      dependents.get(depId)!.push(task.id);
    }
  }

  return { nodes, dependents };
}

// ─── Graph Validation ───────────────────────────────────────────────

/**
 * Validate the task graph.
 * Checks:
 * 1. No missing dependencies (dependency ID not in graph)
 * 2. No self-dependencies (A depends on A)
 * 3. No duplicate edges
 * 4. No cycles (A → B → A, A → B → C → A)
 */
export function validateGraph(graph: TaskGraph): GraphValidationResult {
  const errors: string[] = [];

  // 1. Check for missing dependencies
  for (const [nodeId, node] of graph.nodes) {
    for (const depId of node.dependencies) {
      if (!graph.nodes.has(depId)) {
        errors.push(`Task "${node.title}" (${nodeId}) depends on missing task ${depId}`);
      }
    }
  }

  // 2. Check for self-dependencies
  for (const [nodeId, node] of graph.nodes) {
    if (node.dependencies.includes(nodeId)) {
      errors.push(`Task "${node.title}" (${nodeId}) depends on itself`);
    }
  }

  // 3. Check for duplicate edges
  for (const [nodeId, node] of graph.nodes) {
    const seen = new Set<string>();
    for (const depId of node.dependencies) {
      if (seen.has(depId)) {
        errors.push(`Task "${node.title}" (${nodeId}) has duplicate dependency on ${depId}`);
      }
      seen.add(depId);
    }
  }

  // 4. Cycle detection (DFS-based)
  const cycleErrors = detectCycles(graph);
  errors.push(...cycleErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Cycle Detection (DFS) ──────────────────────────────────────────

/**
 * Detect cycles using depth-first search.
 * Uses the "white-gray-black" coloring algorithm.
 *
 * White (unvisited) → Gray (in progress) → Black (done)
 * If we encounter a Gray node during DFS, we found a cycle.
 */
const WHITE = 0, GRAY = 1, BLACK = 2;

function detectCycles(graph: TaskGraph): string[] {
  const errors: string[] = [];
  const color = new Map<string, number>();

  // Initialize all nodes as white
  for (const nodeId of graph.nodes.keys()) {
    color.set(nodeId, WHITE);
  }

  // DFS from each unvisited node
  for (const [startNodeId] of graph.nodes) {
    if (color.get(startNodeId) === WHITE) {
      const path: string[] = [];
      dfsDetectCycle(graph, startNodeId, color, path, errors);
    }
  }

  return errors;
}

function dfsDetectCycle(
  graph: TaskGraph,
  nodeId: string,
  color: Map<string, number>,
  path: string[],
  errors: string[]
): void {
  color.set(nodeId, GRAY);
  path.push(nodeId);

  const node = graph.nodes.get(nodeId);
  if (!node) return;

  for (const depId of node.dependencies) {
    const depColor = color.get(depId);

    if (depColor === GRAY) {
      // Found a cycle — construct the cycle path
      const cycleStart = path.indexOf(depId);
      const cyclePath = path.slice(cycleStart).concat(depId);
      const cycleStr = cyclePath.map((id) => {
        const n = graph.nodes.get(id);
        return n ? `"${n.title}"` : id;
      }).join(" → ");
      errors.push(`Circular dependency detected: ${cycleStr}`);
    } else if (depColor === WHITE) {
      dfsDetectCycle(graph, depId, color, path, errors);
    }
  }

  path.pop();
  color.set(nodeId, BLACK);
}

// ─── Ready Task Calculation ─────────────────────────────────────────

/**
 * Calculate which tasks are READY to execute.
 *
 * A task is READY when:
 * - Its status is "pending"
 * - ALL its dependencies have status "completed"
 *
 * A task is BLOCKED when:
 * - Its status is "pending"
 * - Any dependency has status "failed"
 *
 * A task remains PENDING when:
 * - Its status is "pending"
 * - Any dependency is still "pending", "ready", or "running"
 */
export function getReadyTasks(graph: TaskGraph): string[] {
  const ready: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    if (node.status !== "pending") continue;

    const allDepsCompleted = node.dependencies.every(
      (depId) => graph.nodes.get(depId)?.status === "completed"
    );

    if (allDepsCompleted) {
      ready.push(nodeId);
    }
  }

  return ready;
}

/**
 * Get tasks that are BLOCKED because at least one dependency failed.
 */
export function getBlockedTasks(graph: TaskGraph): string[] {
  const blocked: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    if (node.status !== "pending") continue;

    const hasFailedDep = node.dependencies.some(
      (depId) => graph.nodes.get(depId)?.status === "failed"
    );

    if (hasFailedDep) {
      blocked.push(nodeId);
    }
  }

  return blocked;
}

/**
 * Get all tasks that are still pending (not ready, not blocked, not completed, not failed).
 */
export function getPendingTasks(graph: TaskGraph): string[] {
  const pending: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    if (node.status !== "pending") continue;

    const allDepsCompleted = node.dependencies.every(
      (depId) => graph.nodes.get(depId)?.status === "completed"
    );
    const hasFailedDep = node.dependencies.some(
      (depId) => graph.nodes.get(depId)?.status === "failed"
    );

    if (!allDepsCompleted && !hasFailedDep) {
      pending.push(nodeId);
    }
  }

  return pending;
}

// ─── State Updates ──────────────────────────────────────────────────

/**
 * Update a task's status in the graph.
 * This does NOT mark tasks as completed — that is done by the execution layer
 * after ValidationService (P1-C) passes.
 *
 * This function only updates the graph structure so that dependent tasks
 * can be recalculated.
 */
export function updateTaskStatus(
  graph: TaskGraph,
  taskId: string,
  status: TaskNodeStatus
): void {
  const node = graph.nodes.get(taskId);
  if (!node) return;
  node.status = status;
}

/**
 * After a task completes (via validation), check which tasks become ready.
 * Returns the IDs of newly-ready tasks.
 */
export function getNewlyReadyTasks(
  graph: TaskGraph,
  completedTaskId: string
): string[] {
  const newlyReady: string[] = [];
  const dependentIds = graph.dependents.get(completedTaskId) ?? [];

  for (const depId of dependentIds) {
    const node = graph.nodes.get(depId);
    if (!node || node.status !== "pending") continue;

    const allDepsCompleted = node.dependencies.every(
      (dId) => graph.nodes.get(dId)?.status === "completed"
    );

    if (allDepsCompleted) {
      newlyReady.push(depId);
    }
  }

  return newlyReady;
}

/**
 * After a task fails, mark all dependent tasks as blocked.
 * Returns the IDs of newly-blocked tasks (recursively).
 */
export function blockDependentTasks(
  graph: TaskGraph,
  failedTaskId: string
): string[] {
  const blocked: string[] = [];
  const dependentIds = graph.dependents.get(failedTaskId) ?? [];

  for (const depId of dependentIds) {
    const node = graph.nodes.get(depId);
    if (!node || node.status !== "pending") continue;

    // Mark as blocked
    node.status = "blocked";
    blocked.push(depId);

    // Recursively block tasks that depend on this one
    const furtherBlocked = blockDependentTasks(graph, depId);
    blocked.push(...furtherBlocked);
  }

  return blocked;
}

// ─── Graph State Summary ────────────────────────────────────────────

export interface GraphState {
  total: number;
  pending: number;
  ready: number;
  running: number;
  completed: number;
  failed: number;
  blocked: number;
}

export function getGraphState(graph: TaskGraph): GraphState {
  const state: GraphState = {
    total: 0,
    pending: 0,
    ready: 0,
    running: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
  };

  for (const [, node] of graph.nodes) {
    state.total++;

    // Recalculate pending vs ready vs blocked
    if (node.status === "pending") {
      const allDepsCompleted = node.dependencies.every(
        (depId) => graph.nodes.get(depId)?.status === "completed"
      );
      const hasFailedDep = node.dependencies.some(
        (depId) => graph.nodes.get(depId)?.status === "failed"
      );

      if (allDepsCompleted) {
        state.ready++;
      } else if (hasFailedDep) {
        state.blocked++;
      } else {
        state.pending++;
      }
    } else {
      switch (node.status) {
        case "ready": state.ready++; break;
        case "running": state.running++; break;
        case "completed": state.completed++; break;
        case "failed": state.failed++; break;
        case "blocked": state.blocked++; break;
      }
    }
  }

  return state;
}

/**
 * Get the execution order using topological sort.
 * This is the canonical deterministic order for sequential execution.
 * Returns null if the graph has cycles.
 */
export function getTopologicalOrder(graph: TaskGraph): string[] | null {
  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  const queue: string[] = [];

  // Calculate in-degrees
  for (const [nodeId, node] of graph.nodes) {
    inDegree.set(nodeId, node.dependencies.length);
    if (node.dependencies.length === 0) {
      queue.push(nodeId);
    }
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const dependents = graph.dependents.get(current) ?? [];
    for (const depId of dependents) {
      const newDegree = (inDegree.get(depId) ?? 0) - 1;
      inDegree.set(depId, newDegree);
      if (newDegree === 0) {
        queue.push(depId);
      }
    }
  }

  // If not all nodes are in order, there's a cycle
  if (order.length !== graph.nodes.size) {
    return null; // Cycle detected
  }

  return order;
}
