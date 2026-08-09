/**
 * MiMo OS — Dev Project Build API
 * ---------------------------------
 * POST /api/dev/projects/:id/build   trigger a build, returns DevBuild
 * GET  /api/dev/projects/:id/build    list recent builds
 */

import { NextRequest, NextResponse } from 'next/server';
import { runBuild, listBuilds, type SandboxProfile } from '@/core/dev';
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
    const profile = resolveProfile(body.profile);
    const build = await runBuild(id, profile);
    return NextResponse.json({ build }, { status: 201 });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function GET(req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const limitStr = req.nextUrl.searchParams.get('limit');
    const limit = limitStr ? Math.max(1, Math.min(parseInt(limitStr, 10) || 20, 100)) : 20;
    const builds = await listBuilds(id, limit);
    return NextResponse.json({ builds });
  } catch (err) {
    return handleSandboxError(err);
  }
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
