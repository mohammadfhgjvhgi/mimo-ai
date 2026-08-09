/**
 * MiMo OS — Dev Project Permissions API
 * ---------------------------------------
 * GET   /api/dev/projects/:id/permissions     list permissions
 * PATCH /api/dev/projects/:id/permissions     update a permission
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPermission, setPermission } from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const rows = await db.devPermission.findMany({
      where: { projectId: id },
      orderBy: { permission: 'asc' },
    });
    return NextResponse.json({
      permissions: rows.map((r) => ({
        permission: r.permission,
        status: r.status,
        grantedBy: r.grantedBy,
        updatedAt: r.updatedAt.getTime(),
      })),
    });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const body = await req.json().catch(() => ({}));
    const permission = typeof body.permission === 'string' ? body.permission : '';
    const status = typeof body.status === 'string' ? body.status : '';
    if (!permission) {
      return NextResponse.json({ error: 'permission is required' }, { status: 400 });
    }
    if (!['allow', 'deny', 'ask'].includes(status)) {
      return NextResponse.json({ error: 'status must be allow, deny, or ask' }, { status: 400 });
    }
    // Refuse to grant mimo.api (setPermission enforces this too)
    try {
      await setPermission(id, permission, status as 'allow' | 'deny' | 'ask');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const updated = await getPermission(id, permission);
    return NextResponse.json({ permission, status: updated });
  } catch (err) {
    return handleSandboxError(err);
  }
}
