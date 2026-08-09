/**
 * MiMo OS — Dev Projects API
 * ----------------------------
 * GET  /api/dev/projects            list projects (optional ?archived=true)
 * POST /api/dev/projects            create a project
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createProject,
  listProjects,
} from '@/core/dev';
import type { SandboxProfile } from '@/core/dev';
import { handleSandboxError } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILES: SandboxProfile[] = ['safe', 'standard', 'development', 'networked', 'restricted'];
const TYPES = ['nextjs', 'node', 'python', 'static', 'generic'] as const;
const RUNTIMES = ['node', 'bun', 'python', 'static'] as const;
const PACKAGE_MANAGERS = ['npm', 'yarn', 'pnpm', 'bun', 'pip'] as const;

export async function GET(req: NextRequest) {
  try {
    const archived = req.nextUrl.searchParams.get('archived') === 'true';
    const projects = await listProjects(archived);
    return NextResponse.json({ projects });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'name too long (max 100 chars)' }, { status: 400 });
    }

    const profile: SandboxProfile = PROFILES.includes(body.profile) ? body.profile : 'standard';
    const type = TYPES.includes(body.type) ? body.type : 'generic';
    const runtime = RUNTIMES.includes(body.runtime) ? body.runtime : 'node';
    const packageManager = PACKAGE_MANAGERS.includes(body.packageManager) ? body.packageManager : 'npm';

    const project = await createProject({
      name,
      description: typeof body.description === 'string' ? body.description : undefined,
      type,
      profile,
      runtime,
      packageManager,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return handleSandboxError(err);
  }
}
