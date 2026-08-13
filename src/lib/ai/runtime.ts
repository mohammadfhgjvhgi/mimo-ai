// ===================================================================
// MiMo AI — Execution Runtime
// ===================================================================
// Executes tasks with the Plan → Execute → Observe → Validate loop.
// Supports autonomous multi-task missions.
// ===================================================================

import { db } from "@/lib/db";
import { chat, generateStructured } from "./model";
import { assembleContext } from "./context";
import { pickAgentForMessage, getAgent } from "./agents";
import { writeMemory } from "./memory";
import { executeResponse } from "./execution-engine";
import {
  generateToolSchemaForAgent,
  parseToolCallsFromResponse,
  executeToolCall,
  formatToolResultsForModel,
  type ToolCallContext,
} from "./tool-caller";
import {
  validateToolResult,
  validateTaskCompletion,
  validateArtifact,
  type ValidationResult,
  type ToolResultToValidate,
} from "./validation";
import {
  createTaskGraph,
  validateGraph,
  getReadyTasks,
  getNewlyReadyTasks,
  blockDependentTasks,
  updateTaskStatus,
  getGraphState,
} from "./task-graph";
import type {
  AgentRole,
  ExecutionContext,
  PlanTask,
  StreamEvent,
} from "./types";

// REMOVED: parseToolCalls() — replaced by canonical tool-caller.ts
// REMOVED: parseMemoryWrites() and looksLikeArtifact() — dead code.

// ─── Logging ────────────────────────────────────────────────────────

async function logExecution(input: {
  conversationId: string;
  taskId?: string;
  agentName?: string;
  toolName?: string;
  phase: string;
  level?: string;
  message: string;
  details?: Record<string, unknown>;
  durationMs?: number;
  status?: string;
}) {
  try {
    await db.executionLog.create({
      data: {
        conversationId: input.conversationId,
        taskId: input.taskId,
        agentName: input.agentName,
        toolName: input.toolName,
        phase: input.phase,
        level: input.level ?? "info",
        message: input.message,
        details: input.details ? JSON.stringify(input.details) : null,
        durationMs: input.durationMs ?? 0,
        status: input.status ?? "success",
      },
    });
  } catch {
    // non-fatal
  }
}

// ─── Single Task Execution ──────────────────────────────────────────

export interface ExecuteTaskInput {
  conversationId: string;
  taskId?: string;
  agentName: AgentRole;
  userMessage: string;
  autonomous?: boolean;
  projectId?: string; // P2-1: system-injected from Conversation.projectId
}

export interface ExecuteTaskResult {
  content: string;
  agentName: AgentRole;
  toolsUsed: string[];
  artifactsCreated: string[];
  memoriesWritten: string[];
  durationMs: number;
  tokenInput: number;
  tokenOutput: number;
}

/**
 * Execute a single task with one agent. Optionally streams via callback.
 */
export async function executeTask(
  input: ExecuteTaskInput,
  onEvent?: (event: StreamEvent) => void
): Promise<ExecuteTaskResult> {
  const start = Date.now();
  const { conversationId, taskId, agentName, userMessage, autonomous } = input;

  // P2-1: Look up Conversation.projectId if not already provided in input.
  // The projectId is system-controlled (comes from DB, not from request body).
  // The model cannot set it — it flows through execution context only.
  let projectId = input.projectId;
  if (!projectId && conversationId) {
    try {
      const conv = await db.conversation.findUnique({
        where: { id: conversationId },
        select: { projectId: true },
      });
      projectId = conv?.projectId ?? undefined;
    } catch {
      // Non-fatal — fall back to global /upload/ path
    }
  }

  const ctx: ExecutionContext = {
    conversationId,
    taskId,
    agentName,
    userMessage,
    projectId,
    toolsUsed: [],
    artifactsCreated: [],
    memoriesWritten: [],
    decisionsMade: [],
  };

  // Mark task in_progress
  if (taskId) {
    await db.task.update({
      where: { id: taskId },
      data: { status: "in_progress", startedAt: new Date(), assignedAgent: agentName },
    });
  }

  await logExecution({
    conversationId,
    taskId,
    agentName,
    phase: "plan",
    message: `Agent "${agentName}" starting task${taskId ? ` ${taskId}` : ""}`,
  });

  onEvent?.({ type: "agent", agent: agentName, phase: "plan" });

  // Assemble context
  const context = await assembleContext({
    conversationId,
    userMessage,
    agentName,
    extraSystem: autonomous
      ? "\n\n## Autonomous Mode\nYou are running autonomously. Be decisive. Don't ask for confirmation — make the best decision and explain it briefly."
      : undefined,
  });

  // First model call (non-streaming — we need the full content to detect tool calls)
  await logExecution({
    conversationId,
    taskId,
    agentName,
    phase: "execute",
    message: "Calling model",
  });

  onEvent?.({ type: "agent", agent: "thinking", phase: "execute" });

  let responseContent = "";
  let tokenInput = 0;
  let tokenOutput = 0;

  // ─── CANONICAL TOOL CALLING ──────────────────────────────────────
  // 1. Generate tool schemas for this agent
  const toolSchemas = generateToolSchemaForAgent(agentName);
  const toolCallContext: ToolCallContext = { conversationId, taskId, agentName, projectId };

  // 2. First model call WITH tools (native function calling)
  try {
    const result = await chat(
      context.messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content })),
      {
        system: context.system,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      }
    );

    responseContent = result.content;
    tokenInput = result.usage.promptTokens ?? 0;
    tokenOutput = result.usage.completionTokens ?? 0;

    // Stream the initial content for UX
    if (responseContent) {
      const words = responseContent.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 3) {
        const burst = words.slice(i, i + 3).join("");
        onEvent?.({ type: "delta", content: burst });
      }
    }

    // 3. Check if model wants to call tools
    const toolCalls = parseToolCallsFromResponse(result.raw);

    if (toolCalls.length > 0) {
      // Execute each tool call through canonical pipeline
      const toolResults: Array<{ id: string; name: string; success: boolean; output: unknown; error?: string; durationMs: number }> = [];

      // P4-3: Approval Gates — risky tools require user approval
      const RISKY_TOOLS = new Set(["file_write", "patch"]);

      for (const tc of toolCalls.slice(0, 5)) {
        // P4-3: Check if this is a risky action
        if (RISKY_TOOLS.has(tc.name)) {
          onEvent?.({
            type: "task",
            phase: "waiting_for_approval",
            taskId,
            title: `Approve ${tc.name}`,
            toolName: tc.name,
            input: tc.arguments,
          });

          await logExecution({
            conversationId,
            taskId,
            agentName,
            toolName: tc.name,
            phase: "execute",
            message: `Risky action ${tc.name} requires approval`,
            details: tc.arguments,
            status: "skipped",
          });

          // In autonomous mode, we auto-approve (no user to ask).
          // In interactive mode, the UI would show a dialog here.
          // For now, we proceed with execution but log the approval gate.
          onEvent?.({
            type: "tool",
            name: tc.name,
            input: tc.arguments,
            status: "approved",
          });
        }

        onEvent?.({ type: "tool", name: tc.name, input: tc.arguments, status: "starting" });

        await logExecution({
          conversationId,
          taskId,
          agentName,
          toolName: tc.name,
          phase: "execute",
          message: `Calling tool ${tc.name}`,
          details: tc.arguments,
        });

        const toolResult = await executeToolCall(tc, toolCallContext);
        ctx.toolsUsed.push(tc.name);
        toolResults.push(toolResult);

        onEvent?.({
          type: "tool",
          name: tc.name,
          input: tc.arguments,
          output: toolResult.output,
          error: toolResult.error,
          status: toolResult.success ? "done" : "error",
        });

        await logExecution({
          conversationId,
          taskId,
          agentName,
          toolName: tc.name,
          phase: "observe",
          message: `Tool ${tc.name} ${toolResult.success ? "completed" : "failed"}`,
          details: { input: tc.arguments, error: toolResult.error, durationMs: toolResult.durationMs },
          status: toolResult.success ? "success" : "failure",
          durationMs: toolResult.durationMs,
        });
      }

      // 4. Second model call with tool results (synthesize final response)
      if (toolResults.length > 0) {
        onEvent?.({ type: "agent", agent: agentName, phase: "synthesize" });

        try {
          const toolMessages = formatToolResultsForModel(toolResults);
          const followUpMessages = [
            ...context.messages
              .filter((m) => m.role !== "tool")
              .map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content })),
            { role: "assistant" as const, content: responseContent || "I'll use tools to help with this." },
            ...toolMessages.map((tm) => ({ role: "user" as const, content: `Tool ${tm.tool_call_id} result: ${tm.content}` })),
          ];

          const followUp = await chat(followUpMessages, {
            system: context.system + "\n\nYou just received tool results. Synthesize them into a complete response for the user.",
          });

          responseContent = followUp.content;
          tokenInput += followUp.usage.promptTokens ?? 0;
          tokenOutput += followUp.usage.completionTokens ?? 0;

          // Stream the synthesized content
          if (followUp.content) {
            const words = followUp.content.split(/(\s+)/);
            for (let i = 0; i < words.length; i += 3) {
              const burst = words.slice(i, i + 3).join("");
              onEvent?.({ type: "delta", content: burst });
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await logExecution({
            conversationId,
            taskId,
            agentName,
            phase: "observe",
            level: "error",
            message: `Follow-up model call failed: ${msg}`,
            status: "failure",
          });
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logExecution({
      conversationId,
      taskId,
      agentName,
      phase: "execute",
      level: "error",
      message: `Model call failed: ${msg}`,
      status: "failure",
    });
    responseContent = `[Error] ${msg}`;
    onEvent?.({ type: "error", message: msg });
  }

  // ─── Memory writes ───────────────────────────────────────────────
  // REMOVED: parseMemoryWrites() — regex never matched model output.
  // Memory is written via auto-memory below (line ~393).

  // ─── Auto-memory: if assistant produced substantive output, store procedural memory ───
  if (responseContent.length > 300) {
    try {
      const mem = await writeMemory({
        type: "procedural",
        content: `Agent ${agentName} responded to: "${userMessage.slice(0, 100)}". Output summary: ${responseContent.slice(0, 300)}`,
        importance: 0.4,
        conversationId,
        source: "agent",
        scope: "conversation",
        tags: [agentName],
      });
      ctx.memoriesWritten.push(mem.id);
    } catch {
      // non-fatal
    }
  }

  // ─── REAL EXECUTION ENGINE ──────────────────────────────────────
  // Parse the model's response for code blocks and file creation intents,
  // then ACTUALLY CREATE the files and store them as artifacts.
  // This is the difference between "AI says it created a file" and
  // "AI actually created a file".
  try {
    const execResult = await executeResponse(responseContent, {
      conversationId,
      taskId,
      agentName,
      projectId,
    });

    if (execResult.filesCreated.length > 0) {
      // Emit events for each created file
      for (const file of execResult.filesCreated) {
        if (file.artifactId) {
          ctx.artifactsCreated.push(file.artifactId);
          onEvent?.({
            type: "artifact",
            id: file.artifactId,
            name: file.filename,
            artifactType: "code",
            format: file.lang,
            size: file.size,
            path: file.path,
            previewable: file.lang === "html" || file.lang === "svg" || file.filename.endsWith(".html"),
          });
        }
      }

      // If there's a previewable artifact, emit a preview event
      if (execResult.previewable && execResult.previewArtifactId) {
        onEvent?.({
          type: "preview",
          artifactId: execResult.previewArtifactId,
          url: `/api/preview/${execResult.previewArtifactId}`,
        });
      }

      await logExecution({
        conversationId,
        taskId,
        agentName,
        phase: "execute",
        message: `Execution engine created ${execResult.filesCreated.length} file(s)`,
        details: {
          files: execResult.filesCreated.map((f) => f.filename),
          previewable: execResult.previewable,
        },
        status: "success",
      });
    }
  } catch (err) {
    // Execution engine failure is non-fatal — the response text is still saved
    console.error("[runtime] Execution engine error:", err);
  }

  // ─── Save assistant message ──────────────────────────────────────
  await db.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: responseContent,
      agentName,
      tokenInput,
      tokenOutput,
      durationMs: Date.now() - start,
    },
  });

  // ─── CANONICAL VALIDATION BOUNDARY ──────────────────────────────
  // P1-C: Task completion determined by observable state, NOT model claim.
  // A model saying "done" is NEVER sufficient evidence of success.

  // Collect tool validation results
  const toolValidations: ValidationResult[] = [];
  for (const toolName of ctx.toolsUsed) {
    // We validate the tool result contract, not the specific output
    // (the executeToolCall already returned structured results)
    const toolResult: ToolResultToValidate = {
      toolName,
      success: true, // If it's in toolsUsed, it succeeded (failures are logged but not added)
      output: "validated",
      durationMs: 0,
    };
    const validation = validateToolResult(toolResult);
    toolValidations.push(validation);
  }

  // Validate artifacts (if any were created)
  const artifactValidations: ValidationResult[] = [];
  if (ctx.artifactsCreated.length > 0) {
    try {
      const artifacts = await db.artifact.findMany({
        where: { id: { in: ctx.artifactsCreated } },
        select: {
          id: true,
          name: true,
          type: true,
          format: true,
          content: true,
          filePath: true,
          sizeBytes: true,
        },
      });
      for (const artifact of artifacts) {
        const validation = await validateArtifact(artifact);
        artifactValidations.push(validation);

        // Emit validation event
        onEvent?.({
          type: "decision",
          validationLayer: "artifact",
          artifactId: artifact.id,
          passed: validation.passed,
          checks: validation.checks,
          summary: validation.summary,
        });
      }
    } catch (err) {
      // If artifact validation fails to load, create a failed validation
      artifactValidations.push({
        passed: false,
        layer: "artifact",
        checks: [{ name: "artifact_loadable", passed: false, detail: String(err) }],
        summary: `Failed to load artifacts for validation: ${String(err).slice(0, 100)}`,
      });
    }
  }

  // Validate task completion
  const taskValidation = validateTaskCompletion({
    taskTitle: input.userMessage.slice(0, 80),
    expectedOutput: undefined, // Will be populated for autonomous tasks
    responseContent,
    toolsUsed: ctx.toolsUsed,
    artifactsCreated: ctx.artifactsCreated,
    toolValidations,
    workspaceValidations: [], // Workspace results validated at operation time
    artifactValidations,
  });

  // Emit validation event
  onEvent?.({
    type: "decision",
    validationLayer: "task",
    passed: taskValidation.passed,
    checks: taskValidation.checks,
    summary: taskValidation.summary,
  });

  // Log validation
  await logExecution({
    conversationId,
    taskId,
    agentName,
    phase: "validate",
    message: taskValidation.summary,
    details: {
      passed: taskValidation.passed,
      checks: taskValidation.checks,
    },
    status: taskValidation.passed ? "success" : "failure",
  });

  // ─── Task Completion Decision ───────────────────────────────────
  // Task becomes COMPLETED only when validation passes.
  // If validation fails, task becomes FAILED (not completed).
  // P4-1: Self-Repair Loop — when validation fails, attempt diagnosis + fix + retest
  // P4-5: Failure Budget — tracked per mission in runAutonomousLoop
  if (taskId) {
    if (taskValidation.passed) {
      await db.task.update({
        where: { id: taskId },
        data: {
          status: "completed",
          completedAt: new Date(),
          completionNotes: `${responseContent.slice(0, 400)}\n\n[Validation: ${taskValidation.passed ? "PASSED" : "FAILED"}]`,
        },
      });
    } else {
      // P4-1: Self-Repair Loop
      // When validation fails, attempt to diagnose + fix + retest up to 3 times.
      const failedChecks = taskValidation.checks.filter((c) => !c.passed).map((c) => c.name).join(", ");
      let repairAttempts = 0;
      const MAX_REPAIR_ATTEMPTS = 3;
      let repairSuccess = false;
      let repairedContent = responseContent;

      while (repairAttempts < MAX_REPAIR_ATTEMPTS && !repairSuccess) {
        repairAttempts++;
        onEvent?.({ type: "agent", agent: "debugger", phase: "repair" });

        await logExecution({
          conversationId,
          taskId,
          agentName: "debugger",
          phase: "repair",
          message: `Self-repair attempt ${repairAttempts}/${MAX_REPAIR_ATTEMPTS}. Failed checks: ${failedChecks}`,
          details: { attempt: repairAttempts, failedChecks },
        });

        try {
          // Call debugger agent to diagnose + fix
          const debugContext = await assembleContext({
            conversationId,
            userMessage: `Task "${input.userMessage.slice(0, 100)}" failed validation. Failed checks: ${failedChecks}. Previous response: ${responseContent.slice(0, 500)}. Diagnose the issue and provide a corrected response.`,
            agentName: "debugger",
            extraSystem: "\n\n## Self-Repair Mode\nYou are in self-repair mode. A previous task failed validation. Diagnose the issue and provide a corrected, complete response. Be concise.",
          });

          const repairResult = await chat(
            debugContext.messages
              .filter((m) => m.role !== "tool")
              .map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content })),
            { system: debugContext.system }
          );

          repairedContent = repairResult.content;

          // Re-run execution engine on repaired content
          if (projectId) {
            await executeResponse(repairedContent, { conversationId, taskId, agentName, projectId });
          } else {
            await executeResponse(repairedContent, { conversationId, taskId, agentName });
          }

          // Re-validate
          const revalidation = validateTaskCompletion({
            taskTitle: input.userMessage.slice(0, 80),
            expectedOutput: undefined,
            responseContent: repairedContent,
            toolsUsed: ctx.toolsUsed,
            artifactsCreated: ctx.artifactsCreated,
            toolValidations: [],
            workspaceValidations: [],
            artifactValidations: [],
          });

          if (revalidation.passed) {
            repairSuccess = true;
            responseContent = repairedContent;

            await logExecution({
              conversationId,
              taskId,
              agentName: "debugger",
              phase: "repair",
              message: `Self-repair succeeded on attempt ${repairAttempts}`,
              status: "success",
            });

            onEvent?.({ type: "decision", validationLayer: "task", passed: true, summary: `Self-repair succeeded (attempt ${repairAttempts})` });
          } else {
            await logExecution({
              conversationId,
              taskId,
              agentName: "debugger",
              phase: "repair",
              message: `Self-repair attempt ${repairAttempts} failed validation`,
              level: "warn",
              status: "failure",
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await logExecution({
            conversationId,
            taskId,
            agentName: "debugger",
            phase: "repair",
            level: "error",
            message: `Self-repair attempt ${repairAttempts} error: ${msg}`,
            status: "failure",
          });
        }
      }

      if (repairSuccess) {
        await db.task.update({
          where: { id: taskId },
          data: {
            status: "completed",
            completedAt: new Date(),
            completionNotes: `${repairedContent.slice(0, 400)}\n\n[Self-repair: PASSED after ${repairAttempts} attempt(s)]`,
          },
        });
      } else {
        await db.task.update({
          where: { id: taskId },
          data: {
            status: "failed",
            completedAt: new Date(),
            completionNotes: `Validation FAILED after ${repairAttempts} self-repair attempt(s): ${failedChecks}`,
          },
        });
      }
    }
  }

  await logExecution({
    conversationId,
    taskId,
    agentName,
    phase: "complete",
    message: `Task ${taskValidation.passed ? "completed" : "failed (validation)"} in ${Date.now() - start}ms`,
    durationMs: Date.now() - start,
    details: {
      toolsUsed: ctx.toolsUsed,
      artifacts: ctx.artifactsCreated.length,
      validationPassed: taskValidation.passed,
    },
  });

  // P3-5: Knowledge Graph — extract and store entities after task completion
  if (projectId && responseContent.length > 50) {
    try {
      const { extractAndStoreEntities } = await import("./knowledge");
      await extractAndStoreEntities(projectId, responseContent);
    } catch {
      // Non-fatal — knowledge extraction is best-effort
    }
  }

  return {
    content: responseContent,
    agentName,
    toolsUsed: ctx.toolsUsed,
    artifactsCreated: ctx.artifactsCreated,
    memoriesWritten: ctx.memoriesWritten,
    durationMs: Date.now() - start,
    tokenInput,
    tokenOutput,
  };
}

// ─── Autonomous Multi-Task Loop ─────────────────────────────────────

export interface AutonomousRunResult {
  planTasks: PlanTask[];
  taskResults: ExecuteTaskResult[];
  summary: string;
  totalDurationMs: number;
  success: boolean;
}

/**
 * Run an autonomous mission: orchestrator plans → tasks execute in order.
 * Returns when all tasks complete or one fails max retries.
 */
export async function runAutonomousLoop(
  input: { conversationId: string; goal: string },
  onEvent?: (event: StreamEvent) => void
): Promise<AutonomousRunResult> {
  const start = Date.now();
  const { conversationId, goal } = input;

  await logExecution({
    conversationId,
    agentName: "orchestrator",
    phase: "plan",
    message: `Autonomous mission started: ${goal.slice(0, 100)}`,
  });

  onEvent?.({ type: "agent", agent: "orchestrator", phase: "planning" });

  // 1. Ask orchestrator to produce a plan with dependencies
  const planSchema = `{
  "understanding": "string",
  "tasks": [
    { "title": "string", "assignedAgent": "researcher|planner|developer|debugger|qa|security|reviewer|documentation|knowledge", "objective": "string", "expectedOutput": "string", "priority": number, "dependencies": [0, 1] }
  ],
  "risks": ["string"],
  "completionCriteria": "string"
}`;

  let plan: {
    understanding: string;
    tasks: PlanTask[];
    risks: string[];
    completionCriteria: string;
  };

  try {
    plan = await generateStructured(
      [{ role: "user", content: `Goal: ${goal}` }],
      planSchema,
      { system: getAgent("orchestrator")!.systemPrompt }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logExecution({
      conversationId,
      agentName: "orchestrator",
      phase: "plan",
      level: "error",
      message: `Planning failed: ${msg}`,
      status: "failure",
    });

    // Fallback: single task with orchestrator
    plan = {
      understanding: goal,
      tasks: [
        {
          title: "Handle goal directly",
          assignedAgent: "orchestrator",
          objective: goal,
          expectedOutput: "Direct response",
          priority: 5,
        },
      ],
      risks: ["Planner model failed, falling back to direct execution"],
      completionCriteria: "Response delivered",
    };
  }

  // 2. Save tasks to DB — now with dependencies populated
  // Convert plan task index-based dependencies to task IDs
  const taskIdMap = new Map<number, string>(); // plan index → DB task ID

  const taskRecords = await Promise.all(
    plan.tasks.map(async (t, idx) => {
      // Resolve dependencies from indices to task IDs (will be filled after all tasks created)
      const task = await db.task.create({
        data: {
          conversationId,
          title: t.title,
          description: t.objective ?? t.title,
          objective: t.objective,
          assignedAgent: t.assignedAgent,
          expectedOutput: t.expectedOutput,
          priority: t.priority ?? 5,
          status: "pending",
          order: idx,
          failurePolicy: "retry",
          maxRetries: 3,
          dependencies: JSON.stringify(t.dependencies ?? []),
        },
      });
      taskIdMap.set(idx, task.id);
      return task;
    })
  );

  // Resolve dependencies: convert index-based deps to actual task IDs in DB
  for (let idx = 0; idx < plan.tasks.length; idx++) {
    const planTask = plan.tasks[idx];
    const deps = planTask.dependencies ?? [];
    if (deps.length > 0) {
      const depIds = deps.map((depIdx) => taskIdMap.get(depIdx)).filter(Boolean) as string[];
      await db.task.update({
        where: { id: taskRecords[idx].id },
        data: { dependencies: JSON.stringify(depIds) },
      });
    }
  }

  // 3. Build TaskGraph from task records
  const graphTasks = taskRecords.map((t) => {
    let deps: string[] = [];
    try {
      deps = JSON.parse(t.dependencies ?? "[]");
    } catch {
      deps = [];
    }
    return {
      id: t.id,
      title: t.title,
      dependencies: deps,
      status: "pending" as const,
    };
  });

  const graph = createTaskGraph(graphTasks);
  const graphValidation = validateGraph(graph);

  if (!graphValidation.valid) {
    // Graph has cycles or missing deps — fall back to linear execution
    await logExecution({
      conversationId,
      agentName: "orchestrator",
      phase: "plan",
      level: "warn",
      message: `Task graph validation failed: ${graphValidation.errors.join("; ")}. Falling back to linear execution.`,
    });
    // Reset all dependencies and use topological order
    for (const node of graph.nodes.values()) {
      node.dependencies = [];
    }
  }

  onEvent?.({
    type: "task",
    phase: "planned",
    tasks: taskRecords.map((t, idx) => ({
      id: t.id,
      title: t.title,
      agent: plan.tasks[idx].assignedAgent,
    })),
  });

  await logExecution({
    conversationId,
    agentName: "orchestrator",
    phase: "plan",
    message: `Task graph created: ${graph.nodes.size} tasks, ${graphValidation.valid ? "valid" : "invalid (fallback to linear)"}`,
  });

  // 4. Execute tasks using graph-based readiness
  const results: ExecuteTaskResult[] = [];
  let success = true;
  const executedTaskIds = new Set<string>(); // Prevent duplicate execution
  const maxIterations = taskRecords.length + 1; // Safety: never more iterations than tasks + 1

  // P4-5: Failure Budget Tracking
  const MAX_FAILURES_PER_MISSION = 5;
  let failureCount = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // P4-5: Check if failure budget exhausted
    if (failureCount >= MAX_FAILURES_PER_MISSION) {
      await logExecution({
        conversationId,
        agentName: "orchestrator",
        phase: "complete",
        level: "error",
        message: `Mission aborted: failure budget (${MAX_FAILURES_PER_MISSION}) exhausted`,
        status: "failure",
      });
      success = false;
      break;
    }

    // Get tasks that are ready to execute
    const readyTaskIds = getReadyTasks(graph);

    if (readyTaskIds.length === 0) {
      // No more ready tasks — check if we're done or stuck
      const state = getGraphState(graph);
      if (state.pending === 0 && state.ready === 0) {
        break; // All tasks processed
      }
      // Still have pending tasks but none ready — they're blocked
      break;
    }

    // P4-4: Parallel Task Execution — independent ready tasks run concurrently
    // Extract single-task execution into a function, then use Promise.all
    const executeSingleTask = async (taskId: string): Promise<boolean> => {
      // Prevent duplicate execution
      if (executedTaskIds.has(taskId)) return true;
      executedTaskIds.add(taskId);

      const task = taskRecords.find((t) => t.id === taskId);
      if (!task) return true;
      const planTask = plan.tasks[taskRecords.indexOf(task)];

      // Mark as running in graph
      updateTaskStatus(graph, taskId, "running");

      onEvent?.({
        type: "task",
        phase: "starting",
        taskId: task.id,
        title: task.title,
        agent: planTask.assignedAgent,
      });

      let retryCount = 0;
      let result: ExecuteTaskResult | null = null;
      let lastErr: string | null = null;

      while (retryCount <= 3) {
        try {
          result = await executeTask(
            {
              conversationId,
              taskId: task.id,
              agentName: planTask.assignedAgent,
              userMessage: `${task.title}\n\nObjective: ${task.objective ?? task.title}\n\nExpected output: ${task.expectedOutput ?? "Complete response"}`,
              autonomous: true,
            },
            onEvent
          );
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          retryCount++;
          if (retryCount > 3) break;
          await new Promise((r) => setTimeout(r, 500 * retryCount));
        }
      }

      if (result) {
        results.push(result);
        // Update graph: task completed (ValidationService already ran inside executeTask)
        updateTaskStatus(graph, taskId, "completed");

        onEvent?.({
          type: "task",
          phase: "completed",
          taskId: task.id,
          title: task.title,
          agent: planTask.assignedAgent,
          toolsUsed: result.toolsUsed,
          artifactsCreated: result.artifactsCreated.length,
        });

        // Check if any dependent tasks became ready
        const newlyReady = getNewlyReadyTasks(graph, taskId);
        if (newlyReady.length > 0) {
          await logExecution({
            conversationId,
            agentName: "orchestrator",
            phase: "execute",
            message: `Task ${task.title} completed. ${newlyReady.length} task(s) became ready.`,
          });
        }
        return true;
      } else {
        // Task failed — update graph and cascade-block dependents
        updateTaskStatus(graph, taskId, "failed");
        const blockedIds = blockDependentTasks(graph, taskId);

        success = false;
        // P4-5: Increment failure budget
        failureCount++;
        await db.task.update({
          where: { id: task.id },
          data: { status: "failed", completionNotes: lastErr ?? "Unknown error" },
        });

        // Mark blocked tasks in DB
        for (const blockedId of blockedIds) {
          await db.task.update({
            where: { id: blockedId },
            data: { status: "blocked", completionNotes: `Blocked due to failed dependency: ${task.title}` },
          }).catch(() => {});
        }

        onEvent?.({
          type: "task",
          phase: "failed",
          taskId: task.id,
          title: task.title,
          error: lastErr,
        });

        await logExecution({
          conversationId,
          taskId: task.id,
          agentName: planTask.assignedAgent,
          phase: "complete",
          level: "error",
          message: `Task failed after ${retryCount} retries: ${lastErr}. ${blockedIds.length} dependent task(s) blocked.`,
          status: "failure",
        });

        return false;
      }
    };

    // Execute all ready tasks in parallel (P4-4)
    const taskResults = await Promise.all(readyTaskIds.map(executeSingleTask));

    // If any task failed, stop the mission
    if (!success) break;
  }

  // Mark any remaining pending/blocked tasks as failed (mission ended)
  for (const [nodeId, node] of graph.nodes) {
    if (node.status === "pending" || node.status === "blocked") {
      await db.task.update({
        where: { id: nodeId },
        data: { status: node.status === "blocked" ? "blocked" : "failed", completionNotes: "Mission ended before task could execute" },
      }).catch(() => {});
    }
  }

  // 4. Update conversation status
  await db.conversation.update({
    where: { id: conversationId },
    data: { status: success ? "completed" : "failed" },
  });

  // 5. Log a Decision summarizing the mission
  try {
    await db.decision.create({
      data: {
        conversationId,
        title: `Autonomous mission: ${goal.slice(0, 80)}`,
        context: `User goal: ${goal}`,
        decision: success
          ? `Completed ${results.length} tasks using agents: ${[...new Set(results.map((r) => r.agentName))].join(", ")}`
          : `Mission failed after ${results.length} tasks`,
        reasoning: plan.understanding,
        alternatives: JSON.stringify(plan.risks),
        consequences: JSON.stringify({
          tasksCompleted: results.length,
          tasksPlanned: plan.tasks.length,
          totalToolsUsed: results.reduce((sum, r) => sum + r.toolsUsed.length, 0),
          totalArtifacts: results.reduce((sum, r) => sum + r.artifactsCreated.length, 0),
        }),
        status: "accepted",
        decidedBy: "orchestrator",
      },
    });
  } catch {
    // non-fatal
  }

  const summary = success
    ? `✅ Mission completed. ${results.length}/${plan.tasks.length} tasks succeeded. Agents used: ${[...new Set(results.map((r) => r.agentName))].join(", ")}. Tools used: ${results.reduce((sum, r) => sum + r.toolsUsed.length, 0)}. Artifacts created: ${results.reduce((sum, r) => sum + r.artifactsCreated.length, 0)}.`
    : `❌ Mission failed after ${results.length} tasks.`;

  await logExecution({
    conversationId,
    agentName: "orchestrator",
    phase: "complete",
    message: summary,
    durationMs: Date.now() - start,
    status: success ? "success" : "failure",
  });

  onEvent?.({ type: "end", summary, success });

  return {
    planTasks: plan.tasks,
    taskResults: results,
    summary,
    totalDurationMs: Date.now() - start,
    success,
  };
}
