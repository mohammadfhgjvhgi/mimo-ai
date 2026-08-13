// ===================================================================
// MiMo AI — Canonical Tool Caller
// ===================================================================
// SINGLE source of truth for tool invocation.
// Uses ZAI SDK native function calling (confirmed working in v0.0.18).
//
// Flow:
// MODEL (with tools schema) → tool_calls in response
//   → SCHEMA VALIDATION (parse arguments JSON)
//   → TOOL REGISTRY (resolve tool by name)
//   → PERMISSION CHECK (risk level + agent authority)
//   → TOOL EXECUTION (with timeout)
//   → STRUCTURED RESULT (success/failure + output)
//   → MODEL (second call with tool results)
//   → FINAL RESPONSE
// ===================================================================

import type { ToolDefinition } from "./types";
import { TOOLS, executeTool } from "./tools";
import { getAgent } from "./agents";

// ─── Types ──────────────────────────────────────────────────────────

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface ToolCallContext {
  conversationId: string;
  taskId?: string;
  agentName: string;
  projectId?: string; // P2-1: optional, system-injected from Conversation.projectId
}

// ─── Tool Schema Generation for SDK ─────────────────────────────────

/**
 * Convert internal ToolDefinition[] to ZAI SDK tools format.
 * Only includes tools the agent is allowed to use.
 */
export function generateToolSchemaForAgent(agentName: string): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  const agent = getAgent(agentName);
  const allowedTools = agent?.defaultTools ?? Object.keys(TOOLS);

  return allowedTools
    .filter((name) => TOOLS[name] !== undefined)
    .map((name) => ({
      type: "function" as const,
      function: {
        name,
        description: TOOLS[name].description,
        parameters: TOOLS[name].inputSchema,
      },
    }));
}

// ─── Parse Model Tool Calls ─────────────────────────────────────────

/**
 * Parse tool_calls from ZAI SDK response into structured ToolCallRequest[].
 * Handles malformed arguments gracefully.
 */
export function parseToolCallsFromResponse(
  response: unknown
): ToolCallRequest[] {
  const choices = (response as { choices?: Array<{ message?: { tool_calls?: unknown[] } }> })?.choices;
  if (!choices || choices.length === 0) return [];

  const toolCalls = choices[0]?.message?.tool_calls;
  if (!Array.isArray(toolCalls)) return [];

  const results: ToolCallRequest[] = [];

  for (const tc of toolCalls) {
    const call = tc as {
      id?: string;
      function?: { name?: string; arguments?: string };
      type?: string;
    };

    if (!call || call.type !== "function" || !call.function) continue;

    const name = call.function.name;
    const argsStr = call.function.arguments;
    const id = call.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!name) continue;

    // Parse arguments JSON safely
    let args: Record<string, unknown> = {};
    if (typeof argsStr === "string") {
      try {
        args = JSON.parse(argsStr);
      } catch {
        // Malformed arguments — will be caught by schema validation
        args = { _parseError: argsStr };
      }
    } else if (typeof argsStr === "object" && argsStr !== null) {
      args = argsStr as Record<string, unknown>;
    }

    results.push({ id, name, arguments: args });
  }

  return results;
}

// ─── Schema Validation ──────────────────────────────────────────────

/**
 * Validate tool arguments against required fields.
 * Lightweight validation — checks required fields exist.
 */
export function validateToolArguments(
  toolName: string,
  args: Record<string, unknown>
): { valid: boolean; error?: string } {
  const tool = TOOLS[toolName];
  if (!tool) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  // Check for parse errors
  if (args._parseError) {
    return { valid: false, error: `Malformed arguments: ${args._parseError}` };
  }

  // Check required fields
  const schema = tool.inputSchema;
  const required = (schema.required as string[]) ?? [];

  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      return { valid: false, error: `Missing required argument: ${field}` };
    }
  }

  return { valid: true };
}

// ─── Permission Check ───────────────────────────────────────────────

/**
 * Check if the agent is allowed to use this tool.
 */
export function checkToolPermission(
  agentName: string,
  toolName: string
): { allowed: boolean; reason?: string } {
  const tool = TOOLS[toolName];
  if (!tool) {
    return { allowed: false, reason: `Tool not found: ${toolName}` };
  }

  const agent = getAgent(agentName);
  if (!agent) {
    // Unknown agent — allow all tools (fallback)
    return { allowed: true };
  }

  const allowedTools = agent.defaultTools;
  if (!allowedTools.includes(toolName)) {
    return {
      allowed: false,
      reason: `Agent "${agentName}" is not authorized to use tool "${toolName}". Allowed: ${allowedTools.join(", ")}`,
    };
  }

  return { allowed: true };
}

// ─── Canonical Tool Execution ───────────────────────────────────────

/**
 * Execute a tool call through the canonical pipeline:
 * validate → permission check → execute → structure result
 */
export async function executeToolCall(
  request: ToolCallRequest,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const start = Date.now();

  // 1. Schema validation
  const validation = validateToolArguments(request.name, request.arguments);
  if (!validation.valid) {
    return {
      id: request.id,
      name: request.name,
      success: false,
      output: null,
      error: validation.error,
      durationMs: Date.now() - start,
    };
  }

  // 2. Permission check
  const permission = checkToolPermission(context.agentName, request.name);
  if (!permission.allowed) {
    return {
      id: request.id,
      name: request.name,
      success: false,
      output: null,
      error: permission.reason,
      durationMs: Date.now() - start,
    };
  }

  // 3. Execute (executeTool already has timeout + error handling)
  // SECURITY: For memory_store, inject conversationId from execution context.
  // The model must NOT control memory scope — only the system decides.
  let toolInput = request.arguments;

  // P2-1 [HARDENING 5]: For filesystem tools, inject _systemProjectId from
  // execution context. The model must NOT control which project it writes to.
  //
  // Defense-in-depth (two layers):
  //   1. STRIP any model-provided projectId / _systemProjectId fields BEFORE
  //      injection. The model should not send these (they're not in any tool
  //      schema), but if it does (prompt injection, hallucination), we remove
  //      them.
  //   2. Spread system value LAST so it ALWAYS overwrites any remaining value.
  //      (Belt-and-suspenders: stripping already removed model input, but
  //      spread-order guarantees system wins regardless.)
  const FS_TOOLS = new Set(["file_read", "file_write", "file_search", "code_search", "patch", "file_edit", "file_delete", "file_rename", "dir_create", "dir_list"]);
  if (FS_TOOLS.has(request.name)) {
    // Layer 1: strip model-provided projectId / _systemProjectId
    const {
      projectId: _stripped1,
      _systemProjectId: _stripped2,
      ...modelInput
    } = request.arguments;

    // Layer 2: spread modelInput FIRST, system value LAST (system always wins)
    toolInput = {
      ...modelInput,
      ...(context.projectId ? { _systemProjectId: context.projectId } : {}),
    };
  }

  if (request.name === "memory_store" && context.conversationId) {
    toolInput = {
      ...toolInput,
      // System-injected conversationId — overrides any model-provided value
      conversationId: context.conversationId,
      // System-injected scope — model cannot escalate to "global"
      _systemConversationId: context.conversationId,
    };
  }

  const result = await executeTool(request.name, toolInput);

  return {
    id: request.id,
    name: request.name,
    success: !result.error,
    output: result.output,
    error: result.error,
    durationMs: Date.now() - start,
  };
}

// ─── Format Tool Results for Model ──────────────────────────────────

/**
 * Convert ToolCallResult[] to ZAI SDK message format for follow-up call.
 */
export function formatToolResultsForModel(
  results: ToolCallResult[]
): Array<{ role: "tool"; content: string; tool_call_id: string }> {
  return results.map((r) => ({
    role: "tool" as const,
    content: r.success
      ? JSON.stringify(r.output).slice(0, 8000)
      : `Error: ${r.error}`,
    tool_call_id: r.id,
  }));
}
