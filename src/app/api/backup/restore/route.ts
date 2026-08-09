/**
 * MiMo OS — Backup Restore API
 * ------------------------------
 * POST /api/backup/restore — restore the database from a backup filename.
 *
 * SECURITY: Accepts ONLY a `filename` field (never a path). The filename is
 * validated against /^[\w.-]+\.db$/ before being joined to BACKUP_DIR. The
 * BackupEngine re-validates BACKUP_DIR containment, so this is
 * defense-in-depth against path traversal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { restoreBackupByFilename, isValidBackupFilename } from '@/core/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: { filename?: string } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: 'invalid json body' },
        { status: 400 },
      );
    }

    const { filename } = body;
    if (!filename || !isValidBackupFilename(filename)) {
      return NextResponse.json(
        { error: 'invalid or missing filename' },
        { status: 400 },
      );
    }

    const result = await restoreBackupByFilename(filename);
    return NextResponse.json({ result, filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
