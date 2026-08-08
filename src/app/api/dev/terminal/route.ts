import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const FORBIDDEN_PATTERNS = [
  /\brm\s+-rf\s+\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bhalt\b/,
  /\b:\(\)\s*\{.*\}/, // fork bomb
  /\b>\s*\/dev\/sd[a-z]/,
  /\bchmod\s+777\s+\//,
  /\bchown\s+-R\s+.*\s+\//,
]

const WORKSPACE_DIR = '/home/z/my-project/workspace'
const EXEC_TIMEOUT_MS = 10_000

/**
 * POST /api/dev/terminal
 * Body: { command: string }
 * Returns: { stdout, stderr, exitCode, durationMs }
 *
 * Executes shell commands in workspace/ directory.
 * Security: blocks dangerous patterns, 10s timeout, workspace-only cwd.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const command = String(body.command ?? '').trim()

    if (!command) {
      return NextResponse.json({ error: 'command is required' }, { status: 400 })
    }

    if (command.length > 500) {
      return NextResponse.json({ error: 'Command too long (max 500 chars)' }, { status: 400 })
    }

    // Security check
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(command)) {
        return NextResponse.json({
          stdout: '',
          stderr: `🔒 الأمان: النمط ممنوع في الـ terminal.`,
          exitCode: -1,
          durationMs: 0,
        })
      }
    }

    const start = Date.now()
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: EXEC_TIMEOUT_MS,
        cwd: WORKSPACE_DIR,
        maxBuffer: 256 * 1024,
        env: {
          ...process.env,
          PATH: process.env.PATH,
          HOME: WORKSPACE_DIR,
        },
      })

      return NextResponse.json({
        stdout: stdout.slice(0, 10000),
        stderr: stderr.slice(0, 3000),
        exitCode: 0,
        durationMs: Date.now() - start,
      })
    } catch (e: any) {
      const durationMs = Date.now() - start
      if (e.killed || e.signal === 'SIGTERM') {
        return NextResponse.json({
          stdout: (e.stdout ?? '').slice(0, 5000),
          stderr: `⏱️ Timeout (${EXEC_TIMEOUT_MS / 1000}s)`,
          exitCode: -1,
          durationMs,
        })
      }
      return NextResponse.json({
        stdout: (e.stdout ?? '').slice(0, 10000),
        stderr: (e.stderr ?? e.message ?? '').slice(0, 3000),
        exitCode: e.code ?? 1,
        durationMs,
      })
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Terminal error: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
