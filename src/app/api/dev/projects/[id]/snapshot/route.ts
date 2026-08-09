/**
 * MiMo OS — Dev Project Snapshots API
 * -------------------------------------
 * GET  /api/dev/projects/:id/snapshot          list snapshots
 * POST /api/dev/projects/:id/snapshot          create: { label, description? }
 *
 * Sub-routes (separate file): snapshot/[snapshotId]/route.ts
 *   POST   /api/dev/projects/:id/snapshot/:sid   restore
 *   DELETE /api/dev/projects/:id/snapshot/:sid   delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSnapshot, listSnapshots, type SandboxProfile } from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILES: SandboxProfile[] = ['safe', 'standard', 'development', 'networked', 'restricted'];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const snapshots = await listSnapshots(id);
    return NextResponse.json({ snapshots });
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
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }
    const description = typeof body.description === 'string' ? body.description : undefined;
    const profile = resolveProfile(body.profile);
    const snapshot = await createSnapshot(id, label, description, profile);
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (err) {
    return handleSandboxError(err);
  }
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
