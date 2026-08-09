/**
 * MiMo Core — Development API Helpers
 * ------------------------------------
 * Shared utilities for /api/dev/* routes.
 *
 * - Validates projectId format (cuid) early.
 * - Maps SandboxError → NextResponse with appropriate HTTP status.
 * - Boots the kernel once per route module.
 */

import { NextResponse } from 'next/server';
import { mimoKernel } from '@/core';
import { SandboxError } from '@/core/dev/SandboxManager';

// Boot the kernel once at module load (fire-and-forget starts the async boot).
void mimoKernel.boot();

/**
 * Await this at the top of each route handler to ensure the kernel has
 * finished booting before handling the request. Idempotent — safe to call
 * on every request.
 */
export async function ensureBooted(): Promise<void> {
  await mimoKernel.boot();
}

const CUID_RE = /^c[a-z0-9]{20,}$/i;

export function isValidProjectId(id: string): boolean {
  return typeof id === 'string' && CUID_RE.test(id);
}

/**
 * Translate a SandboxError code into the appropriate HTTP status.
 */
export function sandboxStatus(code: string): number {
  switch (code) {
    case 'PROJECT_NOT_FOUND':
      return 404;
    case 'FORBIDDEN_PATH':
    case 'PATH_TRAVERSAL':
      return 403;
    case 'PATH_TOO_DEEP':
    case 'FILE_TOO_LARGE':
    case 'PROJECT_TOO_LARGE':
    case 'FILE_COUNT_EXCEEDED':
      return 413;
    case 'PROFILE_VIOLATION':
      return 403;
    case 'INTERNAL':
      return 500;
    default:
      return 400;
  }
}

export function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export function handleSandboxError(err: unknown) {
  if (err instanceof SandboxError) {
    return jsonError(err.message, sandboxStatus(err.code), err.code);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return jsonError(msg, 500, 'INTERNAL');
}

/**
 * Validate projectId from URL params. Returns a NextResponse (error) on
 * invalid format, or null on success.
 */
export function requireValidProjectId(id: string): NextResponse | null {
  if (!isValidProjectId(id)) {
    return jsonError('invalid project id format', 404, 'PROJECT_NOT_FOUND');
  }
  return null;
}
