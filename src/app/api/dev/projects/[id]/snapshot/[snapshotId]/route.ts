/**
 * MiMo OS — Dev Project Snapshot Actions
 * ---------------------------------------
 * POST   /api/dev/projects/:id/snapshot/:snapshotId   restore
 * DELETE /api/dev/projects/:id/snapshot/:snapshotId   delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { restoreSnapshot, deleteSnapshot, type SandboxProfile } from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILES: SandboxProfile[] = ['safe', 'standard', 'development', 'networked', 'restricted'];

interface RouteParams {
  params: Promise<{ id: string; snapshotId: string }>;
}

export async function POST(req: NextRequest, ctx: RouteParams) {
  const { id, snapshotId } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const body = await req.json().catch(() => ({}));
    const profile = resolveProfile(body.profile);
    await restoreSnapshot(id, snapshotId, profile);
    return NextResponse.json({ restored: true, snapshotId });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteParams) {
  const { id, snapshotId } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    await deleteSnapshot(id, snapshotId);
    return NextResponse.json({ deleted: true, snapshotId });
  } catch (err) {
    return handleSandboxError(err);
  }
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
