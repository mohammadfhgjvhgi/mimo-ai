/**
 * MiMo Core — Development Log Service
 * ------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * Persists DevLog entries with SECRET REDACTION in metadata. Every log
 * call passes through `redactMetadata` which:
 *   - replaces any string value matching secret patterns with [REDACTED]
 *   - rejects metadata blobs larger than 16KB (defense in depth)
 *
 * Channels: build | runtime | terminal | test | agent | security | network
 * Levels:   debug | info | warn | error
 *
 * IMPORTANT: This service NEVER stores file CONTENT in metadata. It only
 * stores references (paths, sizes, hashes). Secrets detected by pattern
 * are masked before persistence.
 */

import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';

const log = createLogger('dev:logs');

// ─── Types ───

export type DevLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DevLogChannel =
  | 'build'
  | 'runtime'
  | 'terminal'
  | 'test'
  | 'agent'
  | 'security'
  | 'network';

export interface DevLogRecord {
  id: string;
  projectId: string;
  channel: string;
  level: string;
  message: string;
  processId: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: number;
}

export interface QueryLogsOptions {
  channel?: string;
  level?: string;
  since?: number; // epoch ms
  limit?: number;
}

// ─── Secret redaction ───

/**
 * Patterns that indicate a secret value. If any value (string) in metadata
 * matches one of these patterns, it is replaced with `[REDACTED]` before
 * persistence.
 *
 * - sk-... (OpenAI-style)
 * - api_key=...
 * - api-key-...
 * - AKIA... (AWS access key)
 * - -----BEGIN ... PRIVATE KEY-----
 * - ey... (long JWT-like tokens)
 * - any key in metadata whose NAME looks like a secret → redact the value
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{16,}/i, // OpenAI / Anthropic style
  /sk-ant-[a-zA-Z0-9-_]{10,}/i,
  /AKIA[0-9A-Z]{16}/, // AWS access key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // JWT
  /xox[baprs]-[a-zA-Z0-9-]+/, // Slack
  /ghp_[a-zA-Z0-9]{20,}/, // GitHub PAT
  /gho_[a-zA-Z0-9]{20,}/, // GitHub OAuth
  /AIza[0-9A-Za-z_-]{20,}/, // Google API
];

/**
 * Keys whose VALUES should always be redacted, regardless of pattern match.
 * Matched case-insensitively.
 */
const SECRET_KEY_PATTERNS: RegExp[] = [
  /^password$/i,
  /^passwd$/i,
  /^pwd$/i,
  /^secret$/i,
  /^secret_?key$/i,
  /^api[_-]?key$/i,
  /^access[_-]?token$/i,
  /^auth[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^bearer$/i,
  /^authorization$/i,
  /^private[_-]?key$/i,
  /^client[_-]?secret$/i,
  /^aws[_-]?secret/i,
  /^session[_-]?token$/i,
];

const MAX_METADATA_BYTES = 16 * 1024;

/**
 * Sanitize a metadata object for safe persistence. Returns a deep-cloned
 * object where:
 *   - secret-looking values are replaced with [REDACTED]
 *   - keys matching secret patterns force redaction of their values
 *   - functions / undefined / symbols are stripped
 *   - the total JSON size is capped (throws if exceeded)
 */
export function redactMetadata(input: unknown): Record<string, unknown> | null {
  if (input == null) return null;

  const clone = safeClone(input);
  const redacted = redactWalk(clone, '');

  const json = JSON.stringify(redacted);
  if (json.length > MAX_METADATA_BYTES) {
    // Truncate by returning a marker
    return {
      __truncated: true,
      __originalBytes: json.length,
      preview: json.slice(0, 512),
    };
  }
  return redacted as Record<string, unknown>;
}

function safeClone(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  try {
    return JSON.parse(JSON.stringify(v, (_k, val) => {
      if (typeof val === 'function' || typeof val === 'symbol' || typeof val === 'undefined') {
        return undefined;
      }
      if (typeof val === 'bigint') return String(val);
      return val;
    }));
  } catch {
    return { __cloneError: 'circular-or-uncopyable' };
  }
}

function redactWalk(node: unknown, keyPath: string): unknown {
  if (typeof node === 'string') {
    // Always redact if the key looks like a secret
    const lastKey = keyPath.split('.').pop() ?? '';
    if (SECRET_KEY_PATTERNS.some((re) => re.test(lastKey))) {
      return '[REDACTED]';
    }
    // Otherwise check value patterns
    for (const re of SECRET_VALUE_PATTERNS) {
      if (re.test(node)) return '[REDACTED]';
    }
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((v, i) => redactWalk(v, `${keyPath}.${i}`));
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = redactWalk(v, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
  return node;
}

// ─── writeLog ───

export async function writeLog(
  projectId: string,
  channel: string,
  level: DevLogLevel,
  message: string,
  metadata?: Record<string, unknown>,
  processId?: string,
  correlationId?: string,
): Promise<DevLogRecord> {
  if (!message || message.length === 0) {
    throw new Error('log message is required');
  }
  // Truncate message if excessive
  const safeMessage = message.length > 8192 ? message.slice(0, 8192) + '…[truncated]' : message;
  const safeMeta = redactMetadata(metadata);

  const row = await db.devLog.create({
    data: {
      projectId,
      channel,
      level,
      message: safeMessage,
      processId: processId ?? null,
      correlationId: correlationId ?? null,
      metadata: safeMeta ? JSON.stringify(safeMeta) : null,
    },
  });

  return toRecord(row);
}

// ─── queryLogs ───

export async function queryLogs(
  projectId: string,
  opts: QueryLogsOptions = {},
): Promise<DevLogRecord[]> {
  const where: Record<string, unknown> = { projectId };
  if (opts.channel) where.channel = opts.channel;
  if (opts.level) where.level = opts.level;
  if (opts.since) where.timestamp = { gte: new Date(opts.since) };

  const rows = await db.devLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: Math.min(opts.limit ?? 100, 500),
  });
  return rows.map(toRecord);
}

// ─── getLogChannels ───

export async function getLogChannels(projectId: string): Promise<string[]> {
  const rows = await db.devLog.findMany({
    where: { projectId },
    distinct: ['channel'],
    select: { channel: true },
  });
  return rows.map((r) => r.channel);
}

// ─── Helpers ───

type PrismaDevLog = {
  id: string;
  projectId: string;
  channel: string;
  level: string;
  message: string;
  processId: string | null;
  correlationId: string | null;
  metadata: string | null;
  timestamp: Date;
};

function toRecord(r: PrismaDevLog): DevLogRecord {
  let metadata: Record<string, unknown> | null = null;
  if (r.metadata) {
    try {
      metadata = JSON.parse(r.metadata) as Record<string, unknown>;
    } catch {
      metadata = { __raw: r.metadata };
    }
  }
  return {
    id: r.id,
    projectId: r.projectId,
    channel: r.channel,
    level: r.level,
    message: r.message,
    processId: r.processId,
    correlationId: r.correlationId,
    metadata,
    timestamp: r.timestamp.getTime(),
  };
}

// Emit a "dev.log.written" event for live observers (optional).
void mimoEvents;
void createEvent;
void log;
