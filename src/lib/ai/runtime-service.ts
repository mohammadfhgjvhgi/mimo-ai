// ===================================================================
// MiMo AI — RuntimeService
// ===================================================================
// P3-1/P3-2/P3-3: Executes build/test/lint/typecheck commands in project
// workspaces and captures output.
//
// All commands run in the project's workspace directory:
//   /home/z/my-project/workspace/projects/{projectId}/
//
// Security:
//   - projectId validated via WorkspaceService.isValidProjectId (indirectly
//     via PROJECTS_ROOT path construction)
//   - Commands are fixed (not user-controlled) — no shell injection
//   - Output is captured and returned as structured results
//   - Timeout prevents hanging processes
// ===================================================================

import { spawn } from "child_process";
import path from "path";
import { PROJECTS_ROOT } from "./workspace";

export interface BuildResult {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

export interface TestResult extends BuildResult {
  passed: number;
  failed: number;
  total: number;
}

export interface LintResult extends BuildResult {
  errorCount: number;
  warningCount: number;
}

const DEFAULT_TIMEOUT = 60000; // 60 seconds

/**
 * Get the project workspace directory path.
 * Validates projectId format to prevent path traversal.
 */
function getProjectDir(projectId: string): string {
  // Reuse the same regex as WorkspaceService
  const SAFE_PROJECT_ID_REGEX = /^c[a-z0-9]{20,31}$/;
  if (!SAFE_PROJECT_ID_REGEX.test(projectId)) {
    throw new Error(`Invalid project ID: ${projectId}`);
  }
  return path.join(PROJECTS_ROOT, projectId);
}

/**
 * Execute a command in the project directory and capture output.
 * Returns stdout, stderr, exit code, and duration.
 */
async function executeCommand(
  projectId: string,
  command: string,
  args: string[],
  timeout: number = DEFAULT_TIMEOUT
): Promise<BuildResult> {
  const projectDir = getProjectDir(projectId);
  const start = Date.now();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd: projectDir,
      env: { ...process.env, FORCE_COLOR: "0", CI: "true" },
      shell: false,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 5000);
    }, timeout);

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
      // Prevent memory exhaustion
      if (stdout.length > 500_000) {
        stdout = stdout.slice(0, 500_000) + "\n[output truncated]";
      }
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > 500_000) {
        stderr = stderr.slice(0, 500_000) + "\n[output truncated]";
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        command: `${command} ${args.join(" ")}`,
        stdout,
        stderr: stderr + `\n[spawn error: ${err.message}]`,
        exitCode: null,
        durationMs: Date.now() - start,
      });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        success: !timedOut && code === 0,
        command: `${command} ${args.join(" ")}`,
        stdout,
        stderr: timedOut ? stderr + "\n[process timed out]" : stderr,
        exitCode: code,
        durationMs: Date.now() - start,
      });
    });
  });
}

// ─── P3-1: Build ────────────────────────────────────────────────────

/**
 * Build a project using bun build or npm build.
 * Tries `bun run build` first, falls back to `npm run build`.
 */
export async function build(projectId: string): Promise<BuildResult> {
  try {
    // Try bun first (faster, already installed)
    const result = await executeCommand(projectId, "bun", ["run", "build"]);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      command: "bun run build",
      stdout: "",
      stderr: msg,
      exitCode: null,
      durationMs: 0,
    };
  }
}

// ─── P3-2: Test ─────────────────────────────────────────────────────

/**
 * Run tests in a project and parse pass/fail counts.
 * Uses `bun test` or falls back to `npm test`.
 */
export async function test(projectId: string): Promise<TestResult> {
  try {
    const result = await executeCommand(projectId, "bun", ["test"]);

    // Parse output for pass/fail counts
    const passMatch = result.stdout.match(/(\d+)\s+pass/i);
    const failMatch = result.stdout.match(/(\d+)\s+fail/i);

    const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1], 10) : 0;

    return {
      ...result,
      passed,
      failed,
      total: passed + failed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      command: "bun test",
      stdout: "",
      stderr: msg,
      exitCode: null,
      durationMs: 0,
      passed: 0,
      failed: 0,
      total: 0,
    };
  }
}

// ─── P3-3: Lint + Typecheck ─────────────────────────────────────────

/**
 * Run ESLint on a project.
 */
export async function lint(projectId: string): Promise<LintResult> {
  try {
    const result = await executeCommand(projectId, "bunx", ["eslint", "."]);

    // Parse ESLint output for error/warning counts
    const errorMatch = result.stdout.match(/(\d+)\s+error/i);
    const warningMatch = result.stdout.match(/(\d+)\s+warning/i);

    const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;
    const warningCount = warningMatch ? parseInt(warningMatch[1], 10) : 0;

    return {
      ...result,
      errorCount,
      warningCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      command: "bunx eslint .",
      stdout: "",
      stderr: msg,
      exitCode: null,
      durationMs: 0,
      errorCount: 0,
      warningCount: 0,
    };
  }
}

/**
 * Run TypeScript type-checking on a project.
 */
export async function typecheck(projectId: string): Promise<BuildResult> {
  try {
    const result = await executeCommand(projectId, "bunx", ["tsc", "--noEmit"]);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      command: "bunx tsc --noEmit",
      stdout: "",
      stderr: msg,
      exitCode: null,
      durationMs: 0,
    };
  }
}
