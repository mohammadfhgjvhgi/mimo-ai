/**
 * MiMo Core — Development Build System
 * -------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * Detects project type from files and runs the appropriate build command
 * via RuntimeGateway. All execution is sandboxed:
 *   - workspacePath = project root (validated)
 *   - fsPolicy = 'read-write'
 *   - networkPolicy from profile
 *   - timeoutMs from profile.maxTimeoutMs
 *
 * Records DevBuild rows (running → success/failed/cancelled) and writes
 * DevLog entries on the 'build' channel.
 */

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';
import { executeRuntime, type RuntimeRequest, type RuntimeResult } from '../runtime/RuntimeGateway';
import {
  getProjectRoot,
  getProfileLimits,
  SandboxError,
  type SandboxProfile,
} from './SandboxManager';
import { getProject, type DevProjectRecord, type DevProjectType } from './ProjectManager';
import { writeLog } from './LogService';

const log = createLogger('dev:build');

// ─── Types ───

export interface DevBuildRecord {
  id: string;
  projectId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  command: string;
  output: string;
  errors: string[];
  warnings: string[];
  durationMs: number | null;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface BuildCommand {
  command: string;
  language: 'shell';
}

// ─── detectProjectType ───

export async function detectProjectType(
  projectId: string,
  profile: SandboxProfile = 'standard',
): Promise<DevProjectType> {
  const root = getProjectRoot(projectId);

  // Check for package.json (nextjs or node)
  const pkgJsonPath = path.join(root, 'package.json');
  const hasPkgJson = await fs.stat(pkgJsonPath).then(() => true).catch(() => false);
  if (hasPkgJson) {
    try {
      const content = await fs.readFile(pkgJsonPath, 'utf8');
      const pkg = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if ('next' in allDeps) return 'nextjs';
      return 'node';
    } catch {
      return 'node';
    }
  }

  // Check for python
  const hasReqs = await fs.stat(path.join(root, 'requirements.txt')).then(() => true).catch(() => false);
  const hasPyproject = await fs.stat(path.join(root, 'pyproject.toml')).then(() => true).catch(() => false);
  const hasSetupPy = await fs.stat(path.join(root, 'setup.py')).then(() => true).catch(() => false);
  if (hasReqs || hasPyproject || hasSetupPy) return 'python';

  // Check for static (index.html at root)
  const hasIndexHtml = await fs.stat(path.join(root, 'index.html')).then(() => true).catch(() => false);
  if (hasIndexHtml) return 'static';

  void profile; // currently unused; type detection is purely structural
  return 'generic';
}

// ─── getBuildCommand ───

export function getBuildCommand(
  project: DevProjectRecord,
  _profile: SandboxProfile,
): BuildCommand {
  const pm = project.packageManager;
  switch (project.type) {
    case 'nextjs':
      return { command: `${pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm'} run build`, language: 'shell' };
    case 'node':
      // node generic: run "build" if defined, otherwise no-op
      return { command: `${pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm'} run build`, language: 'shell' };
    case 'python':
      return { command: `python -m compileall -q .`, language: 'shell' };
    case 'static':
      return { command: `echo 'no build needed for static project'`, language: 'shell' };
    case 'generic':
    default:
      return { command: `echo 'no build configured'`, language: 'shell' };
  }
}

// ─── runBuild ───

export async function runBuild(
  projectId: string,
  profile: SandboxProfile = 'standard',
): Promise<DevBuildRecord> {
  const limits = getProfileLimits(profile);
  if (!limits.allowProcessExec) {
    throw new SandboxError(
      `profile '${profile}' does not allow process execution`,
      'PROFILE_VIOLATION',
      { profile, action: 'build' },
    );
  }

  const project = await getProject(projectId);
  if (!project) {
    throw new SandboxError(`project not found: ${projectId}`, 'PROJECT_NOT_FOUND', { projectId });
  }

  // Re-detect type if it is still 'generic' but project files say otherwise.
  let effectiveType: DevProjectType = project.type;
  if (effectiveType === 'generic') {
    const detected = await detectProjectType(projectId, profile);
    if (detected !== 'generic') effectiveType = detected;
  }
  if (effectiveType !== project.type) {
    // persist detected type for future runs
    await db.devProject.update({ where: { id: projectId }, data: { type: effectiveType } });
  }

  const { command } = getBuildCommand({ ...project, type: effectiveType }, profile);
  const workspacePath = getProjectRoot(projectId);

  // Create DevBuild row (status=running)
  const build = await db.devBuild.create({
    data: { projectId, status: 'running', command, output: '' },
  });

  await writeLog(projectId, 'build', 'info', `build started: ${command}`, {
    buildId: build.id,
    command,
    profile,
  });

  const requestId = `build-${build.id}-${randomUUID()}`;
  const runtimeReq: RuntimeRequest = {
    id: requestId,
    code: command,
    language: 'shell',
    workspacePath,
    timeoutMs: limits.maxTimeoutMs,
    networkPolicy: limits.allowNetwork ? 'restricted' : 'none',
    fsPolicy: 'read-write',
    maxOutputBytes: 1_000_000,
    maxCodeBytes: 64_000,
  };

  let result: RuntimeResult;
  try {
    result = await executeRuntime(runtimeReq);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('build execution threw', { projectId, buildId: build.id, error: msg });
    result = {
      id: requestId,
      status: 'FAILED',
      output: '',
      error: msg,
      durationMs: 0,
      cancelled: false,
    };
  }

  const output = (result.output || result.error || '').slice(0, 1_000_000);
  const { errors, warnings } = parseBuildOutput(output);

  const finalStatus: DevBuildRecord['status'] =
    result.status === 'COMPLETED'
      ? errors.length === 0
        ? 'success'
        : 'failed'
      : result.status === 'TIMEOUT'
        ? 'cancelled'
        : result.status === 'CANCELLED'
          ? 'cancelled'
          : 'failed';

  const updated = await db.devBuild.update({
    where: { id: build.id },
    data: {
      status: finalStatus,
      output,
      errors: JSON.stringify(errors),
      warnings: JSON.stringify(warnings),
      durationMs: result.durationMs,
      exitCode: result.exitCode ?? null,
      finishedAt: new Date(),
    },
  });

  // Update DevProject.lastBuild summary
  const summary = {
    status: finalStatus === 'success' ? 'success' : finalStatus === 'failed' ? 'failed' : 'cancelled',
    durationMs: result.durationMs,
    errors: errors.length,
    warnings: warnings.length,
    timestamp: Date.now(),
  };
  await db.devProject.update({
    where: { id: projectId },
    data: { lastBuild: JSON.stringify(summary), status: finalStatus === 'success' ? 'idle' : 'error' },
  });

  await writeLog(
    projectId,
    'build',
    finalStatus === 'success' ? 'info' : 'error',
    `build ${finalStatus}: ${errors.length} errors, ${warnings.length} warnings`,
    { buildId: build.id, durationMs: result.durationMs, exitCode: result.exitCode, errorCount: errors.length, warningCount: warnings.length },
    undefined,
    requestId,
  );

  mimoEvents.emit(
    createEvent('dev.build.completed' as never, { projectId, buildId: build.id, status: finalStatus, durationMs: result.durationMs }, 'dev:build', requestId),
  );

  return toRecord(updated);
}

// ─── listBuilds / getBuild ───

export async function listBuilds(projectId: string, limit = 20): Promise<DevBuildRecord[]> {
  const rows = await db.devBuild.findMany({
    where: { projectId },
    orderBy: { startedAt: 'desc' },
    take: Math.min(limit, 100),
  });
  return rows.map(toRecord);
}

export async function getBuild(projectId: string, buildId: string): Promise<DevBuildRecord | null> {
  const row = await db.devBuild.findFirst({ where: { id: buildId, projectId } });
  return row ? toRecord(row) : null;
}

// ─── helpers ───

type PrismaDevBuild = {
  id: string;
  projectId: string;
  status: string;
  command: string;
  output: string;
  errors: string | null;
  warnings: string | null;
  durationMs: number | null;
  exitCode: number | null;
  startedAt: Date;
  finishedAt: Date | null;
};

function toRecord(r: PrismaDevBuild): DevBuildRecord {
  let errors: string[] = [];
  let warnings: string[] = [];
  try { if (r.errors) errors = JSON.parse(r.errors) as string[]; } catch {}
  try { if (r.warnings) warnings = JSON.parse(r.warnings) as string[]; } catch {}
  return {
    id: r.id,
    projectId: r.projectId,
    status: r.status as DevBuildRecord['status'],
    command: r.command,
    output: r.output,
    errors,
    warnings,
    durationMs: r.durationMs,
    exitCode: r.exitCode,
    startedAt: r.startedAt.getTime(),
    finishedAt: r.finishedAt?.getTime() ?? null,
  };
}

/**
 * Parse build output for error / warning indicators. Matches common
 * patterns from tsc, eslint, jest, npm, pip, etc.
 */
function parseBuildOutput(output: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isErr =
      /(^|\s)(error|Error|ERROR)(:|\s)/.test(trimmed) ||
      /\b✖\b/.test(trimmed) ||
      /\berror TS\d+:/.test(trimmed) ||
      /Error:/i.test(trimmed) ||
      /^ERR!/.test(trimmed) ||
      /FAILED/.test(trimmed);
    const isWarn =
      /(^|\s)(warning|Warning|WARNING)(:|\s)/.test(trimmed) ||
      /warn TS\d+:/i.test(trimmed) ||
      /^WARN/.test(trimmed);
    if (isErr) errors.push(trimmed.slice(0, 1024));
    else if (isWarn) warnings.push(trimmed.slice(0, 1024));
  }
  // Cap arrays to avoid runaway metadata
  return { errors: errors.slice(0, 100), warnings: warnings.slice(0, 100) };
}
