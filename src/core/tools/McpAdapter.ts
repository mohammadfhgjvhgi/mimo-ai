/**
 * MiMo Core — MCP Protocol Adapter
 * ---------------------------------
 * Phase 39 + Phase 116 fix: Real MCP (Model Context Protocol) integration.
 *
 * Previously this adapter SIMULATED tool discovery by scanning the existing
 * toolRegistry. That was a mock. It now uses the real `McpJsonRpcClient`
 * which spawns the MCP server process, performs the JSON-RPC initialize
 * handshake, and calls `tools/list` + `tools/call` per the MCP spec.
 *
 * Flow:
 *   registerMcpServer(config)
 *   → connectMcpServer(serverId)
 *     → McpJsonRpcClient.connectStdio(command, args, env)
 *       → spawn server process
 *       → initialize handshake
 *       → tools/list
 *     → register each discovered tool in MiMo's ToolRegistry
 *     → register a ToolPolicy (high risk, requiresConfirmation unless autoApprove)
 *   → invokeMcpTool(serverId, toolName, input, context)
 *     → McpJsonRpcClient.invokeTool(serverId, toolName, input)
 *     → routes through ToolPolicyEngine (via toolRegistry.invoke)
 *
 * SECURITY: MCP tools are UNTRUSTED by default. Each tool is registered
 * with risk=high + requiresConfirmation=true unless the server config
 * sets autoApprove=true. All invocations go through ToolPolicyEngine
 * (no direct tool.execute()).
 *
 * VALIDATION_REQUIRED: A real MCP server is not bundled with MiMo. To
 * exercise this in production, the user must configure an MCP server
 * (e.g. `npx -y @modelcontextprotocol/server-filesystem /path`). The
 * integration is real; the server is user-supplied.
 */

import { toolRegistry } from '../registry';
import type { Tool } from '../registry/types';
import { registerToolPolicy } from './ToolPolicyEngine';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';
import type { ContextObject } from '../types';
import {
  connectStdio,
  invokeTool as rpcInvokeTool,
  disconnect as rpcDisconnect,
  getConnectionStatus as rpcGetStatus,
  listConnections as rpcListConnections,
  type McpTool,
} from './McpJsonRpcClient';

const log = createLogger('mcp:adapter');

export interface McpServerConfig {
  id: string;
  name: string;
  url?: string;       // reserved for future HTTP transport (not implemented)
  command?: string;   // for local servers (e.g., 'npx', 'python')
  args?: string[];
  env?: Record<string, string>;
  autoApprove: boolean; // if false, tools need manual approval
}

export interface McpDiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolInvocation {
  serverId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  success: boolean;
  error?: string;
  durationMs: number;
}

interface RegisteredMcpServer {
  config: McpServerConfig;
  connected: boolean;
  tools: Map<string, McpDiscoveredTool>;
  registeredAt: number;
}

const mcpServers = new Map<string, RegisteredMcpServer>();
const approvedTools = new Set<string>(); // tool IDs that have been approved

/**
 * Register an MCP server config. Does NOT connect — call connectMcpServer().
 */
export function registerMcpServer(config: McpServerConfig): boolean {
  if (mcpServers.has(config.id)) {
    log.warn('MCP server already registered', { id: config.id });
    return false;
  }
  if (!config.command && !config.url) {
    log.error('MCP server config requires either command or url', { id: config.id });
    return false;
  }
  mcpServers.set(config.id, {
    config,
    connected: false,
    tools: new Map(),
    registeredAt: Date.now(),
  });
  mimoEvents.emit(
    createEvent('mcp.server.registered', { serverId: config.id, name: config.name }, 'mcp:adapter'),
  );
  log.info('MCP server registered', { id: config.id, name: config.name, autoApprove: config.autoApprove });
  return true;
}

/**
 * Connect to an MCP server and discover its tools via the REAL JSON-RPC protocol.
 *
 * Requires `config.command` (stdio transport). HTTP transport is not yet
 * implemented — servers with only `url` will return an error.
 */
export async function connectMcpServer(serverId: string): Promise<{ connected: boolean; toolsDiscovered: number; error?: string }> {
  const server = mcpServers.get(serverId);
  if (!server) {
    return { connected: false, toolsDiscovered: 0, error: 'server not registered' };
  }
  const { config } = server;

  if (!config.command) {
    const err = `server ${serverId} has no command (HTTP transport not implemented)`;
    log.error('MCP connect failed', { serverId, error: err });
    return { connected: false, toolsDiscovered: 0, error: err };
  }

  // Real JSON-RPC connection via stdio.
  const result = await connectStdio(
    serverId,
    config.command,
    config.args ?? [],
    config.env,
  );

  if (!result.connected || !result.tools) {
    log.warn('MCP server connection failed', { serverId, error: result.error });
    return { connected: false, toolsDiscovered: 0, error: result.error };
  }

  // Register each discovered tool in MiMo's ToolRegistry.
  const discoveredTools: McpDiscoveredTool[] = result.tools.map((t: McpTool) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  for (const dt of discoveredTools) {
    const toolId = `${serverId}_${dt.name}`;
    server.tools.set(toolId, dt);

    // Build a real Tool wrapper that delegates invocation to the MCP server.
    const rawSchema = dt.inputSchema as { type?: string; description?: string; properties?: Record<string, unknown> };
    const inputSchema: import('../types').Schema = {
      type: rawSchema.type ?? 'object',
      description: rawSchema.description ?? dt.description,
      ...(rawSchema.properties ? { properties: rawSchema.properties as Record<string, import('../types').Schema> } : {}),
    };
    const tool: Tool = {
      id: toolId,
      name: dt.name,
      description: dt.description,
      category: 'mcp',
      inputSchema,
      outputSchema: { type: 'string' },
      permissions: ['admin'],
      async execute(input: unknown, _context: ContextObject) {
        const r = await rpcInvokeTool(serverId, dt.name, input as Record<string, unknown>);
        if (!r.success) {
          throw new Error(`MCP tool ${dt.name} failed: ${r.error ?? 'unknown error'}`);
        }
        return r.output;
      },
    };
    try {
      toolRegistry.register(tool);
    } catch (err) {
      log.warn('failed to register MCP tool in registry', {
        toolId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Register a HIGH-risk policy unless autoApprove.
    registerToolPolicy({
      toolId,
      riskLevel: 'high',
      requiredPermission: 'admin',
      requiresConfirmation: !config.autoApprove,
      timeoutMs: 30_000,
      maxRetries: 1,
    });

    if (config.autoApprove) {
      approvedTools.add(toolId);
    }
  }

  server.connected = true;

  mimoEvents.emit(
    createEvent('mcp.server.connected', {
      serverId,
      toolsDiscovered: discoveredTools.length,
      autoApproved: config.autoApprove ? discoveredTools.length : 0,
    }, 'mcp:adapter'),
  );

  log.info('MCP server connected', {
    serverId,
    tools: discoveredTools.length,
    autoApproved: config.autoApprove ? discoveredTools.length : 0,
  });

  return { connected: true, toolsDiscovered: discoveredTools.length };
}

/**
 * Invoke a tool via MCP. Routes through the ToolPolicyEngine (via
 * toolRegistry.invoke) — no direct tool.execute().
 */
export async function invokeMcpTool(
  serverId: string,
  toolName: string,
  input: unknown,
  context: ContextObject,
): Promise<McpToolInvocation> {
  const startedAt = Date.now();
  const toolId = `${serverId}_${toolName}`;

  const server = mcpServers.get(serverId);
  if (!server || !server.connected) {
    return failInvocation(serverId, toolName, input, 'server not connected', startedAt);
  }

  if (!approvedTools.has(toolId)) {
    return failInvocation(serverId, toolName, input, 'tool not approved — requires manual approval', startedAt);
  }

  // Delegate to toolRegistry.invoke → ToolPolicyEngine → tool.execute (which calls rpcInvokeTool).
  try {
    const output = await toolRegistry.invoke(toolId, input, context);
    mimoEvents.emit(
      createEvent('mcp.tool.invoked', { serverId, toolName, toolId, success: true }, 'mcp:adapter'),
    );
    log.debug('MCP tool invoked', { serverId, toolName, success: true });
    return { serverId, toolName, input, output, success: true, durationMs: Date.now() - startedAt };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    mimoEvents.emit(
      createEvent('mcp.tool.invoked', { serverId, toolName, toolId, success: false, error: errorMsg }, 'mcp:adapter'),
    );
    log.warn('MCP tool invocation failed', { serverId, toolName, error: errorMsg });
    return failInvocation(serverId, toolName, input, errorMsg, startedAt);
  }
}

/**
 * Approve a discovered MCP tool for use.
 */
export function approveMcpTool(serverId: string, toolName: string): boolean {
  const toolId = `${serverId}_${toolName}`;
  const server = mcpServers.get(serverId);
  if (!server || !server.tools.has(toolId)) return false;
  approvedTools.add(toolId);
  log.info('MCP tool approved', { serverId, toolName, toolId });
  return true;
}

/**
 * Revoke approval for an MCP tool.
 */
export function revokeMcpTool(serverId: string, toolName: string): boolean {
  const toolId = `${serverId}_${toolName}`;
  return approvedTools.delete(toolId);
}

/**
 * List all MCP servers and their status (real connection state from the JSON-RPC client).
 */
export function listMcpServers(): Array<{
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  approvedTools: number;
  autoApprove: boolean;
}> {
  return Array.from(mcpServers.values()).map((s) => {
    const status = rpcGetStatus(s.config.id);
    return {
      id: s.config.id,
      name: s.config.name,
      connected: status.connected,
      toolCount: s.tools.size,
      approvedTools: Array.from(s.tools.keys()).filter((id) => approvedTools.has(id)).length,
      autoApprove: s.config.autoApprove,
    };
  });
}

/**
 * List discovered tools for a server.
 */
export function listMcpTools(serverId: string): Array<{ name: string; description: string; approved: boolean }> {
  const server = mcpServers.get(serverId);
  if (!server) return [];
  return Array.from(server.tools.entries()).map(([id, t]) => ({
    name: t.name,
    description: t.description,
    approved: approvedTools.has(id),
  }));
}

/**
 * Disconnect from an MCP server. Calls the real JSON-RPC client disconnect
 * which kills the spawned server process.
 */
export async function disconnectMcpServer(serverId: string): Promise<boolean> {
  const server = mcpServers.get(serverId);
  if (!server) return false;

  await rpcDisconnect(serverId);
  server.connected = false;
  server.tools.clear();

  for (const toolId of Array.from(approvedTools)) {
    if (toolId.startsWith(`${serverId}_`)) {
      approvedTools.delete(toolId);
    }
  }

  mimoEvents.emit(
    createEvent('mcp.server.disconnected', { serverId }, 'mcp:adapter'),
  );
  log.info('MCP server disconnected', { serverId });
  return true;
}

/**
 * List all active JSON-RPC connections (diagnostic).
 */
export function listRpcConnections() {
  return rpcListConnections();
}

// ─── Internal ───

function failInvocation(
  serverId: string,
  toolName: string,
  input: unknown,
  error: string,
  startedAt: number,
): McpToolInvocation {
  return {
    serverId,
    toolName,
    input,
    output: null,
    success: false,
    error,
    durationMs: Date.now() - startedAt,
  };
}
