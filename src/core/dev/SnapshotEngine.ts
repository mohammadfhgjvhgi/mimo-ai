/**
 * MiMo Core — Development Snapshot Engine
 * -----------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * Versioned tar.gz archives of an entire DevProject sandbox. Used for
 * snapshot/restore/clone workflows.
 *
 * Workflow:
 *   - createSnapshot: tar -czf via executeRuntime → snapshot archive +
 *     sha256 hash + DevSnapshot row.
 *   - restoreSnapshot: verify hash FIRST (sha256 file comparison), then
 *     extract to temp dir, atomically replace project root via rename.
 *   - deleteSnapshot: delete archive + DB row.
 *   - cloneProject: create new DevProject + restore snapshot into it.
 *
 * All paths go through SandboxManager validation. The archive itself
 * lives at getSnapshotPath(projectId, snapshotId) which validates the
 * snapshotId format (alphanumeric / dash / underscore only).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';
import { executeRuntime, type RuntimeRequest } from '../runtime/RuntimeGateway';
import {
  getProjectRoot,
  getSnapshotPath,
  getProjectStats,
  SandboxError,
  type SandboxProfile,
} from './SandboxManager';
import { createProject, getProject, type DevProjectRecord } from './ProjectManager';
import { writeLog } from './LogService';

const log = createLogger('dev:snapshots');

// ─── Types ───

export interface DevSnapshotRecord {
  id: string;
  projectId: string;
  label: string;
  description: string | null;
  archivePath: string;
  hash: string;
  fileCount: number;
  sizeBytes: number;
  createdAt: number;
}

// ─── createSnapshot ───

export async function createSnapshot(
  projectId: string,
  label: string,
  description?: string,
  profile: SandboxProfile = 'standard',
): Promise<DevSnapshotRecord> {
  if (!label || label.trim().length === 0) {
    throw new SandboxError('snapshot label is required', 'PROFILE_VIOLATION', { action: 'snapshot.create' });
  }
  if (label.length > 200) {
    throw new SandboxError('snapshot label too long (max 200 chars)', 'PROFILE_VIOLATION', { action: 'snapshot.create' });
  }

  const project = await getProject(projectId);
  if (!project) {
    throw new SandboxError(`project not found: ${projectId}`, 'PROJECT_NOT_FOUND', { projectId });
  }

  const snapshotId = randomUUID().replace(/-/g, '').slice(0, 24);
  const archivePath = getSnapshotPath(projectId, snapshotId);
  const archiveDir = path.dirname(archivePath);
  await fs.mkdir(archiveDir, { recursive: true });

  const workspacePath = getProjectRoot(projectId);
  const archiveBasename = path.basename(archivePath);
  // Use tar via executeRuntime (sandboxed shell). Output file path is absolute
  // but contained within SNAPSHOT_ROOT — we pass it through shell escaping.
  const safeArchiveArg = `'${archivePath.replace(/'/g, "'\\''")}'`;

  // Capture pre-snapshot stats for the record
  const stats = await getProjectStats(projectId);

  const requestId = `snap-${snapshotId}-${randomUUID()}`;
  const runtimeReq: RuntimeRequest = {
    id: requestId,
    code: `tar -czf ${safeArchiveArg} -C '${workspacePath.replace(/'/g, "'\\''")}' . && echo "OK ${archiveBasename}"`,
    language: 'shell',
    workspacePath,
    timeoutMs: 60_000,
    networkPolicy: 'none',
    fsPolicy: 'read-write',
    maxOutputBytes: 64_000,
    maxCodeBytes: 8_000,
  };

  const result = await executeRuntime(runtimeReq);
  if (result.status !== 'COMPLETED') {
    throw new SandboxError(
      `snapshot creation failed: ${result.error ?? result.output}`,
      'INTERNAL',
      { projectId, snapshotId, status: result.status },
    );
  }

  // Verify archive exists
  const archiveStat = await fs.stat(archivePath).catch(() => null);
  if (!archiveStat) {
    throw new SandboxError(
      `snapshot archive was not created: ${archivePath}`,
      'INTERNAL',
      { projectId, snapshotId, archivePath },
    );
  }

  // Compute sha256 of the archive
  const hash = await computeFileHash(archivePath);
  const sizeBytes = archiveStat.size;

  const row = await db.devSnapshot.create({
    data: {
      id: snapshotId,
      projectId,
      label: label.trim(),
      description: description ?? null,
      archivePath,
      hash,
      fileCount: stats.fileCount,
      sizeBytes,
    },
  });

  await writeLog(projectId, 'build', 'info', `snapshot created: ${label}`, {
    snapshotId,
    archivePath,
    hash,
    fileCount: stats.fileCount,
    sizeBytes,
  }, undefined, requestId);

  mimoEvents.emit(
    createEvent('dev.snapshot.created' as never, { projectId, snapshotId, label, sizeBytes }, 'dev:snapshots', requestId),
  );
  log.info('snapshot created', { projectId, snapshotId, sizeBytes, hash });

  return toRecord(row);
}

// ─── listSnapshots ───

export async function listSnapshots(projectId: string): Promise<DevSnapshotRecord[]> {
  const rows = await db.devSnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toRecord);
}

// ─── restoreSnapshot ───

export async function restoreSnapshot(
  projectId: string,
  snapshotId: string,
  profile: SandboxProfile = 'standard',
): Promise<void> {
  const snapshot = await db.devSnapshot.findFirst({
    where: { id: snapshotId, projectId },
  });
  if (!snapshot) {
    throw new SandboxError(`snapshot not found: ${snapshotId}`, 'PROJECT_NOT_FOUND', { projectId, snapshotId });
  }

  const archivePath = getSnapshotPath(projectId, snapshotId);
  const archiveStat = await fs.stat(archivePath).catch(() => null);
  if (!archiveStat) {
    throw new SandboxError(
      `snapshot archive missing on disk: ${archivePath}`,
      'INTERNAL',
      { projectId, snapshotId, archivePath },
    );
  }

  // CRITICAL: verify hash FIRST before doing anything destructive
  const currentHash = await computeFileHash(archivePath);
  if (currentHash !== snapshot.hash) {
    throw new SandboxError(
      `snapshot archive integrity check failed (hash mismatch)`,
      'PROFILE_VIOLATION',
      { projectId, snapshotId, expectedHash: snapshot.hash, actualHash: currentHash },
    );
  }

  const projectRoot = getProjectRoot(projectId);
  const tempExtractDir = path.join(path.dirname(projectRoot), `${projectId}.restore-${Date.now()}`);
  await fs.mkdir(tempExtractDir, { recursive: true });

  // Extract archive to temp dir
  const requestId = `restore-${snapshotId}-${randomUUID()}`;
  const extractCmd = `tar -xzf '${archivePath.replace(/'/g, "'\\''")}' -C '${tempExtractDir.replace(/'/g, "'\\''")}'`;
  const runtimeReq: RuntimeRequest = {
    id: requestId,
    code: extractCmd,
    language: 'shell',
    workspacePath: tempExtractDir,
    timeoutMs: 60_000,
    networkPolicy: 'none',
    fsPolicy: 'read-write',
    maxOutputBytes: 64_000,
    maxCodeBytes: 8_000,
  };
  const result = await executeRuntime(runtimeReq);
  if (result.status !== 'COMPLETED') {
    await fs.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
    throw new SandboxError(
      `snapshot extraction failed: ${result.error ?? result.output}`,
      'INTERNAL',
      { projectId, snapshotId, status: result.status },
    );
  }

  // Atomic-ish swap: rename old root to .old, rename temp to root, delete .old
  const oldRoot = `${projectRoot}.old-${Date.now()}`;
  try {
    await fs.rename(projectRoot, oldRoot);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // No existing root — proceed
    } else {
      await fs.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }
  try {
    await fs.rename(tempExtractDir, projectRoot);
  } catch (err) {
    // Rollback: try to restore old root
    try {
      await fs.rename(oldRoot, projectRoot);
    } catch {}
    await fs.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  // Delete old root
  await fs.rm(oldRoot, { recursive: true, force: true }).catch(() => {});

  await writeLog(projectId, 'build', 'info', `snapshot restored: ${snapshot.label}`, {
    snapshotId,
    hash: snapshot.hash,
    fileCount: snapshot.fileCount,
  }, undefined, requestId);

  mimoEvents.emit(
    createEvent('dev.snapshot.restored' as never, { projectId, snapshotId }, 'dev:snapshots', requestId),
  );
  log.info('snapshot restored', { projectId, snapshotId });
}

// ─── deleteSnapshot ───

export async function deleteSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<void> {
  const snapshot = await db.devSnapshot.findFirst({
    where: { id: snapshotId, projectId },
  });
  if (!snapshot) return;

  const archivePath = getSnapshotPath(projectId, snapshotId);
  await fs.unlink(archivePath).catch(() => { /* may already be gone */ });
  await db.devSnapshot.delete({ where: { id: snapshotId } });

  await writeLog(projectId, 'build', 'info', `snapshot deleted: ${snapshot.label}`, {
    snapshotId,
  });

  log.info('snapshot deleted', { projectId, snapshotId });
}

// ─── cloneProject ───

export async function cloneProject(
  projectId: string,
  snapshotId: string,
  newName: string,
): Promise<DevProjectRecord> {
  const snapshot = await db.devSnapshot.findFirst({
    where: { id: snapshotId, projectId },
  });
  if (!snapshot) {
    throw new SandboxError(`snapshot not found: ${snapshotId}`, 'PROJECT_NOT_FOUND', { projectId, snapshotId });
  }
  const source = await getProject(projectId);
  if (!source) {
    throw new SandboxError(`project not found: ${projectId}`, 'PROJECT_NOT_FOUND', { projectId });
  }

  // Create new project (this seeds the sandbox dir)
  const copy = await createProject({
    name: newName,
    description: source.description ?? undefined,
    type: source.type,
    profile: source.profile,
    runtime: source.runtime,
    packageManager: source.packageManager,
  });

  // Restore snapshot into the new project's sandbox
  try {
    await restoreSnapshot(copy.id, snapshotId, source.profile);
  } catch (err) {
    // Cleanup half-created project on failure
    try {
      await fs.rm(getProjectRoot(copy.id), { recursive: true, force: true });
    } catch {}
    await db.devProject.delete({ where: { id: copy.id } }).catch(() => {});
    throw err;
  }

  await writeLog(copy.id, 'build', 'info', `project cloned from ${projectId} snapshot ${snapshotId}`, {
    sourceProjectId: projectId,
    snapshotId,
  });

  return copy;
}

// ─── helpers ───

type PrismaDevSnapshot = {
  id: string;
  projectId: string;
  label: string;
  description: string | null;
  archivePath: string;
  hash: string;
  fileCount: number;
  sizeBytes: number;
  createdAt: Date;
};

function toRecord(r: PrismaDevSnapshot): DevSnapshotRecord {
  return {
    id: r.id,
    projectId: r.projectId,
    label: r.label,
    description: r.description,
    archivePath: r.archivePath,
    hash: r.hash,
    fileCount: r.fileCount,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.getTime(),
  };
}

async function computeFileHash(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    let pos = BigInt(0);
    // Read in chunks using fs.read with the FileHandle
    for (;;) {
      const { bytesRead } = await (stream as { read: (buf: Buffer, offset: number, length: number, position: bigint | null) => Promise<{ bytesRead: number }> }).read(buf, 0, buf.length, pos);
      if (bytesRead === 0 || bytesRead == null) break;
      hash.update(buf.subarray(0, bytesRead));
      pos += BigInt(bytesRead);
      if (bytesRead < buf.length) break;
    }
  } finally {
    await stream.close().catch(() => {});
  }
  return hash.digest('hex');
}
