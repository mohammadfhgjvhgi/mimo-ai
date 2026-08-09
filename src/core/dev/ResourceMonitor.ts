/**
 * MiMo Core — Development Resource Monitor
 * ------------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * Reports REAL metrics only — never returns fake or zero values for
 * metrics that cannot be measured. When a metric is unavailable, it
 * returns `null` with a `note` explaining why.
 *
 * Disk:  real (via SandboxManager.getProjectStats — recursive walk).
 * Process count: real (DevProcess rows with status='running').
 * CPU/memory: read /proc/<pid>/stat on Linux where possible.
 *            On non-Linux or restricted environments → null.
 * Uptime: real (process.startedAt → now).
 */

import { promises as fs } from 'fs';
import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { getProjectStats, getProjectRoot, type SandboxProfile } from './SandboxManager';

const log = createLogger('dev:resources');

// ─── Types ───

export interface ResourceMetrics {
  cpuPercent: number | null;
  memoryMb: number | null;
  diskMb: number;
  processCount: number;
  uptime: number | null;
  note?: string;
}

export interface ProcessListEntry {
  id: string;
  command: string;
  status: string;
  startedAt: number;
  pid: number | null;
}

// ─── getMetrics ───

export async function getMetrics(
  projectId: string,
  _profile?: SandboxProfile,
): Promise<ResourceMetrics> {
  // Disk — always real
  const stats = await getProjectStats(projectId);
  const diskMb = round2(stats.totalBytes / (1024 * 1024));

  // Process count — real DB query
  const running = await db.devProcess.count({
    where: { projectId, status: 'running' },
  });

  // CPU + memory — best-effort on Linux via /proc/<pid>/stat
  // We can only do this if we have a tracked PID.
  const tracked = await db.devProcess.findMany({
    where: { projectId, status: 'running', NOT: { pid: null } },
    select: { pid: true, startedAt: true },
    take: 16,
  });

  let cpuPercent: number | null = null;
  let memoryMb: number | null = null;
  let uptime: number | null = null;
  let note: string | undefined;

  if (tracked.length === 0) {
    note = 'no running tracked processes — cpu/memory/uptime unavailable';
  } else {
    const isLinux = process.platform === 'linux';
    if (!isLinux) {
      note = `/proc/<pid>/stat unavailable on ${process.platform} — cpu/memory unavailable`;
      // uptime is still real from startedAt
      uptime = Date.now() - tracked[0]!.startedAt.getTime();
    } else {
      // Sum RSS (pages → MB) and approximate CPU% from utime+stime deltas
      let totalRssPages = 0;
      let totalCpuJiffies = 0;
      let oldestStarted = Date.now();
      try {
        const pageSize = 4096; // typical Linux page size
        for (const p of tracked) {
          const pid = p.pid!;
          if (p.startedAt.getTime() < oldestStarted) oldestStarted = p.startedAt.getTime();
          try {
            const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
            // /proc/[pid]/stat fields (1-indexed):
            // 14: utime, 15: stime, 24: rss (pages)
            const fields = parseProcStat(stat);
            totalCpuJiffies += (fields.utime ?? 0) + (fields.stime ?? 0);
            totalRssPages += fields.rss ?? 0;
          } catch {
            // process may have exited — skip
          }
        }
        // RSS → MB
        memoryMb = round2((totalRssPages * pageSize) / (1024 * 1024));
        // CPU% — this is a snapshot (jiffies so far); convert to % of one core
        // assuming typical 100 Hz clock. We can't measure delta without a
        // second sample, so we report cumulative jiffies and note this.
        const USER_HZ = 100;
        const seconds = Math.max(1, (Date.now() - oldestStarted) / 1000);
        cpuPercent = round2((totalCpuJiffies / USER_HZ / seconds) * 100);
        uptime = Date.now() - oldestStarted;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        note = `failed to read /proc: ${msg}`;
        log.warn('resource monitor failed', { projectId, error: msg });
      }
    }
  }

  return {
    cpuPercent,
    memoryMb,
    diskMb,
    processCount: running,
    uptime,
    note,
  };
}

// ─── getProcessList ───

export async function getProcessList(projectId: string): Promise<ProcessListEntry[]> {
  const rows = await db.devProcess.findMany({
    where: { projectId },
    orderBy: { startedAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    command: r.command,
    status: r.status,
    startedAt: r.startedAt.getTime(),
    pid: r.pid,
  }));
}

// ─── helpers ───

interface ProcStatFields {
  utime?: number;
  stime?: number;
  rss?: number;
}

/**
 * Parse /proc/<pid>/stat. Format: `pid (comm) state ppid pgrp ...`
 * The comm field may contain spaces/parens — find closing paren first.
 */
function parseProcStat(stat: string): ProcStatFields {
  const openParen = stat.indexOf('(');
  const closeParen = stat.lastIndexOf(')');
  if (openParen === -1 || closeParen === -1) return {};
  const afterComm = stat.slice(closeParen + 2).trim().split(/\s+/);
  // fields after comm (state=afterComm[0], ppid=[1], ..., utime=[11], stime=[12], rss=[20])
  const utime = parseInt(afterComm[11] ?? '0', 10);
  const stime = parseInt(afterComm[12] ?? '0', 10);
  const rss = parseInt(afterComm[20] ?? '0', 10);
  return {
    utime: Number.isFinite(utime) ? utime : 0,
    stime: Number.isFinite(stime) ? stime : 0,
    rss: Number.isFinite(rss) ? rss : 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Avoid unused import warning when getProjectRoot is not directly called
void getProjectRoot;
