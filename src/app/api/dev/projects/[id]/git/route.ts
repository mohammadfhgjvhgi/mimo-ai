/**
 * MiMo OS — Dev Project Git API
 * -------------------------------
 * GET  /api/dev/projects/:id/git   get status (default)
 * POST /api/dev/projects/:id/git   action: 'commit' | 'diff' | 'branches' | 'history' | 'status'
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getStatus,
  getDiff,
  getBranches,
  commit,
  getHistory,
  type SandboxProfile,
} from '@/core/dev';
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
    const status = await getStatus(id, profile);
    return NextResponse.json({ status });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function POST(req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const body = await req.json().catch(() => ({}));
    const profile = resolveProfile(body.profile);
    const action = typeof body.action === 'string' ? body.action : 'status';

    switch (action) {
      case 'status': {
        const status = await getStatus(id, profile);
        return NextResponse.json({ status });
      }
      case 'branches': {
        const branches = await getBranches(id, profile);
        return NextResponse.json({ branches });
      }
      case 'diff': {
        const diff = await getDiff(id, profile, typeof body.path === 'string' ? body.path : undefined, body.staged === true);
        return NextResponse.json({ diff });
      }
      case 'history': {
        const limit = typeof body.limit === 'number' ? body.limit : 20;
        const history = await getHistory(id, profile, limit);
        return NextResponse.json({ history });
      }
      case 'commit': {
        const message = typeof body.message === 'string' ? body.message : '';
        if (!message.trim()) {
          return NextResponse.json({ error: 'message is required for commit' }, { status: 400 });
        }
        const result = await commit(id, message, profile);
        return NextResponse.json({ commit: result }, { status: 201 });
      }
      default:
        return NextResponse.json({ error: `unknown git action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return handleSandboxError(err);
  }
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
