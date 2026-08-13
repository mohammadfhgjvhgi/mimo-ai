// ===================================================================
// MiMo AI — Execution Runtime
// ===================================================================
// Executes tasks with the Plan → Execute → Observe → Validate loop.
// Supports autonomous multi-task missions.
// ===================================================================

import { db } from "@/lib/db";
import { chat, chatStream, generateStructured } from "./model";
import { assembleContext } from "./context";
import { pickAgentForMessage, getAgent } from "./agents";
import { executeTool } from "./tools";
import { writeMemory } from "./memory";
import type {
  AgentRole,
  ChatMessage,
  ExecutionContext,
  PlanTask,
  StreamEvent,
} from "./types";

// ─── Tool call detection ────────────────────────────────────────────

interface ParsedToolCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Detects tool call requests in the model's output.
 * Supports two formats:
 *   1. Explicit JSON: {"tool": "web_search", "input": {"query": "..."}}
 *   2. Inline: I'll search for "X"  → triggers web_search
 */
function parseToolCalls(content: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  // Format 1: explicit JSON tool call
  const jsonPattern = /\{\s*"tool"\s*:\s*"([\w_]+)"\s*,\s*"input"\s*:\s*(\{[^}]+\})\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = jsonPattern.exec(content)) !== null) {
    try {
      const input = JSON.parse(match[2]);
      calls.push({ name: match[1], input });
    } catch {
      // invalid JSON, skip
    }
  }

  // Format 2: inline patterns (only if no JSON calls)
  if (calls.length === 0) {
    const lower = content.toLowerCase();
    // "search for X" / "look up X"
    const searchMatch = content.match(/(?:search|look up|find info(?:rmation)? about)\s+["""']?([^""'\n.]+?)["""']?(?:\s|\.|$)/i);
    if (searchMatch && lower.includes("search")) {
      calls.push({ name: "web_search", input: { query: searchMatch[1].trim(), num: 5 } });
    }
  }

  return calls;
}

/**
 * Detects when the model wants to write a memory.
 */
function parseMemoryWrites(content: string): Array<{
  type: string;
  content: string;
  importance: number;
}> {
  const writes: Array<{ type: string; content: string; importance: number }> = [];
  const pattern = /\{\s*"memory"\s*:\s*\{\s*"type"\s*:\s*"([\w_]+)"\s*,\s*"content"\s*:\s*"([^"]+)"\s*(?:,\s*"importance"\s*:\s*([\d.]+))?\s*\}\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    writes.push({
      type: match[1],
      content: match[2],
      importance: match[3] ? Number(match[3]) : 0.5,
    });
  }
  return writes;
}

/**
 * Heuristic: does this content look like an artifact (code, doc, report)?
 */
function looksLikeArtifact(content: string): {
  isArtifact: boolean;
  type?: string;
  name?: string;
  format?: string;
} {
  const trimmed = content.trim();
  if (trimmed.length < 200) return { isArtifact: false };

  // Code block
  const codeMatch = trimmed.match(/```(\w+)\s*\n([\s\S]*?)\n```/);
  if (codeMatch && codeMatch[2].length > 200) {
    const lang = codeMatch[1].toLowerCase();
    const type =
      lang === "typescript" || lang === "tsx" || lang === "ts" || lang === "javascript" || lang === "jsx"
        ? "code"
        : lang === "python"
        ? "code"
        : lang === "json"
        ? "config"
        : "code";
    return {
      isArtifact: true,
      type,
      name: `code-${Date.now()}`,
      format: lang || "text",
    };
  }

  // Research report
  if (/^#\s+(research\s+report|تقرير\s+بحث)/im.test(trimmed) || /##\s+(findings|key findings|النتائج)/im.test(trimmed)) {
    return { isArtifact: true, type: "research_report", name: `research-${Date.now()}`, format: "markdown" };
  }

  // Architecture / plan
  if (/^#\s+(architecture|plan|design|التصميم|الخطة)/im.test(trimmed)) {
    return { isArtifact: true, type: "architecture_diagram", name: `architecture-${Date.now()}`, format: "markdown" };
  }

  // Test report
  if (/^#\s+(test\s+report|تقرير\s+الاختبار)/im.test(trimmed) || /##\s+(test cases|results)/im.test(trimmed)) {
    return { isArtifact: true, type: "test_report", name: `test-report-${Date.now()}`, format: "markdown" };
  }

  return { isArtifact: false };
}

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

  const ctx: ExecutionContext = {
    conversationId,
    taskId,
    agentName,
    userMessage,
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

  // Use streaming for responsiveness
  try {
    const stream = chatStream(
      context.messages.map((m) => ({ role: m.role, content: m.content })),
      { system: context.system }
    );

    let result;
    while (true) {
      const next = await stream.next();
      if (next.done) {
        result = next.value;
        break;
      }
      responseContent += next.value;
      onEvent?.({ type: "delta", content: next.value });
    }

    if (result) {
      tokenInput = result.usage.promptTokens ?? 0;
      tokenOutput = result.usage.completionTokens ?? 0;
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

  // ─── Tool calls ──────────────────────────────────────────────────
  const toolCalls = parseToolCalls(responseContent);
  if (toolCalls.length > 0) {
    for (const call of toolCalls.slice(0, 3)) {
      // max 3 tool calls per turn
      onEvent?.({ type: "tool", name: call.name, input: call.input, status: "starting" });

      await logExecution({
        conversationId,
        taskId,
        agentName,
        toolName: call.name,
        phase: "execute",
        message: `Calling tool ${call.name}`,
        details: call.input,
      });

      const toolResult = await executeTool(call.name, call.input);
      ctx.toolsUsed.push(call.name);

      onEvent?.({
        type: "tool",
        name: call.name,
        input: call.input,
        output: toolResult.output,
        error: toolResult.error,
        status: toolResult.error ? "error" : "done",
      });

      await logExecution({
        conversationId,
        taskId,
        agentName,
        toolName: call.name,
        phase: "observe",
        message: `Tool ${call.name} ${toolResult.error ? "failed" : "completed"}`,
        details: { input: call.input, error: toolResult.error },
        status: toolResult.error ? "failure" : "success",
      });

      // If tool succeeded, do a follow-up model call with the tool result
      if (!toolResult.error && toolResult.output) {
        const toolSummary = JSON.stringify(toolResult.output).slice(0, 8000);
        const followUpMessages: ChatMessage[] = [
          ...context.messages,
          { role: "assistant", content: responseContent },
          {
            role: "tool",
            content: `Tool ${call.name} returned:\n${toolSummary}`,
            name: call.name,
          },
        ];

        try {
          onEvent?.({ type: "agent", agent: agentName, phase: "synthesize" });
          const followUp = await chat(
            followUpMessages.map((m) => ({ role: m.role, content: m.content })),
            {
              system:
                context.system +
                "\n\nYou just received tool results. Synthesize them into a complete response for the user.",
            }
          );
          responseContent += "\n\n" + followUp.content;
          tokenInput += followUp.usage.promptTokens ?? 0;
          tokenOutput += followUp.usage.completionTokens ?? 0;
          onEvent?.({ type: "delta", content: followUp.content });
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
  }

  // ─── Memory writes ───────────────────────────────────────────────
  const memoryWrites = parseMemoryWrites(responseContent);
  for (const mw of memoryWrites.slice(0, 3)) {
    try {
      const mem = await writeMemory({
        type: mw.type as never,
        content: mw.content,
        importance: mw.importance,
        conversationId,
        source: "agent",
        scope: "conversation",
      });
      ctx.memoriesWritten.push(mem.id);
      onEvent?.({ type: "memory", id: mem.id, memoryType: mw.type, content: mw.content });
    } catch {
      // non-fatal
    }
  }

  // ─── Auto-memory: if assistant produced substantive output, store procedural memory ───
  if (responseContent.length > 300 && !memoryWrites.length) {
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

  // ─── Artifact detection ──────────────────────────────────────────
  const artifactCheck = looksLikeArtifact(responseContent);
  if (artifactCheck.isArtifact && artifactCheck.type && artifactCheck.name && artifactCheck.format) {
    try {
      const artifact = await db.artifact.create({
        data: {
          conversationId,
          taskId,
          name: artifactCheck.name,
          type: artifactCheck.type,
          format: artifactCheck.format,
          content: responseContent,
          summary: responseContent.slice(0, 200),
          sizeBytes: responseContent.length,
        },
      });
      ctx.artifactsCreated.push(artifact.id);
      onEvent?.({
        type: "artifact",
        id: artifact.id,
        name: artifact.name,
        artifactType: artifact.type,
      });
    } catch {
      // non-fatal
    }
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

  // ─── Mark task complete ──────────────────────────────────────────
  if (taskId) {
    await db.task.update({
      where: { id: taskId },
      data: {
        status: "completed",
        completedAt: new Date(),
        completionNotes: responseContent.slice(0, 500),
      },
    });
  }

  await logExecution({
    conversationId,
    taskId,
    agentName,
    phase: "complete",
    message: `Task completed in ${Date.now() - start}ms`,
    durationMs: Date.now() - start,
    details: { toolsUsed: ctx.toolsUsed, artifacts: ctx.artifactsCreated.length },
  });

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

  // 1. Ask orchestrator to produce a plan
  const planSchema = `{
  "understanding": "string",
  "tasks": [
    { "title": "string", "assignedAgent": "researcher|planner|developer|debugger|qa|security|reviewer|documentation|knowledge", "objective": "string", "expectedOutput": "string", "priority": number }
  ],
  "executionOrder": [0, 1, 2],
  "risks": ["string"],
  "completionCriteria": "string"
}`;

  let plan: {
    understanding: string;
    tasks: PlanTask[];
    executionOrder: number[];
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
      executionOrder: [0],
      risks: ["Planner model failed, falling back to direct execution"],
      completionCriteria: "Response delivered",
    };
  }

  // 2. Save tasks to DB
  const taskRecords = await Promise.all(
    plan.tasks.map(async (t, idx) => {
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
          order: plan.executionOrder.indexOf(idx) >= 0 ? plan.executionOrder.indexOf(idx) : idx,
          failurePolicy: "retry",
          maxRetries: 3,
        },
      });
      return task;
    })
  );

  onEvent?.({
    type: "task",
    phase: "planned",
    tasks: plan.tasks.map((t, idx) => ({
      id: taskRecords[idx].id,
      title: t.title,
      agent: t.assignedAgent,
    })),
  });

  // 3. Execute tasks in execution order
  const results: ExecuteTaskResult[] = [];
  let success = true;

  for (const idx of plan.executionOrder) {
    const task = taskRecords[idx];
    if (!task) continue;
    const planTask = plan.tasks[idx];

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
      onEvent?.({
        type: "task",
        phase: "completed",
        taskId: task.id,
        title: task.title,
        agent: planTask.assignedAgent,
        toolsUsed: result.toolsUsed,
        artifactsCreated: result.artifactsCreated.length,
      });
    } else {
      success = false;
      await db.task.update({
        where: { id: task.id },
        data: { status: "failed", completionNotes: lastErr ?? "Unknown error" },
      });
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
        message: `Task failed after ${retryCount} retries: ${lastErr}`,
        status: "failure",
      });
      break; // stop the mission on failure
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
