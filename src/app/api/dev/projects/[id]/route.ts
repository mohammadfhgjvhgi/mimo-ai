/**
 * MiMo OS — Dev Project by ID
 * -----------------------------
 * GET    /api/dev/projects/:id
 * PATCH  /api/dev/projects/:id
 * DELETE /api/dev/projects/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,
  type DevProjectType,
  type DevRuntime,
  type DevPackageManager,
  type SandboxProfile,
} from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: DevProjectType[] = ['nextjs', 'node', 'python', 'static', 'generic'];
const RUNTIMES: DevRuntime[] = ['node', 'bun', 'python', 'static'];
const PACKAGE_MANAGERS: DevPackageManager[] = ['npm', 'yarn', 'pnpm', 'bun', 'pip'];
const PROFILES: SandboxProfile[] = ['safe', 'standard', 'development', 'networked', 'restricted'];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'project not found', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ project });
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
    const updates: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      if (body.name.trim().length === 0) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      updates.name = body.name.trim().slice(0, 100);
    }
    if (typeof body.description === 'string') updates.description = body.description;
    if (typeof body.type === 'string' && TYPES.includes(body.type)) updates.type = body.type;
    if (typeof body.runtime === 'string' && RUNTIMES.includes(body.runtime)) updates.runtime = body.runtime;
    if (typeof body.packageManager === 'string' && PACKAGE_MANAGERS.includes(body.packageManager)) {
      updates.packageManager = body.packageManager;
    }
    if (typeof body.profile === 'string' && PROFILES.includes(body.profile)) updates.profile = body.profile;
    if (typeof body.previewPort === 'number') {
      if (body.previewPort < 1 || body.previewPort > 65535) {
        return NextResponse.json({ error: 'invalid previewPort' }, { status: 400 });
      }
      updates.previewPort = body.previewPort;
    }
    if (body.archive === true) {
      await archiveProject(id);
      return NextResponse.json({ archived: true });
    }
    if (body.archive === false) {
      await unarchiveProject(id);
      return NextResponse.json({ archived: false });
    }

    const project = await updateProject(id, updates);
    if (!project) {
      return NextResponse.json({ error: 'project not found', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteParams) {
  const { id } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    await deleteProject(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleSandboxError(err);
  }
}
