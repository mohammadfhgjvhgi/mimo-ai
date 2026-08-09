/**
 * MiMo Core — Development Test Runner
 * ------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * Runs the project's test command via RuntimeGateway (sandboxed) and
 * parses pass/fail counts from common test runner output formats
 * (jest / vitest / mocha / pytest).
 *
 * Records DevTestRun rows + DevLog entries on the 'test' channel.
 */

import { randomUUID } from 'crypto';
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

const log = createLogger('dev:test');

// ─── Types ───

export interface DevTestRunRecord {
  id: string;
  projectId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  command: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number | null;
  output: string;
  startedAt: number;
  finishedAt: number | null;
}

export interface TestCommand {
  command: string;
  language: 'shell';
}

// ─── getTestCommand ───

export function getTestCommand(
  project: DevProjectRecord,
  _profile: SandboxProfile,
): TestCommand {
  const pm = project.packageManager;
  const pmBin = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm';
  switch (project.type) {
    case 'nextjs':
    case 'node':
      return { command: `${pmBin} test`, language: 'shell' };
    case 'python':
      return { command: `python -m pytest -q`, language: 'shell' };
    case 'static':
    case 'generic':
    default:
      return { command: `echo 'no tests configured'`, language: 'shell' };
  }
}

// ─── runTests ───

export async function runTests(
  projectId: string,
  profile: SandboxProfile = 'standard',
): Promise<DevTestRunRecord> {
  const limits = getProfileLimits(profile);
  if (!limits.allowProcessExec) {
    throw new SandboxError(
      `profile '${profile}' does not allow process execution`,
      'PROFILE_VIOLATION',
      { profile, action: 'test' },
    );
  }

  const project = await getProject(projectId);
  if (!project) {
    throw new SandboxError(`project not found: ${projectId}`, 'PROJECT_NOT_FOUND', { projectId });
  }

  // Detect type if generic (mirror build system behaviour)
  let effectiveType: DevProjectType = project.type;
  if (effectiveType === 'generic') {
    // Lightweight detection without importing detectProjectType — re-use file check
    const fs = await import('fs/promises');
    const path = await import('path');
    const root = getProjectRoot(projectId);
    const hasPkg = await fs.stat(path.join(root, 'package.json')).then(() => true).catch(() => false);
    if (hasPkg) {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as Record<string, unknown>;
        const deps = { ...(pkg.dependencies as Record<string, unknown> | undefined), ...(pkg.devDependencies as Record<string, unknown> | undefined) };
        effectiveType = deps && 'next' in deps ? 'nextjs' : 'node';
      } catch {
        effectiveType = 'node';
      }
    } else {
      const hasReqs = await fs.stat(path.join(root, 'requirements.txt')).then(() => true).catch(() => false);
      if (hasReqs) effectiveType = 'python';
    }
  }
  if (effectiveType !== project.type) {
    await db.devProject.update({ where: { id: projectId }, data: { type: effectiveType } });
  }

  const { command } = getTestCommand({ ...project, type: effectiveType }, profile);
  const workspacePath = getProjectRoot(projectId);

  const testRun = await db.devTestRun.create({
    data: { projectId, status: 'running', command, output: '' },
  });

  await writeLog(projectId, 'test', 'info', `test run started: ${command}`, {
    runId: testRun.id,
    command,
    profile,
  });

  const requestId = `test-${testRun.id}-${randomUUID()}`;
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
    log.error('test execution threw', { projectId, runId: testRun.id, error: msg });
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
  const { passed, failed, skipped } = parseTestOutput(output, effectiveType);

  const finalStatus: DevTestRunRecord['status'] =
    result.status === 'COMPLETED'
      ? failed === 0
        ? 'passed'
        : 'failed'
      : result.status === 'TIMEOUT' || result.status === 'CANCELLED'
        ? 'cancelled'
        : 'failed';

  const updated = await db.devTestRun.update({
    where: { id: testRun.id },
    data: {
      status: finalStatus,
      passed,
      failed,
      skipped,
      durationMs: result.durationMs,
      output,
      finishedAt: new Date(),
    },
  });

  const summary = {
    passed,
    failed,
    skipped,
    durationMs: result.durationMs,
    timestamp: Date.now(),
  };
  await db.devProject.update({
    where: { id: projectId },
    data: { lastTest: JSON.stringify(summary) },
  });

  await writeLog(
    projectId,
    'test',
    finalStatus === 'passed' ? 'info' : 'error',
    `test run ${finalStatus}: ${passed} passed, ${failed} failed, ${skipped} skipped`,
    { runId: testRun.id, passed, failed, skipped, durationMs: result.durationMs },
    undefined,
    requestId,
  );

  mimoEvents.emit(
    createEvent('dev.test.completed' as never, { projectId, runId: testRun.id, status: finalStatus, passed, failed }, 'dev:test', requestId),
  );

  return toRecord(updated);
}

// ─── listTestRuns / getTestRun ───

export async function listTestRuns(projectId: string, limit = 20): Promise<DevTestRunRecord[]> {
  const rows = await db.devTestRun.findMany({
    where: { projectId },
    orderBy: { startedAt: 'desc' },
    take: Math.min(limit, 100),
  });
  return rows.map(toRecord);
}

export async function getTestRun(projectId: string, runId: string): Promise<DevTestRunRecord | null> {
  const row = await db.devTestRun.findFirst({ where: { id: runId, projectId } });
  return row ? toRecord(row) : null;
}

// ─── helpers ───

type PrismaDevTestRun = {
  id: string;
  projectId: string;
  status: string;
  command: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number | null;
  output: string;
  startedAt: Date;
  finishedAt: Date | null;
};

function toRecord(r: PrismaDevTestRun): DevTestRunRecord {
  return {
    id: r.id,
    projectId: r.projectId,
    status: r.status as DevTestRunRecord['status'],
    command: r.command,
    passed: r.passed,
    failed: r.failed,
    skipped: r.skipped,
    durationMs: r.durationMs,
    output: r.output,
    startedAt: r.startedAt.getTime(),
    finishedAt: r.finishedAt?.getTime() ?? null,
  };
}

/**
 * Parse test runner output for pass/fail/skip counts.
 * Supports:
 *   - jest/vitest: `Tests: 12 passed, 3 failed, 1 skipped`
 *   - mocha: `passing 12`, `failing 3`, `pending 1`
 *   - pytest: `===== 12 passed, 3 failed, 1 skipped in 1.23s =====`
 *   - generic fallback: count "PASS" / "FAIL" / "SKIP" tokens
 */
function parseTestOutput(
  output: string,
  type: DevProjectType,
): { passed: number; failed: number; skipped: number } {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  if (type === 'python') {
    // pytest: `===== 12 passed, 3 failed, 1 skipped in 1.23s =====`
    const m = output.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/);
    if (m) {
      passed = parseInt(m[1] ?? '0', 10);
      failed = parseInt(m[2] ?? '0', 10);
      skipped = parseInt(m[3] ?? '0', 10);
      return { passed, failed, skipped };
    }
    // Sometimes only "X passed"
    const m2 = output.match(/(\d+)\s+passed/);
    if (m2) passed = parseInt(m2[1] ?? '0', 10);
    const m3 = output.match(/(\d+)\s+failed/);
    if (m3) failed = parseInt(m3[1] ?? '0', 10);
    const m4 = output.match(/(\d+)\s+skipped/);
    if (m4) skipped = parseInt(m4[1] ?? '0', 10);
    return { passed, failed, skipped };
  }

  // jest/vitest: `Tests: 12 passed, 3 failed, 1 skipped`
  const m = output.match(/Tests:\s+(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+(?:skipped|pending))?/i);
  if (m) {
    passed = parseInt(m[1] ?? '0', 10);
    failed = parseInt(m[2] ?? '0', 10);
    skipped = parseInt(m[3] ?? '0', 10);
    return { passed, failed, skipped };
  }

  // mocha: `passing 12`, `failing 3`, `pending 1`
  const mPass = output.match(/(\d+)\s+passing/);
  const mFail = output.match(/(\d+)\s+failing/);
  const mSkip = output.match(/(\d+)\s+pending/);
  if (mPass || mFail || mSkip) {
    passed = mPass ? parseInt(mPass[1] ?? '0', 10) : 0;
    failed = mFail ? parseInt(mFail[1] ?? '0', 10) : 0;
    skipped = mSkip ? parseInt(mSkip[1] ?? '0', 10) : 0;
    return { passed, failed, skipped };
  }

  // Generic fallback
  const passTokens = output.match(/\bPASS\b/g);
  const failTokens = output.match(/\bFAIL\b/g);
  const skipTokens = output.match(/\bSKIP(?:PED)?\b/g);
  passed = passTokens ? passTokens.length : 0;
  failed = failTokens ? failTokens.length : 0;
  skipped = skipTokens ? skipTokens.length : 0;

  return { passed, failed, skipped };
}
