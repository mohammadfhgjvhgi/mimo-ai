/**
 * MiMo OS — Dev Project File by Path
 * ------------------------------------
 * GET    /api/dev/projects/:id/files/<path...>     read file content
 * PUT    /api/dev/projects/:id/files/<path...>     update file content
 * DELETE /api/dev/projects/:id/files/<path...>     delete file or directory
 *
 * `<path...>` is a catch-all (Next.js [...path]).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  readFile,
  writeFile,
  deleteFile,
  moveFile,
  type SandboxProfile,
} from '@/core/dev';
import { handleSandboxError, requireValidProjectId } from '../../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILES: SandboxProfile[] = ['safe', 'standard', 'development', 'networked', 'restricted'];

interface RouteParams {
  params: Promise<{ id: string; path: string[] }>;
}

export async function GET(req: NextRequest, ctx: RouteParams) {
  const { id, path: pathParts } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const relativePath = decodePath(pathParts);
    const profile = resolveProfile(req.nextUrl.searchParams.get('profile'));
    const file = await readFile(id, relativePath, profile);
    return NextResponse.json({ path: relativePath, ...file });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function PUT(req: NextRequest, ctx: RouteParams) {
  const { id, path: pathParts } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const relativePath = decodePath(pathParts);
    const body = await req.json().catch(() => ({}));
    if (typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }
    const profile = resolveProfile(body.profile);

    if (typeof body.moveTo === 'string' && body.moveTo.length > 0) {
      const record = await moveFile(id, relativePath, body.moveTo, profile);
      return NextResponse.json({ file: record });
    }

    const record = await writeFile(id, relativePath, body.content, profile);
    return NextResponse.json({ file: record });
  } catch (err) {
    return handleSandboxError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteParams) {
  const { id, path: pathParts } = await ctx.params;
  const invalid = requireValidProjectId(id);
  if (invalid) return invalid;
  try {
    const relativePath = decodePath(pathParts);
    const profile = resolveProfile(req.nextUrl.searchParams.get('profile'));
    await deleteFile(id, relativePath, profile);
    return NextResponse.json({ deleted: true, path: relativePath });
  } catch (err) {
    return handleSandboxError(err);
  }
}

function decodePath(parts: string[]): string {
  return (parts ?? []).map((p) => decodeURIComponent(p)).join('/');
}

function resolveProfile(input: unknown): SandboxProfile {
  return typeof input === 'string' && PROFILES.includes(input as SandboxProfile)
    ? (input as SandboxProfile)
    : 'standard';
}
