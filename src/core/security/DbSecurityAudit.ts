/**
 * MiMo Core — Database Security Assessment
 * -----------------------------------------
 * Real, evidence-based security audit:
 * - Reads the DB file's mode bits via `fs.stat`
 * - Reads the first 16 bytes of the DB file to detect SQLite magic header
 *   (and therefore whether SQLCipher is in use — it isn't, by design)
 * - Recursively scans `src/` for secret patterns in source code
 * - Lists `src/core/models/` files that import `z-ai-web-dev-sdk`
 *   (the provider-leakage check — should be ≤ 3 adapter files)
 *
 * The function ONLY logs when called (no import-time side effects).
 *
 * Architecture note: Prisma 6 + SQLite does NOT support SQLCipher natively.
 * For local-first single-user, the recommended path is OS-level disk
 * encryption (LUKS/FileVault/BitLocker). Field-level encryption for
 * sensitive columns is an additional defense-in-depth layer (deferred to v2).
 */

import { createLogger } from '../logger';
import { statSync, readdirSync, readFileSync, existsSync } from 'fs';
import type { Dirent } from 'fs';
import { join, extname, basename, relative, resolve } from 'path';

const log = createLogger('security:db');

const SQLITE_MAGIC = 'SQLite format 3\0';

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'openai_key', re: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'api_key', re: /api[_-]?key\s*[:=]\s*["'][^"']{10,}["']/i },
  { name: 'password', re: /password\s*[:=]\s*["'][^"']{6,}["']/i },
  { name: 'private_key', re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { name: 'aws_key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'github_pat', re: /ghp_[a-zA-Z0-9]{36}/ },
];

const SCAN_ALLOWED_EXTS = new Set(['.ts', '.tsx', '.js', '.json']);
const SCAN_SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git']);
const SCAN_MAX_FILES = 500;
const SCAN_ROOT = resolve(process.cwd(), 'src');
const MODELS_DIR = resolve(process.cwd(), 'src', 'core', 'models');

export interface SecretFinding {
  file: string;
  line: number;
  pattern: string;
}

export interface DbSecurityStatus {
  /** 'none' for plaintext SQLite (the only supported v1 option). */
  encryptionAtRest: 'none' | 'field-level' | 'full-database';
  /** Octal mode bits of the DB file (e.g. '644'), or 'missing' if not found. */
  dbFilePermissions: string;
  /** DB file size in bytes (real fs.stat). */
  dbFileSize: number | null;
  /** Whether any secret patterns were detected in src/. */
  secretsInCode: boolean;
  /** Count of secret occurrences detected. */
  secretsCount: number;
  /** Per-file line-level findings (capped for display). */
  secretsFindings: SecretFinding[];
  /** Files in src/core/models/ that import z-ai-web-dev-sdk (provider-leakage check). */
  externalDataPaths: string[];
  /** Actionable recommendation based on the actual findings. */
  recommendation: string;
  /** Wall-clock time the audit took (ms). */
  durationMs: number;
}

/**
 * Recursively collect files under `root` matching allowed extensions.
 * Skips `node_modules`, `.next`, `dist`, `build`, `.git`.
 * Hard cap at SCAN_MAX_FILES.
 */
function collectSourceFiles(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (out.length >= SCAN_MAX_FILES) return out;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SCAN_SKIP_DIRS.has(ent.name)) continue;
        stack.push(full);
      } else if (ent.isFile()) {
        const ext = extname(ent.name).toLowerCase();
        const isEnv = ent.name.startsWith('.env');
        if (SCAN_ALLOWED_EXTS.has(ext) || isEnv) {
          out.push(full);
        }
      }
    }
  }
  return out;
}

/**
 * Scan a file's contents for secret patterns. Returns one finding per
 * (file, line, pattern) match. Patterns are matched line-by-line for
 * accurate line numbers.
 */
function scanFileForSecrets(filePath: string): SecretFinding[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const findings: SecretFinding[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) {
        findings.push({ file: relative(process.cwd(), filePath), line: i + 1, pattern: name });
      }
    }
  }
  return findings;
}

/**
 * List files in src/core/models/ that import z-ai-web-dev-sdk.
 * Only `.ts`/`.tsx`/`.js` files are scanned.
 */
function findProviderImports(modelsDir: string): string[] {
  if (!existsSync(modelsDir)) return [];
  let entries: Dirent[];
  try {
    entries = readdirSync(modelsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const leakage: string[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const ext = extname(ent.name).toLowerCase();
    if (!SCAN_ALLOWED_EXTS.has(ext)) continue;
    const full = join(modelsDir, ent.name);
    let content: string;
    try {
      content = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    // Match `import ... from 'z-ai-web-dev-sdk'` or
    // `require('z-ai-web-dev-sdk')` (single or double quotes).
    if (/(?:import|require)\s*\(?\s*[^'"]*['"]z-ai-web-dev-sdk['"]/.test(content)) {
      leakage.push(relative(process.cwd(), full));
    }
  }
  return leakage;
}

/**
 * Read the first 16 bytes of `path` and compare against the SQLite magic
 * header. Returns true if the file is a SQLite database.
 */
function isSqliteDatabase(path: string): boolean {
  try {
    // Read the file buffer, then take only the first 16 bytes for header
    // comparison. Using `encoding: null` returns a Buffer.
    const buf = readFileSync(path);
    const header = buf.subarray(0, 16).toString('latin1');
    return header === SQLITE_MAGIC;
  } catch {
    return false;
  }
}

/**
 * Audit the database security posture. Performs REAL checks:
 * - fs.stat on the DB file (mode + size)
 * - SQLite magic header detection
 * - recursive secret scan of src/
 * - import scan of src/core/models/
 *
 * Returns null/'UNAVAILABLE' fields only when the check genuinely cannot
 * be performed (never faked).
 */
export async function auditDbSecurity(): Promise<DbSecurityStatus> {
  const startTs = Date.now();

  const dbPath = (process.env.DATABASE_URL ?? '').replace('file:', '');

  // ── DB file stat + magic ─────────────────────────────────────────────
  let dbFilePermissions = 'missing';
  let dbFileSize: number | null = null;
  let isSqlite = false;
  if (dbPath && existsSync(dbPath)) {
    try {
      const st = statSync(dbPath);
      const modeOctal = (st.mode & 0o777).toString(8).padStart(3, '0');
      dbFilePermissions = modeOctal;
      dbFileSize = st.size;
      isSqlite = isSqliteDatabase(dbPath);
    } catch {
      // leave defaults
    }
  }

  // ── Encryption-at-rest: never pretend SQLCipher is in use ─────────────
  // Prisma 6 + SQLite has no SQLCipher support in v1.
  const encryptionAtRest: DbSecurityStatus['encryptionAtRest'] = 'none';

  // ── Secrets in source ─────────────────────────────────────────────────
  const files = collectSourceFiles(SCAN_ROOT);
  const allFindings: SecretFinding[] = [];
  for (const f of files) {
    const found = scanFileForSecrets(f);
    if (found.length > 0) allFindings.push(...found);
    // Safety cap on findings.
    if (allFindings.length >= 100) break;
  }
  const secretsCount = allFindings.length;
  const secretsFindings = allFindings.slice(0, 50);
  const secretsInCode = secretsCount > 0;

  // ── Provider leakage ──────────────────────────────────────────────────
  const externalDataPaths = findProviderImports(MODELS_DIR);

  // ── Recommendation (evidence-based) ───────────────────────────────────
  const recs: string[] = [];
  if (secretsInCode) {
    recs.push(
      `CRITICAL: remove ${secretsCount} secret(s) detected in source code (see secretsFindings)`,
    );
  }
  if (encryptionAtRest === 'none' && isSqlite) {
    recs.push(
      'VALIDATION_REQUIRED: use OS-level disk encryption (LUKS/FileVault/BitLocker) for the database file; field-level encryption recommended for sensitive columns',
    );
  }
  if (!isSqlite && dbPath && existsSync(dbPath)) {
    recs.push(
      'WARNING: DB file exists but is not a SQLite database — investigate format',
    );
  }
  if (dbFilePermissions === 'missing') {
    recs.push('CRITICAL: database file is missing — check DATABASE_URL');
  } else if (dbFilePermissions.endsWith('6') || dbFilePermissions.endsWith('7')) {
    // world-writable
    recs.push(
      `WARNING: DB file permissions ${dbFilePermissions} are world-writable — tighten to 600`,
    );
  }
  if (externalDataPaths.length > 3) {
    recs.push(
      `WARNING: ${externalDataPaths.length} files import z-ai-web-dev-sdk (expected ≤ 3 adapter files); review for provider leakage`,
    );
  }
  if (recs.length === 0) {
    recs.push(
      'OK: no critical findings — continue monitoring; field-level encryption remains VALIDATION_REQUIRED for v2',
    );
  }
  const recommendation = recs.join(' | ');

  const durationMs = Date.now() - startTs;

  log.info('database security audited', {
    dbFilePermissions,
    dbFileSize,
    isSqlite,
    secretsCount,
    providerImports: externalDataPaths.length,
    durationMs,
  });

  return {
    encryptionAtRest,
    dbFilePermissions,
    dbFileSize,
    secretsInCode,
    secretsCount,
    secretsFindings,
    externalDataPaths,
    recommendation,
    durationMs,
  };
}
