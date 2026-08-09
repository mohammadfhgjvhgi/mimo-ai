/**
 * MiMo OS — Dev Project Resources API
 * -------------------------------------
 * GET /api/dev/projects/:id/resources   real metrics (disk, process count,
 *                                        cpu/memory if available, uptime)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetrics, getProcessList, type SandboxProfile } from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILES: SandboxProfile[] = ['safe', 'standard', 'development', 'networked', 'restricted'];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const profile = resolveProfile(req.nextUrl.searchParams.get('profile'));
    const metrics = await getMetrics(id, profile);
    const processes = await getProcessList(id);
    return NextResponse.json({ metrics, processes });
  } catch (err) {
    return handleSandboxError(err);
  }
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
