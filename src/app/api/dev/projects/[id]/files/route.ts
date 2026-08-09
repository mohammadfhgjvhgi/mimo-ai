/**
 * MiMo OS — Dev Project Files
 * ------------------------------
 * GET  /api/dev/projects/:id/files?path=src/    list file tree
 * POST /api/dev/projects/:id/files               create file or dir
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listFiles,
  writeFile,
  createDirectory,
  searchFiles,
} from '@/core/dev';
import type { SandboxProfile } from '@/core/dev';
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
    const dirPath = req.nextUrl.searchParams.get('path') ?? '';
    const query = req.nextUrl.searchParams.get('q') ?? '';
    const profile = resolveProfile(req.nextUrl.searchParams.get('profile'));

    if (query) {
      const results = await searchFiles(id, query, profile);
      return NextResponse.json({ files: results });
    }
    const tree = await listFiles(id, dirPath, profile);
    return NextResponse.json({ path: dirPath, tree });
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
    const p = typeof body.path === 'string' ? body.path : '';
    if (!p) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }
    const profile = resolveProfile(body.profile);
    const isDirectory = body.isDirectory === true;

    if (isDirectory) {
      const record = await createDirectory(id, p, profile);
      return NextResponse.json({ file: record }, { status: 201 });
    }
    const content = typeof body.content === 'string' ? body.content : '';
    const record = await writeFile(id, p, content, profile);
    return NextResponse.json({ file: record }, { status: 201 });
  } catch (err) {
    return handleSandboxError(err);
  }
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
