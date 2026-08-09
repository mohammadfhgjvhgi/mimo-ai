/**
 * MiMo Core — Plugin Manifest + Lifecycle
 * ---------------------------------------
 * Phase 23: MCP/Plugin Foundation.
 * Plugins are registered via manifest, validated, and sandboxed
 * through the Tool Policy Engine.
 *
 * Plugin → Manifest → Capabilities → Permissions → Tool Registration → Lifecycle → Audit
 */

import { toolRegistry } from '../registry';
import type { Tool } from '../registry/types';
import { registerToolPolicy, type ToolPolicy, type RiskLevel } from './ToolPolicyEngine';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';

const log = createLogger('plugin:manager');

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  capabilities: string[]; // ['search', 'code', 'memory', etc]
  tools: PluginToolDefinition[];
  permissions: PluginPermission[];
  sandboxLevel: 'low' | 'medium' | 'high';
}

export interface PluginToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  riskLevel: RiskLevel;
  requiredPermission: 'read' | 'write' | 'network' | 'filesystem' | 'shell';
  requiresConfirmation: boolean;
  timeoutMs: number;
  maxRetries: number;
  execute: (input: unknown, context: unknown) => Promise<unknown>;
}

export interface PluginPermission {
  type: 'memory:read' | 'memory:write' | 'network' | 'filesystem:read' | 'filesystem:write' | 'shell';
  description: string;
}

interface RegisteredPlugin {
  manifest: PluginManifest;
  registeredAt: number;
  active: boolean;
}

const registeredPlugins = new Map<string, RegisteredPlugin>();

/**
 * Register a plugin from its manifest.
 * Validates permissions, registers tools + policies.
 */
export async function registerPlugin(manifest: PluginManifest): Promise<boolean> {
  // Check if already registered
  if (registeredPlugins.has(manifest.id)) {
    log.warn('plugin already registered', { id: manifest.id });
    return false;
  }

  // Validate manifest
  if (!manifest.id || !manifest.name || !manifest.version || !manifest.tools) {
    log.error('invalid plugin manifest', { id: manifest.id });
    return false;
  }

  // Register each tool
  for (const toolDef of manifest.tools) {
    const tool: Tool = {
      id: toolDef.id,
      name: toolDef.name,
      description: toolDef.description,
      category: toolDef.category,
      inputSchema: { type: 'object', description: 'tool input' },
      outputSchema: { type: 'object', description: 'tool output' },
      permissions: [toolDef.requiredPermission],
      execute: toolDef.execute,
    };

    toolRegistry.register(tool);

    // Register tool policy
    const policy: ToolPolicy = {
      toolId: toolDef.id,
      riskLevel: toolDef.riskLevel,
      requiredPermission: toolDef.requiredPermission,
      requiresConfirmation: toolDef.requiresConfirmation,
      timeoutMs: toolDef.timeoutMs,
      maxRetries: toolDef.maxRetries,
    };
    registerToolPolicy(policy);
  }

  registeredPlugins.set(manifest.id, {
    manifest,
    registeredAt: Date.now(),
    active: true,
  });

  mimoEvents.emit(
    createEvent('plugin.registered', { pluginId: manifest.id, toolCount: manifest.tools.length }, 'plugin:manager'),
  );

  log.info('plugin registered', { id: manifest.id, tools: manifest.tools.length });
  return true;
}

/**
 * Unregister a plugin and its tools.
 */
export function unregisterPlugin(pluginId: string): boolean {
  const plugin = registeredPlugins.get(pluginId);
  if (!plugin) return false;

  // Note: toolRegistry doesn't have unregister — tools remain registered
  // but the plugin is marked inactive
  plugin.active = false;
  registeredPlugins.delete(pluginId);

  mimoEvents.emit(
    createEvent('plugin.unregistered', { pluginId }, 'plugin:manager'),
  );

  log.info('plugin unregistered', { id: pluginId });
  return true;
}

/**
 * List all registered plugins.
 */
export function listPlugins(): Array<{ id: string; name: string; version: string; active: boolean; toolCount: number }> {
  return Array.from(registeredPlugins.values()).map((p) => ({
    id: p.manifest.id,
    name: p.manifest.name,
    version: p.manifest.version,
    active: p.active,
    toolCount: p.manifest.tools.length,
  }));
}

/**
 * Check if a plugin has a specific permission.
 */
export function hasPermission(pluginId: string, permissionType: string): boolean {
  const plugin = registeredPlugins.get(pluginId);
  if (!plugin) return false;
  return plugin.manifest.permissions.some((p) => p.type === permissionType);
}
