/**
 * MiMo Core — Development Sandbox Manager
 * ----------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * The SandboxManager is the SECURITY FOUNDATION of the Development Workspace.
 * It enforces:
 *   - Per-project filesystem isolation (project root + path containment)
 *   - Path traversal defense (rejects `..`, absolute paths, symlinks escaping root)
 *   - Resource limits (max file size, max total project size, max file count)
 *   - Forbidden file access (.env, ~/.ssh, ~/.aws, /etc, /proc, /sys, /dev)
 *   - Per-profile policy (safe / standard / development / networked / restricted)
 *
 * All file operations from FileExplorerService, BuildSystem, TestRunner,
 * GitIntegration, and the AI Coding Agent MUST go through this manager.
 * No module may touch the host filesystem directly for project files.
 *
 * Code EXECUTION (shell/python/node) goes through RuntimeGateway — this
 * manager does NOT execute code, it only validates filesystem paths.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';

const log = createLogger('dev:sandbox');

// ─── Sandbox root ───

const SANDBOX_ROOT = process.env.MIMO_DEV_SANDBOX_ROOT
  ?? path.join(process.cwd(), 'db', 'dev-sandbox');

const SNAPSHOT_ROOT = process.env.MIMO_DEV_SNAPSHOT_ROOT
  ?? path.join(process.cwd(), 'db', 'dev-snapshots');

// ─── Resource limits (per profile) ───

export type SandboxProfile = 'safe' | 'standard' | 'development' | 'networked' | 'restricted';

export interface ProfileLimits {
  maxFileBytes: number;
  maxProjectBytes: number;
  maxFileCount: number;
  maxPathDepth: number;
  allowNetwork: boolean;
  allowProcessExec: boolean;
  allowPackageInstall: boolean;
  allowGitAccess: boolean;
  allowDatabaseAccess: boolean;
  /** Forbidden relative paths (in addition to absolute forbidden paths). */
  forbiddenRelativePaths: string[];
  /** Max single-process timeout in ms (for build/test). */
  maxTimeoutMs: number;
  /** Max concurrent processes per project. */
  maxConcurrentProcesses: number;
}

const PROFILE_LIMITS: Record<SandboxProfile, ProfileLimits> = {
  safe: {
    maxFileBytes: 256 * 1024,
    maxProjectBytes: 5 * 1024 * 1024,
    maxFileCount: 100,
    maxPathDepth: 5,
    allowNetwork: false,
    allowProcessExec: false,
    allowPackageInstall: false,
    allowGitAccess: false,
    allowDatabaseAccess: false,
    forbiddenRelativePaths: ['.env', '.env.local', '.env.production', 'secrets.json', 'credentials.json'],
    maxTimeoutMs: 5_000,
    maxConcurrentProcesses: 0,
  },
  standard: {
    maxFileBytes: 1 * 1024 * 1024,
    maxProjectBytes: 50 * 1024 * 1024,
    maxFileCount: 500,
    maxPathDepth: 10,
    allowNetwork: false,
    allowProcessExec: true,
    allowPackageInstall: false,
    allowGitAccess: true,
    allowDatabaseAccess: false,
    forbiddenRelativePaths: ['.env', '.env.local', '.env.production', 'secrets.json', 'credentials.json'],
    maxTimeoutMs: 30_000,
    maxConcurrentProcesses: 2,
  },
  development: {
    maxFileBytes: 5 * 1024 * 1024,
    maxProjectBytes: 200 * 1024 * 1024,
    maxFileCount: 2000,
    maxPathDepth: 15,
    allowNetwork: true,
    allowProcessExec: true,
    allowPackageInstall: true,
    allowGitAccess: true,
    allowDatabaseAccess: false,
    forbiddenRelativePaths: ['.env', '.env.local', '.env.production', 'secrets.json', 'credentials.json'],
    maxTimeoutMs: 120_000,
    maxConcurrentProcesses: 4,
  },
  networked: {
    maxFileBytes: 5 * 1024 * 1024,
    maxProjectBytes: 200 * 1024 * 1024,
    maxFileCount: 2000,
    maxPathDepth: 15,
    allowNetwork: true,
    allowProcessExec: true,
    allowPackageInstall: true,
    allowGitAccess: true,
    allowDatabaseAccess: false,
    forbiddenRelativePaths: ['.env', '.env.local', '.env.production', 'secrets.json', 'credentials.json'],
    maxTimeoutMs: 120_000,
    maxConcurrentProcesses: 4,
  },
  restricted: {
    maxFileBytes: 64 * 1024,
    maxProjectBytes: 1 * 1024 * 1024,
    maxFileCount: 50,
    maxPathDepth: 3,
    allowNetwork: false,
    allowProcessExec: false,
    allowPackageInstall: false,
    allowGitAccess: false,
    allowDatabaseAccess: false,
    forbiddenRelativePaths: ['.env', '.env.local', '.env.production', 'secrets.json', 'credentials.json', '*.key', '*.pem'],
    maxTimeoutMs: 3_000,
    maxConcurrentProcesses: 0,
  },
};

// ─── Forbidden absolute paths (always blocked) ───

const FORBIDDEN_ABSOLUTE_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/ssh/',
  '/root/.ssh',
  '~/.ssh',
  '~/.aws',
  '~/.config/gcloud',
  '~/.netrc',
  '~/.npmrc',
  '~/.pypirc',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '/proc/',
  '/sys/',
  '/dev/',
  '/var/log/',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'credentials.json',
  'service-account',
  'firebase-adminsdk',
  'gcloud-service-key',
];

// ─── Traversal patterns ───

const TRAVERSAL_PATTERNS = ['../', '..\\', '~/..', '/..', '%2e%2e', '%2e%2e%2f', '....', '..%252f'];

// ─── Errors ───

export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'PATH_TRAVERSAL'
      | 'FORBIDDEN_PATH'
      | 'PATH_TOO_DEEP'
      | 'FILE_TOO_LARGE'
      | 'PROJECT_TOO_LARGE'
      | 'FILE_COUNT_EXCEEDED'
      | 'PROFILE_VIOLATION'
      | 'PROJECT_NOT_FOUND'
      | 'INTERNAL',
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

// ─── Path resolution ───

/**
 * Get the absolute root directory for a project's sandbox.
 * Format: <SANDBOX_ROOT>/<projectId>/
 */
export function getProjectRoot(projectId: string): string {
  // projectId must be a cuid — validate format to prevent injection
  if (!/^c[a-z0-9]{20,}$/i.test(projectId)) {
    throw new SandboxError(
      `invalid project id format: ${projectId}`,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }
  return path.join(SANDBOX_ROOT, projectId);
}

/**
 * Resolve a relative path inside a project's sandbox to an absolute path,
 * with FULL security validation:
 *   - rejects `..`, absolute paths, symlinks escaping root
 *   - rejects forbidden paths (.env, ~/.ssh, etc.)
 *   - rejects paths exceeding maxPathDepth
 *
 * This is the ONLY safe way to translate a user/agent-supplied relative
 * path into an absolute filesystem path for project files.
 *
 * Throws SandboxError on any violation. NEVER returns a path outside the
 * project root.
 */
export async function resolveSafePath(
  projectId: string,
  relativePath: string,
  profile: SandboxProfile = 'standard',
): Promise<string> {
  const limits = PROFILE_LIMITS[profile];
  const projectRoot = getProjectRoot(projectId);

  // 1. Empty path = project root
  if (!relativePath || relativePath.trim() === '') {
    return projectRoot;
  }

  // 2. Reject traversal patterns (case-insensitive)
  const lowerPath = relativePath.toLowerCase();
  for (const pattern of TRAVERSAL_PATTERNS) {
    if (lowerPath.includes(pattern.toLowerCase())) {
      throw new SandboxError(
        `path traversal detected: '${relativePath}' contains '${pattern}'`,
        'PATH_TRAVERSAL',
        { relativePath, pattern },
      );
    }
  }

  // 3. Reject absolute paths
  if (path.isAbsolute(relativePath)) {
    throw new SandboxError(
      `absolute paths not allowed: '${relativePath}'`,
      'FORBIDDEN_PATH',
      { relativePath },
    );
  }

  // 4. Normalize and resolve inside project root
  const normalized = path.normalize(relativePath);
  const resolved = path.resolve(projectRoot, normalized);

  // 5. Verify resolved path is INSIDE project root (defense in depth)
  const projectRootResolved = path.resolve(projectRoot);
  if (resolved !== projectRootResolved && !resolved.startsWith(projectRootResolved + path.sep)) {
    throw new SandboxError(
      `path escapes project root: '${relativePath}' resolves outside sandbox`,
      'PATH_TRAVERSAL',
      { relativePath, resolved, projectRoot: projectRootResolved },
    );
  }

  // 6. Check for symlinks escaping root (resolve real path if exists)
  try {
    const real = await fs.realpath(resolved);
    let realRoot: string;
    try {
      realRoot = await fs.realpath(projectRootResolved);
    } catch {
      // root may not exist yet — create it
      await fs.mkdir(projectRootResolved, { recursive: true });
      realRoot = await fs.realpath(projectRootResolved);
    }
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      throw new SandboxError(
        `symlink escapes project root: '${relativePath}' resolves to '${real}' (outside '${realRoot}')`,
        'PATH_TRAVERSAL',
        { relativePath, real, realRoot },
      );
    }
  } catch (err) {
    // If the path doesn't exist yet (write case), realpath throws ENOENT — fine.
    if (err instanceof SandboxError) throw err;
    // ENOENT / other fs errors during realpath are expected on writes — skip
  }

  // 7. Reject forbidden relative paths
  const baseName = path.basename(resolved);
  for (const forbidden of limits.forbiddenRelativePaths) {
    if (forbidden.startsWith('*.')) {
      if (baseName.endsWith(forbidden.slice(1))) {
        throw new SandboxError(
          `forbidden file type: '${baseName}' matches '${forbidden}'`,
          'FORBIDDEN_PATH',
          { relativePath, baseName, pattern: forbidden },
        );
      }
    } else if (baseName === forbidden || resolved.endsWith('/' + forbidden)) {
      throw new SandboxError(
        `forbidden path: '${baseName}' is not allowed in sandbox`,
        'FORBIDDEN_PATH',
        { relativePath, baseName, forbidden },
      );
    }
  }

  // 8. Reject forbidden absolute paths (defense in depth)
  for (const forbidden of FORBIDDEN_ABSOLUTE_PATHS) {
    if (resolved.includes(forbidden) || lowerPath.includes(forbidden.toLowerCase())) {
      throw new SandboxError(
        `forbidden absolute path: '${forbidden}' is not accessible`,
        'FORBIDDEN_PATH',
        { relativePath, forbidden },
      );
    }
  }

  // 9. Check path depth
  const relFromRoot = path.relative(projectRootResolved, resolved);
  const depth = relFromRoot ? relFromRoot.split(path.sep).length : 0;
  if (depth > limits.maxPathDepth) {
    throw new SandboxError(
      `path too deep: ${depth} > ${limits.maxPathDepth} (profile: ${profile})`,
      'PATH_TOO_DEEP',
      { relativePath, depth, maxDepth: limits.maxPathDepth },
    );
  }

  return resolved;
}

/**
 * Validate that a write of `size` bytes to `relativePath` is allowed by
 * the profile's resource limits. Throws SandboxError if exceeded.
 */
export async function validateWrite(
  projectId: string,
  relativePath: string,
  size: number,
  profile: SandboxProfile = 'standard',
): Promise<void> {
  const limits = PROFILE_LIMITS[profile];

  if (size > limits.maxFileBytes) {
    throw new SandboxError(
      `file too large: ${size} bytes > ${limits.maxFileBytes} (profile: ${profile})`,
      'FILE_TOO_LARGE',
      { relativePath, size, maxSize: limits.maxFileBytes },
    );
  }

  const stats = await getProjectStats(projectId).catch(() => ({
    totalBytes: 0,
    fileCount: 0,
  }));

  const resolved = await resolveSafePath(projectId, relativePath, profile);
  const existingSize = await fs.stat(resolved).then((s) => s.size).catch(() => 0);
  const newTotal = stats.totalBytes - existingSize + size;
  if (newTotal > limits.maxProjectBytes) {
    throw new SandboxError(
      `project too large: ${newTotal} bytes > ${limits.maxProjectBytes} (profile: ${profile})`,
      'PROJECT_TOO_LARGE',
      { relativePath, newTotal, maxProjectBytes: limits.maxProjectBytes },
    );
  }

  if (existingSize === 0 && stats.fileCount >= limits.maxFileCount) {
    throw new SandboxError(
      `file count exceeded: ${stats.fileCount} >= ${limits.maxFileCount} (profile: ${profile})`,
      'FILE_COUNT_EXCEEDED',
      { relativePath, fileCount: stats.fileCount, maxFileCount: limits.maxFileCount },
    );
  }
}

// ─── Project directory lifecycle ───

export async function ensureProjectDir(projectId: string): Promise<string> {
  const root = getProjectRoot(projectId);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(SNAPSHOT_ROOT, projectId), { recursive: true });
  log.debug('project dir ensured', { projectId, root });
  return root;
}

export async function deleteProjectDir(projectId: string): Promise<void> {
  const root = getProjectRoot(projectId);
  const resolvedRoot = path.resolve(root);
  const resolvedSandboxRoot = path.resolve(SANDBOX_ROOT);

  if (!resolvedRoot.startsWith(resolvedSandboxRoot + path.sep)) {
    throw new SandboxError(
      `refuse to delete: project root '${resolvedRoot}' is outside sandbox root`,
      'FORBIDDEN_PATH',
      { resolvedRoot, resolvedSandboxRoot },
    );
  }

  await fs.rm(resolvedRoot, { recursive: true, force: true });
  const snapDir = path.join(SNAPSHOT_ROOT, projectId);
  await fs.rm(snapDir, { recursive: true, force: true }).catch(() => {});

  mimoEvents.emit(
    createEvent('dev.project_dir.deleted' as never, { projectId, root: resolvedRoot }, 'dev:sandbox'),
  );
  log.info('project dir deleted', { projectId, root: resolvedRoot });
}

// ─── Project stats ───

export interface ProjectStats {
  totalBytes: number;
  fileCount: number;
  dirCount: number;
}

export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const root = getProjectRoot(projectId);
  let totalBytes = 0;
  let fileCount = 0;
  let dirCount = 0;

  try {
    const walk = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          dirCount++;
          await walk(full);
        } else if (entry.isFile()) {
          fileCount++;
          const stat = await fs.stat(full);
          totalBytes += stat.size;
        }
      }
    };
    await walk(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('failed to compute project stats', {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { totalBytes, fileCount, dirCount };
}

// ─── Profile access ───

export function getProfileLimits(profile: SandboxProfile): ProfileLimits {
  return PROFILE_LIMITS[profile];
}

export function getSnapshotPath(projectId: string, snapshotId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(snapshotId)) {
    throw new SandboxError(
      `invalid snapshot id: ${snapshotId}`,
      'FORBIDDEN_PATH',
      { snapshotId },
    );
  }
  return path.join(SNAPSHOT_ROOT, projectId, `${snapshotId}.tar.gz`);
}

export function getSandboxRoot(): string {
  return SANDBOX_ROOT;
}

export function getSnapshotRoot(): string {
  return SNAPSHOT_ROOT;
}

export { SandboxError as DevSandboxError };
