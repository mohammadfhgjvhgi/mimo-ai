/**
 * MiMo Core — Backup Engine
 * Phase 60-61: Database backup + restore + integrity verification.
 *
 * SECURITY: All path-accepting functions enforce BACKUP_DIR containment
 * via `path.resolve()` + prefix check. The API layer MUST pass a filename
 * (validated against /^[\w.-]+\.db$/) — never an arbitrary path. Use
 * `restoreBackupByFilename` / `deleteBackupByFilename` for the safe API.
 */

import { createLogger } from '../logger';
import { db } from '@/lib/db';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs';
import { join, resolve, relative, isAbsolute } from 'path';

const log = createLogger('backup:engine');

/** Directory where backups are stored. Exported for diagnostic use. */
export const BACKUP_DIR = join(process.cwd(), 'db', 'backups');
/** Path to the live SQLite database file. Exported for diagnostic use. */
export const DB_PATH = (process.env.DATABASE_URL ?? '').replace('file:', '');

const MAX_BACKUPS = 10;

export interface BackupInfo {
  id: string;
  filename: string;
  path: string;
  size: number;
  createdAt: number;
}

export interface RestoreResult {
  success: boolean;
  verified: boolean;
  error?: string;
  tables: Record<string, number>;
}

/**
 * Verify that `targetPath` is inside BACKUP_DIR. Throws if not.
 * Resolves the path first so `../` traversal and absolute paths are caught.
 */
function assertInsideBackupDir(targetPath: string): string {
  const resolved = resolve(targetPath);
  const backupRoot = resolve(BACKUP_DIR);
  const rel = relative(backupRoot, resolved);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `path traversal blocked: "${targetPath}" resolves outside BACKUP_DIR`,
    );
  }
  return resolved;
}

export async function createBackup(): Promise<BackupInfo> {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
  const filename = `mimo-backup-${dateStr}.db`;
  const backupPath = join(BACKUP_DIR, filename);

  if (!DB_PATH || !existsSync(DB_PATH)) {
    throw new Error('Database file not found: ' + DB_PATH);
  }

  copyFileSync(DB_PATH, backupPath);
  const stat = statSync(backupPath);

  // Enforce retention
  const backups = listBackups();
  if (backups.length > MAX_BACKUPS) {
    for (const old of backups.slice(MAX_BACKUPS)) {
      try { unlinkSync(old.path); } catch { /* ignore */ }
    }
  }

  log.info('backup created', { filename, size: stat.size });
  return { id: 'bkp_' + timestamp, filename, path: backupPath, size: stat.size, createdAt: timestamp };
}

/**
 * Restore the database from a backup file.
 *
 * SECURITY: `backupPath` must resolve to a location inside BACKUP_DIR.
 * Use `restoreBackupByFilename(filename)` from API code — it constructs the
 * path internally and validates the filename first.
 */
export async function restoreBackup(backupPath: string): Promise<RestoreResult> {
  const safePath = assertInsideBackupDir(backupPath);

  if (!existsSync(safePath)) {
    return { success: false, verified: false, error: 'Backup file not found', tables: {} };
  }

  try {
    await db.$disconnect();
    copyFileSync(safePath, DB_PATH);
    await db.$connect();

    const tables: Record<string, number> = {};
    for (const table of ['Project', 'Conversation', 'Message', 'Memory', 'EventLog', 'Task']) {
      try {
        const result = await db.$queryRawUnsafe<{ count: number }[]>(`SELECT COUNT(*) as count FROM ${table}`);
        tables[table] = result[0]?.count ?? 0;
      } catch { tables[table] = 0; }
    }

    log.info('backup restored', { backupPath: safePath, tables: Object.keys(tables).length });
    return { success: true, verified: Object.values(tables).some(v => v > 0), tables };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('restore failed', { error: msg });
    return { success: false, verified: false, error: msg, tables: {} };
  }
}

/**
 * Safe restore entry point: accepts a filename (NOT a path), validates it
 * against /^[\w.-]+\.db$/, then constructs the full path inside BACKUP_DIR
 * and delegates to `restoreBackup`. This is the API-callers' helper.
 */
export async function restoreBackupByFilename(filename: string): Promise<RestoreResult> {
  if (!isValidBackupFilename(filename)) {
    return {
      success: false,
      verified: false,
      error: 'invalid backup filename',
      tables: {},
    };
  }
  return restoreBackup(join(BACKUP_DIR, filename));
}

export function listBackups(): BackupInfo[] {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('mimo-backup-') && f.endsWith('.db'))
    .map(f => {
      const path = join(BACKUP_DIR, f);
      const stat = statSync(path);
      return { id: 'bkp_' + stat.mtime.getTime(), filename: f, path, size: stat.size, createdAt: stat.mtime.getTime() };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Delete a backup file.
 *
 * SECURITY: `path` must resolve to a location inside BACKUP_DIR.
 * Use `deleteBackupByFilename(filename)` from API code.
 */
export function deleteBackup(path: string): boolean {
  const safePath = assertInsideBackupDir(path);
  if (!existsSync(safePath)) return false;
  try { unlinkSync(safePath); return true; } catch { return false; }
}

/**
 * Safe delete entry point: accepts a filename (NOT a path), validates it
 * against /^[\w.-]+\.db$/, then constructs the full path inside BACKUP_DIR
 * and delegates to `deleteBackup`.
 */
export function deleteBackupByFilename(filename: string): boolean {
  if (!isValidBackupFilename(filename)) return false;
  return deleteBackup(join(BACKUP_DIR, filename));
}

/**
 * Validate a backup filename. Must be of the form `<name>.db` where `<name>`
 * contains only word chars, dots, or dashes. No path separators, no `..`.
 */
export function isValidBackupFilename(filename: string): boolean {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  return /^[\w.-]+\.db$/.test(filename);
}
