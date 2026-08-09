/**
 * MiMo Core — Registries (Tool / Agent / Model)
 * ---------------------------------------------
 * Each registry is a typed Map wrapper. Registration is idempotent for
 * the same instance, but registering a *different* instance under an
 * existing id throws RegistryError.
 *
 * Lookups never throw on miss — they return undefined so callers can
 * decide (e.g. fall back to a default agent).
 */

import { RegistryError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import type { Agent, Tool, Model } from './types';

const log = createLogger('registry');

/* ─────────── ToolRegistry ─────────── */

class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    const existing = this.tools.get(tool.id);
    if (existing && existing !== tool) {
      throw new RegistryError(`tool already registered with different instance: ${tool.id}`, {
        id: tool.id,
      });
    }
    this.tools.set(tool.id, tool);
    log.debug('tool registered', { id: tool.id, category: tool.category });
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  list(category?: string): readonly Tool[] {
    const all = Array.from(this.tools.values());
    return category ? all.filter((t) => t.category === category) : all;
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  /**
   * Invoke a tool by id. Emits tool.invoked + tool.result events.
   *
   * SECURITY (Phase 116): delegates to `ToolPolicyEngine.executeTool` —
   * the policy engine is the ONLY sanctioned execution path. It enforces
   * risk-level gating, permission checks, timeouts, retries, and audit
   * logging. Direct `tool.execute()` from agents is forbidden.
   *
   * Throws RegistryError if the tool is not registered.
   */
  async invoke(
    id: string,
    input: unknown,
    context: import('../types').ContextObject,
  ): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new RegistryError(`tool not found: ${id}`, { id });
    }
    const correlationId = context.conversation.id;
    mimoEvents.emit(
      createEvent(EVENT.TOOL_INVOKED, { toolId: id, input }, 'registry', correlationId),
    );

    // Delegate to the ToolPolicyEngine — the ONLY sanctioned execution path.
    // Lazy-import to avoid a circular dependency at module-eval time
    // (ToolPolicyEngine imports toolRegistry).
    const { executeTool } = await import('../tools/ToolPolicyEngine');
    const result = await executeTool(id, input, context, {
      correlationId,
      userId: context.user.id,
      conversationId: correlationId,
    });

    mimoEvents.emit(
      createEvent(EVENT.TOOL_RESULT, { toolId: id, result }, 'registry', correlationId),
    );
    return result;
  }
}

/* ─────────── AgentRegistry ─────────── */

class AgentRegistry {
  private readonly agents = new Map<string, Agent>();

  register(agent: Agent): void {
    const existing = this.agents.get(agent.id);
    if (existing && existing !== agent) {
      throw new RegistryError(`agent already registered with different instance: ${agent.id}`, {
        id: agent.id,
      });
    }
    this.agents.set(agent.id, agent);
    log.debug('agent registered', { id: agent.id, capabilities: agent.capabilities });
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  list(): readonly Agent[] {
    return Array.from(this.agents.values());
  }

  /** Find agents that declare the given capability. */
  withCapability(capability: string): readonly Agent[] {
    return this.list().filter((a) => a.capabilities.includes(capability));
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }
}

/* ─────────── ModelRegistry ─────────── */

class ModelRegistry {
  private readonly models = new Map<string, Model>();
  private defaultId: string | undefined;

  register(model: Model, options?: { default?: boolean }): void {
    const existing = this.models.get(model.id);
    if (existing && existing !== model) {
      throw new RegistryError(`model already registered with different instance: ${model.id}`, {
        id: model.id,
      });
    }
    this.models.set(model.id, model);
    if (options?.default || !this.defaultId) {
      this.defaultId = model.id;
    }
    log.debug('model registered', { id: model.id, default: this.defaultId === model.id });
  }

  get(id: string): Model | undefined {
    return this.models.get(id);
  }

  default(): Model | undefined {
    return this.defaultId ? this.models.get(this.defaultId) : undefined;
  }

  setDefault(id: string): void {
    if (!this.models.has(id)) {
      throw new RegistryError(`cannot set default — model not registered: ${id}`, { id });
    }
    this.defaultId = id;
  }

  list(): readonly Model[] {
    return Array.from(this.models.values());
  }
}

/* ─────────── Singletons ─────────── */

export const toolRegistry = new ToolRegistry();
export const agentRegistry = new AgentRegistry();
export const modelRegistry = new ModelRegistry();
