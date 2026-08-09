/**
 * MiMo OS — Backup API
 * ---------------------
 * Thin HTTP wrapper around the BackupEngine. All client input is treated
 * as UNTRUSTED: only the filename is accepted (never a path), and it is
 * validated against /^[\w.-]+\.db$/ before being joined to BACKUP_DIR.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBackup, listBackups, deleteBackupByFilename, isValidBackupFilename } from '@/core/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/backup — list all backups (newest first). */
export async function GET() {
  try {
    const backups = listBackups();
    return NextResponse.json({ backups });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/backup — create a new backup. Returns the backup metadata. */
export async function POST() {
  try {
    const backup = await createBackup();
    return NextResponse.json({ backup }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/backup?filename=<name> — delete a backup by filename. */
export async function DELETE(req: NextRequest) {
  try {
    const filename = req.nextUrl.searchParams.get('filename');
    if (!filename || !isValidBackupFilename(filename)) {
      return NextResponse.json(
        { error: 'invalid or missing filename' },
        { status: 400 },
      );
    }
    const deleted = deleteBackupByFilename(filename);
    if (!deleted) {
      return NextResponse.json(
        { error: 'backup not found', filename },
        { status: 404 },
      );
    }
    return NextResponse.json({ deleted: true, filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
