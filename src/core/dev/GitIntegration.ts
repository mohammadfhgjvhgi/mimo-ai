/**
 * MiMo Core — Development Git Integration
 * -----------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * Read + safe write git operations on a DevProject sandbox. All git
 * operations go through TerminalService.executeCommand so they inherit
 * RuntimeGateway sandboxing (path-traversal, dangerous-command, SSRF).
 *
 * Hard-blocked operations (refuse with SandboxError, code=PROFILE_VIOLATION):
 *   - `git push --force` / `git push -f`
 *   - `git reset --hard`
 *   - `git clean -fdx` / `git clean -fd`
 *   - `git branch -D` (force delete)
 *   - `git checkout -- .` (destructive)
 *   - any command containing `--force` or `-f` push/reset/clean
 *
 * Refuses entirely if profile.allowGitAccess is false.
 */

import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';
import { getProfileLimits, SandboxError, type SandboxProfile } from './SandboxManager';
import { executeCommand } from './TerminalService';
import { writeLog } from './LogService';

const log = createLogger('dev:git');

// ─── Types ───

export interface GitStatus {
  branch: string | null;
  modified: string[];
  staged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface GitHistoryEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitCommitResult {
  commitHash: string | null;
  branch: string | null;
}

// ─── Hard-blocked destructive patterns ───

const BLOCKED_PATTERNS: RegExp[] = [
  /\bgit\s+push\s+(--force|-f|--force-with-lease)\b/,
  /\bgit\s+push\s+-\S*f\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[a-z]*f[a-z]*d[a-z]*\b/,
  /\bgit\s+clean\s+-[a-z]*d[a-z]*f[a-z]*\b/,
  /\bgit\s+clean\s+-fdx\b/,
  /\bgit\s+clean\s+-fd\b/,
  /\bgit\s+branch\s+-D\b/,
  /\bgit\s+checkout\s+--\s+\.\s*$/,
  /\bgit\s+checkout\s+--\s+\*\s*$/,
];

function assertGitAllowed(profile: SandboxProfile): void {
  const limits = getProfileLimits(profile);
  if (!limits.allowGitAccess) {
    throw new SandboxError(
      `git access not permitted in profile '${profile}'`,
      'PROFILE_VIOLATION',
      { profile, action: 'git' },
    );
  }
}

function assertSafeGitCommand(command: string): void {
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(command)) {
      throw new SandboxError(
        `destructive git command blocked: ${command}`,
        'PROFILE_VIOLATION',
        { command, pattern: re.source },
      );
    }
  }
}

// ─── runGit helper ───

async function runGit(
  projectId: string,
  args: string,
  profile: SandboxProfile,
): Promise<{ output: string; exitCode: number | null; durationMs: number }> {
  assertGitAllowed(profile);
  const cmd = `git ${args}`;
  assertSafeGitCommand(cmd);
  const result = await executeCommand(projectId, cmd, profile);
  return { output: result.output, exitCode: result.exitCode, durationMs: result.durationMs };
}

// ─── getStatus ───

export async function getStatus(
  projectId: string,
  profile: SandboxProfile,
): Promise<GitStatus> {
  const result = await runGit(projectId, 'status --porcelain=v2 --branch', profile);
  const status: GitStatus = {
    branch: null,
    modified: [],
    staged: [],
    untracked: [],
    ahead: 0,
    behind: 0,
  };

  const lines = result.output.split('\n');
  for (const line of lines) {
    if (line.startsWith('# branch.head')) {
      status.branch = line.slice('# branch.head '.length).trim();
    } else if (line.startsWith('# branch.ab')) {
      const m = line.match(/\+(\d+)\s-(\d+)/);
      if (m) {
        status.ahead = parseInt(m[1] ?? '0', 10);
        status.behind = parseInt(m[2] ?? '0', 10);
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // Changed or renamed. Format: `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
      const parts = line.split('\t');
      const path = parts[1] ?? '';
      const xy = (parts[0]?.split(' ')[1] ?? '').trim();
      if (xy[0] !== '.') status.staged.push(path); // X != . → staged
      if (xy[1] !== '.') status.modified.push(path); // Y != . → modified (worktree)
    } else if (line.startsWith('u ')) {
      const parts = line.split('\t');
      const path = parts[1] ?? '';
      status.modified.push(path);
      status.staged.push(path);
    } else if (line.startsWith('? ')) {
      const path = line.slice(2).trim();
      status.untracked.push(path);
    }
  }

  // Persist branch on DevProject for diagnostics
  if (status.branch) {
    await db.devProject.update({
      where: { id: projectId },
      data: { gitBranch: status.branch },
    }).catch(() => { /* ignore */ });
  }

  return status;
}

// ─── getDiff ───

export async function getDiff(
  projectId: string,
  profile: SandboxProfile,
  path?: string,
  staged = false,
): Promise<string> {
  const args = staged ? 'diff --staged' : 'diff';
  const cmd = path ? `${args} -- ${escapeShellArg(path)}` : args;
  const result = await runGit(projectId, cmd, profile);
  return result.output;
}

// ─── getBranches ───

export async function getBranches(
  projectId: string,
  profile: SandboxProfile,
): Promise<string[]> {
  const result = await runGit(projectId, 'branch --list', profile);
  return result.output
    .split('\n')
    .map((l) => l.replace(/^\*?\s+/, '').trim())
    .filter((l) => l.length > 0);
}

// ─── commit ───

export async function commit(
  projectId: string,
  message: string,
  profile: SandboxProfile,
): Promise<GitCommitResult> {
  if (!message || message.trim().length === 0) {
    throw new SandboxError('commit message is required', 'PROFILE_VIOLATION', { action: 'git.commit' });
  }
  if (message.length > 500) {
    throw new SandboxError('commit message too long (max 500 chars)', 'PROFILE_VIOLATION', { action: 'git.commit' });
  }
  // Reject --amend to public branches / --force in message
  if (/--amend|--force|^-\w*f/i.test(message)) {
    throw new SandboxError(
      'commit message contains forbidden flag',
      'PROFILE_VIOLATION',
      { action: 'git.commit', message },
    );
  }

  const safeMsg = escapeShellArg(message.trim());
  const addResult = await runGit(projectId, 'add -A', profile);
  void addResult;
  const commitResult = await runGit(projectId, `commit -m ${safeMsg}`, profile);

  // Read resulting HEAD
  let commitHash: string | null = null;
  let branch: string | null = null;
  try {
    const hashRes = await runGit(projectId, 'rev-parse HEAD', profile);
    commitHash = hashRes.output.trim().split('\n')[0] ?? null;
  } catch { /* ignore */ }
  try {
    const brRes = await runGit(projectId, 'rev-parse --abbrev-ref HEAD', profile);
    branch = brRes.output.trim().split('\n')[0] ?? null;
  } catch { /* ignore */ }

  await writeLog(projectId, 'terminal', 'info', `git commit: ${message.slice(0, 100)}`, {
    commitHash,
    branch,
    exitCode: commitResult.exitCode,
  });

  mimoEvents.emit(
    createEvent('dev.git.committed' as never, { projectId, commitHash, branch }, 'dev:git'),
  );
  log.info('commit', { projectId, commitHash, branch });
  return { commitHash, branch };
}

// ─── getHistory ───

export async function getHistory(
  projectId: string,
  profile: SandboxProfile,
  limit = 20,
): Promise<GitHistoryEntry[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const fmt = '%H%x1f%an%x1f%ad%x1f%s';
  const result = await runGit(projectId, `log -n ${safeLimit} --pretty=format:${fmt}`, profile);
  const entries: GitHistoryEntry[] = [];
  for (const line of result.output.split('\n')) {
    const parts = line.split('\x1f');
    if (parts.length >= 4) {
      entries.push({
        hash: parts[0] ?? '',
        author: parts[1] ?? '',
        date: parts[2] ?? '',
        message: parts[3] ?? '',
      });
    }
  }
  return entries;
}

// ─── shell escape ───

/**
 * Escape a string so it can be safely passed as a single shell argument.
 * Uses single-quote wrapping with internal `'` → `'\''` escaping.
 * This is the standard safe pattern for sh/bash.
 */
export function escapeShellArg(s: string): string {
  if (s.length === 0) return "''";
  // Reject anything that smells of injection
  if (/[\x00-\x1f\x7f]/.test(s)) {
    throw new SandboxError('control characters not allowed in shell arg', 'PROFILE_VIOLATION', { arg: s });
  }
  // Wrap in single quotes; escape internal single quotes
  return `'${s.replace(/'/g, "'\\''")}'`;
}
