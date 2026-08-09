/**
 * MiMo Core — Development File Explorer Service
 * -----------------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * All file operations within a DevProject sandbox MUST go through this
 * service. It validates every path via SandboxManager (path traversal
 * defense, forbidden-path checks, resource limits) and mirrors file
 * state into the DevFile table for fast querying / change detection.
 *
 * INVARIANTS:
 *   - NEVER touches the host filesystem outside resolveSafePath.
 *   - NEVER stores file content in the DB (only metadata + hash).
 *   - NEVER returns secret values (.env contents etc.) — those paths
 *     are blocked by SandboxManager before reaching read.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';
import {
  resolveSafePath,
  validateWrite,
  getProjectRoot,
  SandboxError,
  type SandboxProfile,
} from './SandboxManager';

const log = createLogger('dev:files');

// ─── Types ───

export interface DevFileRecord {
  id: string;
  projectId: string;
  path: string; // relative to project root
  name: string;
  isDirectory: boolean;
  size: number;
  mimeType: string | null;
  hash: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DevFileNode extends DevFileRecord {
  children?: DevFileNode[];
}

export interface DevFileContent {
  content: string;
  size: number;
  mimeType: string;
  hash: string;
}

// ─── MIME type detection ───

const MIME_MAP: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/tsx',
  '.js': 'text/javascript',
  '.jsx': 'text/jsx',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.mdx': 'text/mdx',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.kt': 'text/x-kotlin',
  '.swift': 'text/x-swift',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.scss': 'text/x-scss',
  '.sass': 'text/x-sass',
  '.less': 'text/x-less',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/x-toml',
  '.ini': 'text/x-ini',
  '.txt': 'text/plain',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.zsh': 'text/x-shellscript',
  '.sql': 'application/sql',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.env': 'text/plain',
  '.gitignore': 'text/plain',
  '.lock': 'text/plain',
};

export function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

// ─── Hash ───

export function computeHash(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ─── Helpers ───

type PrismaDevFile = {
  id: string;
  projectId: string;
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  mimeType: string | null;
  hash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(r: PrismaDevFile): DevFileRecord {
  return {
    id: r.id,
    projectId: r.projectId,
    path: r.path,
    name: r.name,
    isDirectory: r.isDirectory,
    size: r.size,
    mimeType: r.mimeType,
    hash: r.hash,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  };
}

function normalizeRelative(p: string): string {
  // Strip leading slashes + normalize separators
  let rel = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel === '.') rel = '';
  return rel;
}

// ─── listFiles ───

export async function listFiles(
  projectId: string,
  dirPath = '',
  profile: SandboxProfile = 'standard',
): Promise<DevFileNode[]> {
  const rel = normalizeRelative(dirPath);
  const absDir = await resolveSafePath(projectId, rel, profile);

  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const nodes: DevFileNode[] = [];
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const childAbs = path.join(absDir, entry.name);
    const stat = await fs.stat(childAbs).catch(() => null);
    if (!stat) continue;
    const isDir = entry.isDirectory();
    const record = await upsertDbFile(projectId, childRel, isDir, stat.size);
    const node: DevFileNode = {
      ...record,
      children: isDir ? await listFiles(projectId, childRel, profile) : undefined,
    };
    nodes.push(node);
  }
  // Sort: directories first, then alphabetical
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

// ─── readFile ───

export async function readFile(
  projectId: string,
  relativePath: string,
  profile: SandboxProfile = 'standard',
): Promise<DevFileContent> {
  const rel = normalizeRelative(relativePath);
  const abs = await resolveSafePath(projectId, rel, profile);

  let stat: import('fs').Stats;
  try {
    stat = await fs.stat(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SandboxError(`file not found: ${rel}`, 'PROJECT_NOT_FOUND', { relativePath: rel });
    }
    throw err;
  }
  if (stat.isDirectory()) {
    throw new SandboxError(`cannot read directory as file: ${rel}`, 'FORBIDDEN_PATH', { relativePath: rel });
  }

  const buf = await fs.readFile(abs);
  const content = buf.toString('utf8');
  return {
    content,
    size: buf.length,
    mimeType: getMimeType(rel),
    hash: computeHash(buf),
  };
}

// ─── writeFile ───

export async function writeFile(
  projectId: string,
  relativePath: string,
  content: string,
  profile: SandboxProfile = 'standard',
): Promise<DevFileRecord> {
  const rel = normalizeRelative(relativePath);
  if (!rel) {
    throw new SandboxError('cannot write to project root', 'FORBIDDEN_PATH', { relativePath });
  }
  const buf = Buffer.from(content, 'utf8');
  await validateWrite(projectId, rel, buf.length, profile);
  const abs = await resolveSafePath(projectId, rel, profile);

  // Ensure parent directory exists (within sandbox — createDirectory validated)
  const parent = path.dirname(abs);
  await fs.mkdir(parent, { recursive: true });

  await fs.writeFile(abs, buf, 'utf8');
  const stat = await fs.stat(abs);
  const hash = computeHash(buf);

  const record = await upsertDbFile(projectId, rel, false, stat.size, hash);

  mimoEvents.emit(
    createEvent('dev.file.written' as never, { projectId, path: rel, size: stat.size }, 'dev:files'),
  );
  log.debug('file written', { projectId, path: rel, size: stat.size });
  return record;
}

// ─── createDirectory ───

export async function createDirectory(
  projectId: string,
  relativePath: string,
  profile: SandboxProfile = 'standard',
): Promise<DevFileRecord> {
  const rel = normalizeRelative(relativePath);
  if (!rel) {
    throw new SandboxError('cannot create project root', 'FORBIDDEN_PATH', { relativePath });
  }
  const abs = await resolveSafePath(projectId, rel, profile);
  await fs.mkdir(abs, { recursive: true });
  const stat = await fs.stat(abs);
  const record = await upsertDbFile(projectId, rel, true, stat.size ?? 0);

  mimoEvents.emit(
    createEvent('dev.directory.created' as never, { projectId, path: rel }, 'dev:files'),
  );
  log.debug('directory created', { projectId, path: rel });
  return record;
}

// ─── moveFile ───

export async function moveFile(
  projectId: string,
  oldPath: string,
  newPath: string,
  profile: SandboxProfile = 'standard',
): Promise<DevFileRecord> {
  const oldRel = normalizeRelative(oldPath);
  const newRel = normalizeRelative(newPath);
  if (!oldRel || !newRel) {
    throw new SandboxError('invalid path for move', 'FORBIDDEN_PATH', { oldPath, newPath });
  }
  const oldAbs = await resolveSafePath(projectId, oldRel, profile);
  const newAbs = await resolveSafePath(projectId, newRel, profile);

  // For directories, compute the total size to enforce validateWrite
  let totalSize = 0;
  const stat = await fs.stat(oldAbs).catch(() => null);
  if (!stat) {
    throw new SandboxError(`source not found: ${oldRel}`, 'PROJECT_NOT_FOUND', { relativePath: oldRel });
  }
  if (stat.isDirectory()) {
    const walk = async (dir: string): Promise<number> => {
      let sz = 0;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) sz += await walk(full);
        else sz += (await fs.stat(full)).size;
      }
      return sz;
    };
    totalSize = await walk(oldAbs);
  } else {
    totalSize = stat.size;
  }
  await validateWrite(projectId, newRel, totalSize, profile);

  // Ensure parent of new path exists
  await fs.mkdir(path.dirname(newAbs), { recursive: true });
  await fs.rename(oldAbs, newAbs);

  // Update DB: delete old record, insert new
  await db.devFile.deleteMany({ where: { projectId, path: oldRel } });
  // Also need to update any descendant paths if directory
  const descendants = await db.devFile.findMany({
    where: { projectId, path: { startsWith: oldRel + '/' } },
  });
  for (const d of descendants) {
    const newChildPath = newRel + d.path.slice(oldRel.length);
    await db.devFile.update({
      where: { id: d.id },
      data: { path: newChildPath, name: path.basename(newChildPath) },
    });
  }
  const record = await upsertDbFile(projectId, newRel, stat.isDirectory(), totalSize);

  mimoEvents.emit(
    createEvent('dev.file.moved' as never, { projectId, from: oldRel, to: newRel }, 'dev:files'),
  );
  log.info('file moved', { projectId, from: oldRel, to: newRel });
  return record;
}

// ─── deleteFile ───

export async function deleteFile(
  projectId: string,
  relativePath: string,
  profile: SandboxProfile = 'standard',
): Promise<void> {
  const rel = normalizeRelative(relativePath);
  if (!rel) {
    throw new SandboxError('cannot delete project root', 'FORBIDDEN_PATH', { relativePath });
  }
  const abs = await resolveSafePath(projectId, rel, profile);

  // Reject if path is the project root itself
  const root = getProjectRoot(projectId);
  if (abs === root) {
    throw new SandboxError('cannot delete project root', 'FORBIDDEN_PATH', { relativePath });
  }

  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) {
    // Already gone — clean DB
    await db.devFile.deleteMany({ where: { projectId, path: { startsWith: rel } } });
    return;
  }

  if (stat.isDirectory()) {
    await fs.rm(abs, { recursive: true, force: true });
    await db.devFile.deleteMany({
      where: { projectId, OR: [{ path: rel }, { path: { startsWith: rel + '/' } }] },
    });
  } else {
    await fs.unlink(abs);
    await db.devFile.deleteMany({ where: { projectId, path: rel } });
  }

  mimoEvents.emit(
    createEvent('dev.file.deleted' as never, { projectId, path: rel, wasDirectory: stat.isDirectory() }, 'dev:files'),
  );
  log.info('file deleted', { projectId, path: rel });
}

// ─── searchFiles ───

export async function searchFiles(
  projectId: string,
  query: string,
  profile: SandboxProfile = 'standard',
): Promise<DevFileRecord[]> {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim().toLowerCase();
  // Use DB lookup — DevFile rows mirror filesystem state.
  const rows = await db.devFile.findMany({
    where: { projectId, name: { contains: q } },
    take: 100,
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toRecord);
}

// ─── DB upsert helper ───

async function upsertDbFile(
  projectId: string,
  rel: string,
  isDirectory: boolean,
  size: number,
  hash?: string,
): Promise<DevFileRecord> {
  const name = path.basename(rel) || rel;
  const mimeType = isDirectory ? null : getMimeType(rel);
  const row = await db.devFile.upsert({
    where: { projectId_path: { projectId, path: rel } },
    update: {
      name,
      isDirectory,
      size,
      mimeType,
      hash: hash ?? null,
    },
    create: {
      projectId,
      path: rel,
      name,
      isDirectory,
      size,
      mimeType,
      hash: hash ?? null,
    },
  });
  return toRecord(row);
}
