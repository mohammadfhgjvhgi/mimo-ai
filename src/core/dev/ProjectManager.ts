/**
 * MiMo Core — Development Project Manager
 * ----------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * CRUD + lifecycle management for DevProject records. Coordinates with
 * SandboxManager to ensure the filesystem sandbox dir is created on
 * project creation and removed on project deletion.
 *
 * All persistence is real (Prisma + SQLite). All filesystem operations
 * go through SandboxManager (validated, isolated).
 */

import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';
import {
  ensureProjectDir,
  deleteProjectDir,
  getProjectStats,
  getProfileLimits,
  type SandboxProfile,
  type ProjectStats,
} from './SandboxManager';

const log = createLogger('dev:projects');

// ─── Types ───

export type DevProjectType = 'nextjs' | 'node' | 'python' | 'static' | 'generic';
export type DevProjectStatus = 'idle' | 'building' | 'running' | 'testing' | 'error' | 'archived';
export type DevRuntime = 'node' | 'bun' | 'python' | 'static';
export type DevPackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip';

export interface CreateDevProjectInput {
  name: string;
  description?: string;
  type?: DevProjectType;
  profile?: SandboxProfile;
  runtime?: DevRuntime;
  packageManager?: DevPackageManager;
}

export interface DevProjectRecord {
  id: string;
  name: string;
  description: string | null;
  type: DevProjectType;
  rootPath: string;
  profile: SandboxProfile;
  runtime: DevRuntime;
  packageManager: DevPackageManager;
  status: DevProjectStatus;
  gitBranch: string | null;
  lastBuild: DevBuildSummary | null;
  lastTest: DevTestSummary | null;
  previewPort: number | null;
  envStatus: Record<string, EnvVarStatus> | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  stats: ProjectStats | null;
}

export interface EnvVarStatus {
  configured: boolean;
  required: boolean;
  status: 'configured' | 'missing' | 'invalid';
  /** NEVER the value — only a hint about whether it's set. */
}

export interface DevBuildSummary {
  status: 'success' | 'failed' | 'cancelled' | 'running';
  durationMs: number;
  errors: number;
  warnings: number;
  timestamp: number;
}

export interface DevTestSummary {
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  timestamp: number;
}

// ─── Create ───

export async function createProject(input: CreateDevProjectInput): Promise<DevProjectRecord> {
  const profile = input.profile ?? 'standard';
  const limits = getProfileLimits(profile);

  // Validate name
  if (!input.name || input.name.trim().length < 1) {
    throw new Error('project name is required');
  }
  if (input.name.length > 100) {
    throw new Error('project name too long (max 100 chars)');
  }

  const record = await db.devProject.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? null,
      type: input.type ?? 'generic',
      profile,
      runtime: input.runtime ?? 'node',
      packageManager: input.packageManager ?? 'npm',
      status: 'idle',
      rootPath: '', // filled in after we know the id
    },
  });

  // rootPath is the sandbox dir (kept in DB for diagnostics; always derived from id)
  const rootPath = await ensureProjectDir(record.id);
  await db.devProject.update({
    where: { id: record.id },
    data: { rootPath },
  });

  // Seed default permissions based on profile
  await seedDefaultPermissions(record.id, profile);

  mimoEvents.emit(
    createEvent('dev.project.created' as never, { projectId: record.id, name: record.name, profile }, 'dev:projects'),
  );
  log.info('project created', { id: record.id, name: record.name, profile, rootPath });

  return toDevProjectRecord({ ...record, rootPath });
}

// ─── Read ───

export async function getProject(id: string): Promise<DevProjectRecord | null> {
  const record = await db.devProject.findUnique({ where: { id } });
  if (!record) return null;
  return toDevProjectRecord(record);
}

export async function listProjects(includeArchived = false): Promise<DevProjectRecord[]> {
  const records = await db.devProject.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(records.map(toDevProjectRecord));
}

export async function listRecentProjects(limit = 5): Promise<DevProjectRecord[]> {
  const records = await db.devProject.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return Promise.all(records.map(toDevProjectRecord));
}

// ─── Update ───

export async function updateProject(
  id: string,
  updates: {
    name?: string;
    description?: string;
    type?: DevProjectType;
    profile?: SandboxProfile;
    runtime?: DevRuntime;
    packageManager?: DevPackageManager;
    status?: DevProjectStatus;
    gitBranch?: string | null;
    previewPort?: number | null;
    lastBuild?: DevBuildSummary;
    lastTest?: DevTestSummary;
    envStatus?: Record<string, EnvVarStatus>;
  },
): Promise<DevProjectRecord | null> {
  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.type !== undefined) data.type = updates.type;
  if (updates.profile !== undefined) data.profile = updates.profile;
  if (updates.runtime !== undefined) data.runtime = updates.runtime;
  if (updates.packageManager !== undefined) data.packageManager = updates.packageManager;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.gitBranch !== undefined) data.gitBranch = updates.gitBranch;
  if (updates.previewPort !== undefined) data.previewPort = updates.previewPort;
  if (updates.lastBuild !== undefined) data.lastBuild = JSON.stringify(updates.lastBuild);
  if (updates.lastTest !== undefined) data.lastTest = JSON.stringify(updates.lastTest);
  if (updates.envStatus !== undefined) data.envStatus = JSON.stringify(updates.envStatus);

  const record = await db.devProject.update({ where: { id }, data });
  return toDevProjectRecord(record);
}

// ─── Archive / Delete ───

export async function archiveProject(id: string): Promise<void> {
  await db.devProject.update({
    where: { id },
    data: { status: 'archived', archivedAt: new Date() },
  });
  mimoEvents.emit(
    createEvent('dev.project.archived' as never, { projectId: id }, 'dev:projects'),
  );
  log.info('project archived', { id });
}

export async function unarchiveProject(id: string): Promise<void> {
  await db.devProject.update({
    where: { id },
    data: { status: 'idle', archivedAt: null },
  });
}

export async function deleteProject(id: string): Promise<void> {
  // Delete the sandbox dir FIRST (validated by SandboxManager)
  await deleteProjectDir(id);
  // Then delete the DB record (cascades to files, builds, logs, etc.)
  await db.devProject.delete({ where: { id } });
  mimoEvents.emit(
    createEvent('dev.project.deleted' as never, { projectId: id }, 'dev:projects'),
  );
  log.info('project deleted', { id });
}

// ─── Duplicate ───

export async function duplicateProject(id: string, newName: string): Promise<DevProjectRecord> {
  const source = await getProject(id);
  if (!source) throw new Error(`project not found: ${id}`);
  const copy = await createProject({
    name: newName,
    description: source.description ?? undefined,
    type: source.type,
    profile: source.profile,
    runtime: source.runtime,
    packageManager: source.packageManager,
  });
  // Copy files via filesystem (sandbox-to-sandbox, both validated paths)
  // Defer to FileExplorerService for the actual copy loop.
  return copy;
}

// ─── Permissions ───

const ALL_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'process.execute',
  'network.access',
  'network.listen',
  'package.install',
  'git.access',
  'database.access',
  'mimo.api',
];

async function seedDefaultPermissions(projectId: string, profile: SandboxProfile): Promise<void> {
  const limits = getProfileLimits(profile);
  const grants: Record<string, string> = {
    'filesystem.read': 'allow',
    'filesystem.write': 'allow',
    'process.execute': limits.allowProcessExec ? 'allow' : 'deny',
    'network.access': limits.allowNetwork ? 'allow' : 'deny',
    'network.listen': limits.allowNetwork ? 'ask' : 'deny',
    'package.install': limits.allowPackageInstall ? 'ask' : 'deny',
    'git.access': limits.allowGitAccess ? 'allow' : 'deny',
    'database.access': limits.allowDatabaseAccess ? 'ask' : 'deny',
    'mimo.api': 'deny', // projects can NEVER access MiMo's own DB
  };

  for (const [permission, status] of Object.entries(grants)) {
    await db.devPermission.upsert({
      where: { projectId_permission: { projectId, permission } },
      update: { status },
      create: { projectId, permission, status, grantedBy: 'system' },
    });
  }
}

export async function getPermission(projectId: string, permission: string): Promise<'allow' | 'deny' | 'ask' | null> {
  const record = await db.devPermission.findUnique({
    where: { projectId_permission: { projectId, permission } },
  });
  return record?.status as 'allow' | 'deny' | 'ask' | null;
}

export async function setPermission(
  projectId: string,
  permission: string,
  status: 'allow' | 'deny' | 'ask',
  grantedBy = 'user',
): Promise<void> {
  if (!ALL_PERMISSIONS.includes(permission)) {
    throw new Error(`unknown permission: ${permission}`);
  }
  // CRITICAL: mimo.api is ALWAYS deny — projects can NEVER access MiMo's own DB
  if (permission === 'mimo.api' && status !== 'deny') {
    throw new Error('mimo.api permission cannot be granted — projects must never access MiMo core');
  }
  await db.devPermission.upsert({
    where: { projectId_permission: { projectId, permission } },
    update: { status, grantedBy },
    create: { projectId, permission, status, grantedBy },
  });
  log.info('permission set', { projectId, permission, status, grantedBy });
}

// ─── Helpers ───

type PrismaDevProject = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  rootPath: string;
  profile: string;
  runtime: string;
  packageManager: string;
  status: string;
  gitBranch: string | null;
  lastBuild: string | null;
  lastTest: string | null;
  previewPort: number | null;
  envStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

async function toDevProjectRecord(record: PrismaDevProject): Promise<DevProjectRecord> {
  const stats = await getProjectStats(record.id).catch(() => ({
    totalBytes: 0,
    fileCount: 0,
    dirCount: 0,
  }));
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    type: record.type as DevProjectType,
    rootPath: record.rootPath,
    profile: record.profile as SandboxProfile,
    runtime: record.runtime as DevRuntime,
    packageManager: record.packageManager as DevPackageManager,
    status: record.status as DevProjectStatus,
    gitBranch: record.gitBranch,
    lastBuild: record.lastBuild ? safeParse<DevBuildSummary>(record.lastBuild) : null,
    lastTest: record.lastTest ? safeParse<DevTestSummary>(record.lastTest) : null,
    previewPort: record.previewPort,
    envStatus: record.envStatus ? safeParse<Record<string, EnvVarStatus>>(record.envStatus) : null,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
    archivedAt: record.archivedAt?.getTime() ?? null,
    stats,
  };
}

function safeParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
