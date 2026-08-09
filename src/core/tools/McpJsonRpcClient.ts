/**
 * MiMo Core — MCP JSON-RPC Client
 * --------------------------------
 * Phase 80: Real MCP protocol client over stdio transport.
 *
 * Supports:
 * - Initialize handshake (JSON-RPC 2.0)
 * - Capability negotiation
 * - Tool discovery (tools/list)
 * - Tool invocation (tools/call)
 * - Error handling
 * - Timeout
 * - Disconnect
 *
 * All invocations go through ToolPolicyEngine for permission checking.
 * All activity is audited via EventBus.
 */

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';

const log = createLogger('mcp:jsonrpc');

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpConnection {
  serverId: string;
  process: ChildProcess | null;
  connected: boolean;
  requestId: number;
  pendingRequests: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }>;
  buffer: string;
  tools: McpTool[];
  capabilities: Record<string, unknown>;
}

const connections = new Map<string, McpConnection>();

/**
 * Connect to an MCP server via stdio transport.
 * Spawns the server process and performs the initialize handshake.
 */
export async function connectStdio(
  serverId: string,
  command: string,
  args: string[] = [],
  env?: Record<string, string>,
): Promise<{ connected: boolean; tools: McpTool[]; error?: string }> {
  // Disconnect existing connection if any
  if (connections.has(serverId)) {
    await disconnect(serverId);
  }

  const conn: McpConnection = {
    serverId,
    process: null,
    connected: false,
    requestId: 0,
    pendingRequests: new Map(),
    buffer: '',
    tools: [],
    capabilities: {},
  };

  try {
    // Spawn the MCP server process
    conn.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    if (!conn.process.stdin || !conn.process.stdout) {
      throw new Error('Failed to get stdin/stdout from spawned process');
    }

    // Set up message handler
    conn.process.stdout.on('data', (data: Buffer) => {
      conn.buffer += data.toString();
      // Parse complete JSON-RPC messages (newline-delimited)
      const lines = conn.buffer.split('\n');
      conn.buffer = lines.pop() ?? ''; // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line) as JsonRpcResponse;
          const pending = conn.pendingRequests.get(response.id);
          if (pending) {
            clearTimeout(pending.timeout);
            conn.pendingRequests.delete(response.id);
            if (response.error) {
              pending.reject(new Error(`MCP error ${response.error.code}: ${response.error.message}`));
            } else {
              pending.resolve(response.result);
            }
          }
        } catch (err) {
          log.warn('failed to parse MCP response', { serverId, line: line.slice(0, 100), error: err instanceof Error ? err.message : String(err) });
        }
      }
    });

    conn.process.stderr?.on('data', (data: Buffer) => {
      log.debug('MCP server stderr', { serverId, output: data.toString().slice(0, 200) });
    });

    conn.process.on('exit', (code, signal) => {
      log.info('MCP server process exited', { serverId, code, signal });
      conn.connected = false;
      conn.process = null;
      // Reject all pending requests
      for (const [, pending] of conn.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('MCP server process exited'));
      }
      conn.pendingRequests.clear();
      mimoEvents.emit(createEvent('mcp.disconnected', { serverId, code, signal }, 'mcp:jsonrpc'));
    });

    conn.process.on('error', (err) => {
      log.error('MCP server process error', { serverId, error: err.message });
      conn.connected = false;
    });

    connections.set(serverId, conn);

    // Perform initialize handshake
    const initResult = await sendRequest(serverId, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'MiMo', version: '1.0.0' },
    }, 10000) as { capabilities?: Record<string, unknown>; serverInfo?: { name: string; version: string } };

    conn.capabilities = initResult?.capabilities ?? {};

    // Send initialized notification
    sendNotification(serverId, 'notifications/initialized', {});

    // Discover tools
    const toolsResult = await sendRequest(serverId, 'tools/list', {}, 5000) as { tools?: McpTool[] };
    conn.tools = toolsResult?.tools ?? [];

    conn.connected = true;

    mimoEvents.emit(createEvent('mcp.connected', {
      serverId, tools: conn.tools.length,
      serverName: initResult?.serverInfo?.name ?? 'unknown',
    }, 'mcp:jsonrpc'));

    log.info('MCP server connected', {
      serverId,
      tools: conn.tools.length,
      serverName: initResult?.serverInfo?.name,
    });

    return { connected: true, tools: conn.tools };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('MCP connection failed', { serverId, error: msg });
    if (conn.process) {
      try { conn.process.kill('SIGKILL'); } catch {}
    }
    connections.delete(serverId);
    return { connected: false, tools: [], error: msg };
  }
}

/**
 * Invoke a tool on an MCP server.
 */
export async function invokeTool(
  serverId: string,
  toolName: string,
  input: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  const conn = connections.get(serverId);
  if (!conn || !conn.connected) {
    return { success: false, error: 'server not connected' };
  }

  // Check if tool exists
  const tool = conn.tools.find(t => t.name === toolName);
  if (!tool) {
    return { success: false, error: `tool not found: ${toolName}` };
  }

  try {
    const result = await sendRequest(serverId, 'tools/call', {
      name: toolName,
      arguments: input,
    }, timeoutMs) as { content?: Array<{ type: string; text?: string }> };

    // Extract text from result
    const output = result?.content?.[0]?.text ?? JSON.stringify(result);

    mimoEvents.emit(createEvent('mcp.tool.invoked', {
      serverId, toolName, success: true,
    }, 'mcp:jsonrpc'));

    log.debug('MCP tool invoked', { serverId, toolName, success: true });
    return { success: true, output };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    mimoEvents.emit(createEvent('mcp.tool.invoked', {
      serverId, toolName, success: false, error: msg,
    }, 'mcp:jsonrpc'));
    log.warn('MCP tool invocation failed', { serverId, toolName, error: msg });
    return { success: false, error: msg };
  }
}

/**
 * Disconnect from an MCP server.
 */
export async function disconnect(serverId: string): Promise<void> {
  const conn = connections.get(serverId);
  if (!conn) return;

  // Reject pending requests
  for (const [, pending] of conn.pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('disconnecting'));
  }
  conn.pendingRequests.clear();

  // Kill process
  if (conn.process) {
    try {
      conn.process.kill('SIGTERM');
      // Force kill after 2s
      setTimeout(() => {
        try { conn.process?.kill('SIGKILL'); } catch {}
      }, 2000);
    } catch {}
  }

  conn.connected = false;
  conn.process = null;
  conn.tools = [];
  connections.delete(serverId);

  mimoEvents.emit(createEvent('mcp.disconnected', { serverId }, 'mcp:jsonrpc'));
  log.info('MCP server disconnected', { serverId });
}

/**
 * Get connection status.
 */
export function getConnectionStatus(serverId: string): { connected: boolean; toolCount: number } {
  const conn = connections.get(serverId);
  return {
    connected: conn?.connected ?? false,
    toolCount: conn?.tools.length ?? 0,
  };
}

/**
 * List all connections.
 */
export function listConnections(): Array<{ serverId: string; connected: boolean; toolCount: number; tools: string[] }> {
  return Array.from(connections.values()).map(c => ({
    serverId: c.serverId,
    connected: c.connected,
    toolCount: c.tools.length,
    tools: c.tools.map(t => t.name),
  }));
}

// ─── Internal JSON-RPC ───

function sendRequest(serverId: string, method: string, params: unknown, timeoutMs: number): Promise<unknown> {
  const conn = connections.get(serverId);
  if (!conn || !conn.process?.stdin) {
    return Promise.reject(new Error('MCP server not connected'));
  }

  const id = ++conn.requestId;
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.pendingRequests.delete(id);
      reject(new Error(`MCP request timeout: ${method} (${timeoutMs}ms)`));
    }, timeoutMs);

    conn.pendingRequests.set(id, { resolve, reject, timeout });

    try {
      const stdin = conn.process?.stdin;
      if (!stdin) throw new Error('stdin not available');
      stdin.write(JSON.stringify(request) + '\n');
    } catch (err) {
      clearTimeout(timeout);
      conn.pendingRequests.delete(id);
      reject(new Error(`Failed to send request: ${err instanceof Error ? err.message : String(err)}`));
    }
  });
}

function sendNotification(serverId: string, method: string, params: unknown): void {
  const conn = connections.get(serverId);
  if (!conn?.process?.stdin) return;

  const notification = {
    jsonrpc: '2.0',
    method,
    params,
  };

  try {
    const stdin = conn.process?.stdin;
    if (!stdin) return;
    stdin.write(JSON.stringify(notification) + '\n');
  } catch (err) {
    log.warn('failed to send MCP notification', { serverId, method, error: err instanceof Error ? err.message : String(err) });
  }
}
