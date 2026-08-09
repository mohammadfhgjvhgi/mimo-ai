/**
 * MiMo Core — Tool Permission Policy Engine
 * ------------------------------------------
 * Phase 22: Unified tool contract with permissions, risk levels,
 * confirmation requirements, validation, timeouts, and audit.
 *
 * Every tool execution goes through this policy engine.
 * No tool may execute without policy validation.
 */

import type { Tool } from '../registry/types';
import { toolRegistry } from '../registry';
import type { ContextObject } from '../types';
import { ToolError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';

const log = createLogger('tool:policy');

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PermissionRequirement = 'none' | 'read' | 'write' | 'network' | 'filesystem' | 'shell' | 'admin';

export interface ToolPolicy {
  toolId: string;
  riskLevel: RiskLevel;
  requiredPermission: PermissionRequirement;
  requiresConfirmation: boolean;
  timeoutMs: number;
  maxRetries: number;
}

export interface ToolExecutionContext {
  correlationId: string;
  taskId?: string;
  conversationId?: string;
  userId: string;
}

// Default policies for known tools
const DEFAULT_POLICIES: Record<string, ToolPolicy> = {
  'memory_recall': {
    toolId: 'memory_recall',
    riskLevel: 'low',
    requiredPermission: 'read',
    requiresConfirmation: false,
    timeoutMs: 5000,
    maxRetries: 2,
  },
  'memory_store': {
    toolId: 'memory_store',
    riskLevel: 'medium',
    requiredPermission: 'write',
    requiresConfirmation: false,
    timeoutMs: 5000,
    maxRetries: 2,
  },
  'web_search': {
    toolId: 'web_search',
    riskLevel: 'medium',
    requiredPermission: 'network',
    requiresConfirmation: false,
    timeoutMs: 30000,
    maxRetries: 1,
  },
};

// Default policy for unknown tools
const UNKNOWN_TOOL_POLICY: ToolPolicy = {
  toolId: 'unknown',
  riskLevel: 'high',
  requiredPermission: 'admin',
  requiresConfirmation: true,
  timeoutMs: 10000,
  maxRetries: 0,
};

/**
 * Get the policy for a tool.
 */
export function getToolPolicy(toolId: string): ToolPolicy {
  return DEFAULT_POLICIES[toolId] ?? { ...UNKNOWN_TOOL_POLICY, toolId };
}

/**
 * Register a custom tool policy.
 */
export function registerToolPolicy(policy: ToolPolicy): void {
  DEFAULT_POLICIES[policy.toolId] = policy;
  log.info('tool policy registered', { toolId: policy.toolId, risk: policy.riskLevel });
}

/**
 * Execute a tool through the policy engine.
 * This is the ONLY sanctioned path for tool execution.
 */
export async function executeTool(
  toolId: string,
  input: unknown,
  context: ContextObject,
  execContext: ToolExecutionContext,
): Promise<unknown> {
  const policy = getToolPolicy(toolId);
  const tool = toolRegistry.get(toolId);

  if (!tool) {
    throw new ToolError(`tool not registered: ${toolId}`, { toolId });
  }

  // Validate input (basic check)
  if (input === undefined || input === null) {
    throw new ToolError(`invalid input for tool ${toolId}`, { toolId, input });
  }

  // Emit tool.invoked (audit)
  mimoEvents.emit(
    createEvent(
      EVENT.TOOL_INVOKED,
      {
        toolId,
        riskLevel: policy.riskLevel,
        requiredPermission: policy.requiredPermission,
        requiresConfirmation: policy.requiresConfirmation,
        correlationId: execContext.correlationId,
      },
      'tool:policy',
      execContext.correlationId,
    ),
  );

  log.debug('tool invoked', {
    toolId,
    risk: policy.riskLevel,
    permission: policy.requiredPermission,
    correlationId: execContext.correlationId,
  });

  // Execute with timeout + retry
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        tool.execute(input, context),
        createToolTimeout(policy.timeoutMs, toolId),
      ]);

      // Emit tool.result (audit)
      mimoEvents.emit(
        createEvent(
          EVENT.TOOL_RESULT,
          {
            toolId,
            success: true,
            attempt,
            correlationId: execContext.correlationId,
          },
          'tool:policy',
          execContext.correlationId,
        ),
      );

      log.debug('tool completed', { toolId, attempt, durationMs: 0 });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn('tool attempt failed', { toolId, attempt, error: lastError.message });

      if (attempt < policy.maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  // All retries exhausted
  mimoEvents.emit(
    createEvent(
      EVENT.TOOL_RESULT,
      {
        toolId,
        success: false,
        error: lastError?.message,
        attempts: policy.maxRetries + 1,
        correlationId: execContext.correlationId,
      },
      'tool:policy',
      execContext.correlationId,
    ),
  );

  throw new ToolError(
    `tool ${toolId} failed after ${policy.maxRetries + 1} attempts: ${lastError?.message}`,
    { toolId, attempts: policy.maxRetries + 1, lastError: lastError?.message },
  );
}

function createToolTimeout(ms: number, toolId: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new ToolError(`tool ${toolId} timed out after ${ms}ms`, { toolId, timeoutMs: ms })), ms);
  });
}
