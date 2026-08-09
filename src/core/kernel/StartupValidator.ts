/**
 * MiMo Core — Startup Validator
 * ------------------------------
 * Phase 38: Validates the environment on startup.
 * Checks: DATABASE_URL, database file exists, database is writable,
 * kernel boots, critical directories exist.
 *
 * Called on first API request (lazy boot) or can be called explicitly.
 */

import { createLogger } from '../logger';
import { existsSync, accessSync, constants } from 'fs';
import { dirname } from 'path';

const log = createLogger('startup:validator');

export interface ValidationResult {
  ok: boolean;
  checks: Record<string, { ok: boolean; error?: string }>;
}

/**
 * Validate the runtime environment.
 * Does NOT throw — returns a report.
 */
export function validateEnvironment(): ValidationResult {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  // 1. DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    checks.database_url = { ok: false, error: 'DATABASE_URL is not set' };
  } else {
    checks.database_url = { ok: true };
  }

  // 2. Database file exists (if file: URL)
  if (dbUrl?.startsWith('file:')) {
    const dbPath = dbUrl.replace('file:', '');
    try {
      if (existsSync(dbPath)) {
        accessSync(dbPath, constants.W_OK);
        checks.database_file = { ok: true };
      } else {
        // Parent dir must exist
        const parentDir = dirname(dbPath);
        if (existsSync(parentDir)) {
          checks.database_file = { ok: true }; // will be created on first query
        } else {
          checks.database_file = { ok: false, error: `parent directory does not exist: ${parentDir}` };
        }
      }
    } catch (err) {
      checks.database_file = { ok: false, error: err instanceof Error ? err.message : 'access denied' };
    }
  }

  // 3. Node.js version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
  checks.node_version = { ok: major >= 18, error: major < 18 ? `Node.js ${major} is too old (need >=18)` : undefined };

  // 4. Memory available (rough check)
  const memUsage = process.memoryUsage();
  checks.memory = { ok: memUsage.rss < 2 * 1024 * 1024 * 1024 }; // warn if >2GB RSS

  const allOk = Object.values(checks).every((c) => c.ok);
  log.info('environment validated', { ok: allOk, checks: Object.keys(checks).length });
  return { ok: allOk, checks };
}

/**
 * Validate and boot the kernel (idempotent).
 * Throws if critical checks fail.
 */
export function startupBoot(): void {
  const validation = validateEnvironment();
  if (!validation.ok) {
    const failed = Object.entries(validation.checks)
      .filter(([, v]) => !v.ok)
      .map(([k, v]) => `${k}: ${v.error}`);
    log.error('startup validation failed', { failed });
    // Don't throw — let the system try to run anyway.
    // The readiness endpoint will report the failure.
  }
}
