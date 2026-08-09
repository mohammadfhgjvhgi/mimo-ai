/**
 * MiMo OS — Dev Project Terminal API
 * ------------------------------------
 * POST /api/dev/projects/:id/terminal   execute command: { command, timeoutMs? }
 * GET  /api/dev/projects/:id/terminal    list tracked processes
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeCommand, listProcesses, type SandboxProfile } from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILES: SandboxProfile[] = ['safe', 'standard', 'development', 'networked', 'restricted'];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const body = await req.json().catch(() => ({}));
    const command = typeof body.command === 'string' ? body.command : '';
    if (!command || command.trim().length === 0) {
      return NextResponse.json({ error: 'command is required' }, { status: 400 });
    }
    if (command.length > 10_000) {
      return NextResponse.json({ error: 'command too long (max 10000 chars)' }, { status: 400 });
    }
    const profile = resolveProfile(body.profile);
    let timeoutMs: number | undefined;
    if (typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs)) {
      timeoutMs = Math.max(1000, Math.min(Math.floor(body.timeoutMs), 300_000));
    }
    const result = await executeCommand(id, command, profile, timeoutMs);
    return NextResponse.json({ result });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function GET(_req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const processes = await listProcesses(id);
    return NextResponse.json({ processes });
  } catch (err) {
    return handleSandboxError(err);
  }
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
