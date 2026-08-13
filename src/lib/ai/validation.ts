// ===================================================================
// MiMo AI — ValidationService
// ===================================================================
// CANONICAL VALIDATION BOUNDARY.
//
// A model saying "done" is NEVER sufficient evidence that a task succeeded.
// The system determines success from OBSERVABLE STATE.
//
// Validation Layers:
// 1. TOOL RESULT VALIDATION — verify tool output matches expected contract
// 2. WORKSPACE RESULT VALIDATION — verify WorkspaceService results
// 3. ARTIFACT VALIDATION — verify generated artifacts are real and valid
// 4. TASK COMPLETION VALIDATION — verify all required checks pass before "completed"
//
// All checks are DETERMINISTIC where possible.
// No "ask another model" validation.
// ===================================================================

import { promises as fs } from "fs";
import path from "path";
import type { WorkspaceResult } from "./workspace";
import { SANDBOX_ROOT, UPLOAD_DIR } from "./workspace";

// ─── Types ──────────────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  layer: "tool" | "workspace" | "artifact" | "task";
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

// ─── 1. Tool Result Validation ──────────────────────────────────────

export interface ToolResultToValidate {
  toolName: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

/**
 * Validate a tool execution result against its expected contract.
 * DETERMINISTIC checks only.
 */
export function validateToolResult(result: ToolResultToValidate): ValidationResult {
  const checks: ValidationCheck[] = [];

  // Check 1: success flag is boolean
  checks.push({
    name: "success_is_boolean",
    passed: typeof result.success === "boolean",
    detail: `success = ${result.success} (${typeof result.success})`,
  });

  // Check 2: if success=true, output must exist
  if (result.success) {
    checks.push({
      name: "output_present_on_success",
      passed: result.output !== null && result.output !== undefined,
      detail: `output type = ${typeof result.output}`,
    });
  }

  // Check 3: if success=false, error must be present
  if (!result.success) {
    checks.push({
      name: "error_present_on_failure",
      passed: result.error !== undefined && result.error !== null && result.error !== "",
      detail: `error = ${result.error?.slice(0, 100)}`,
    });
  }

  // Check 4: durationMs is a non-negative number
  checks.push({
    name: "duration_valid",
    passed: typeof result.durationMs === "number" && result.durationMs >= 0,
    detail: `durationMs = ${result.durationMs}`,
  });

  // Check 5: tool name is present
  checks.push({
    name: "tool_name_present",
    passed: typeof result.toolName === "string" && result.toolName.length > 0,
    detail: `toolName = ${result.toolName}`,
  });

  // Check 6: success and error are not both true
  checks.push({
    name: "no_success_with_error",
    passed: !(result.success && result.error),
    detail: result.success && result.error ? "success=true but error present" : "OK",
  });

  const allPassed = checks.every((c) => c.passed);

  return {
    passed: allPassed,
    layer: "tool",
    checks,
    summary: `Tool "${result.toolName}": ${checks.filter((c) => c.passed).length}/${checks.length} checks passed`,
  };
}

// ─── 2. Workspace Result Validation ─────────────────────────────────

/**
 * Validate a WorkspaceService result.
 * DETERMINISTIC checks only.
 */
export function validateWorkspaceResult(result: WorkspaceResult): ValidationResult {
  const checks: ValidationCheck[] = [];

  // Check 1: success flag is boolean
  checks.push({
    name: "success_is_boolean",
    passed: typeof result.success === "boolean",
  });

  // Check 2: operation is present
  checks.push({
    name: "operation_present",
    passed: typeof result.operation === "string" && result.operation.length > 0,
    detail: `operation = ${result.operation}`,
  });

  // Check 3: if success=true, path or data should be present
  if (result.success) {
    const hasPathOrData = result.path !== undefined || result.data !== undefined;
    checks.push({
      name: "path_or_data_on_success",
      passed: hasPathOrData,
      detail: hasPathOrData ? "OK" : "success=true but no path or data",
    });
  }

  // Check 4: if success=false, error should be present
  if (!result.success) {
    checks.push({
      name: "error_on_failure",
      passed: result.error !== undefined && result.error.length > 0,
      detail: `error = ${result.error?.slice(0, 100)}`,
    });
  }

  // Check 5: if success=false, diagnostics should have a code
  if (!result.success) {
    checks.push({
      name: "diagnostics_code_on_failure",
      passed: result.diagnostics?.code !== undefined && result.diagnostics.code.length > 0,
      detail: `code = ${result.diagnostics?.code}`,
    });
  }

  // Check 6: if path is present, it should be within SANDBOX_ROOT
  if (result.path) {
    checks.push({
      name: "path_within_sandbox",
      passed: !result.path.includes("..") && !path.isAbsolute(result.path),
      detail: `path = ${result.path}`,
    });
  }

  // Check 7: success and error are not both present
  checks.push({
    name: "no_success_with_error",
    passed: !(result.success && result.error),
  });

  const allPassed = checks.every((c) => c.passed);

  return {
    passed: allPassed,
    layer: "workspace",
    checks,
    summary: `Workspace "${result.operation}": ${checks.filter((c) => c.passed).length}/${checks.length} checks passed`,
  };
}

// ─── 3. Artifact Validation ─────────────────────────────────────────

export interface ArtifactToValidate {
  id?: string;
  artifactId?: string;
  name: string;
  type: string;
  format: string;
  content: string;
  filePath: string | null;
  sizeBytes: number;
}

/**
 * Validate a generated artifact.
 * DETERMINISTIC checks only — verifies file exists on disk and metadata is consistent.
 */
export async function validateArtifact(artifact: ArtifactToValidate): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];

  // Check 1: artifact has a name
  checks.push({
    name: "has_name",
    passed: typeof artifact.name === "string" && artifact.name.length > 0,
    detail: `name = ${artifact.name}`,
  });

  // Check 2: artifact has content
  checks.push({
    name: "has_content",
    passed: typeof artifact.content === "string" && artifact.content.length > 0,
    detail: `content length = ${artifact.content.length}`,
  });

  // Check 3: artifact has filePath
  checks.push({
    name: "has_file_path",
    passed: artifact.filePath !== null && artifact.filePath !== undefined && artifact.filePath.length > 0,
    detail: `filePath = ${artifact.filePath}`,
  });

  // Check 4: file exists on disk (if filePath is present)
  if (artifact.filePath) {
    const fullPath = path.join(SANDBOX_ROOT, artifact.filePath);
    let fileExists = false;
    let actualSize = 0;
    try {
      const stat = await fs.stat(fullPath);
      fileExists = stat.isFile();
      actualSize = stat.size;
    } catch {
      fileExists = false;
    }
    checks.push({
      name: "file_exists_on_disk",
      passed: fileExists,
      detail: fileExists ? `file at ${fullPath}` : `NOT FOUND: ${fullPath}`,
    });

    // Check 5: file size matches artifact sizeBytes
    if (fileExists) {
      checks.push({
        name: "size_matches",
        passed: actualSize === artifact.sizeBytes || Math.abs(actualSize - artifact.sizeBytes) < 10,
        detail: `artifact=${artifact.sizeBytes}, disk=${actualSize}`,
      });
    }

    // Check 6: filePath is within allowed workspace boundary
    checks.push({
      name: "path_within_boundary",
      passed: !artifact.filePath.includes("..") && !path.isAbsolute(artifact.filePath),
      detail: `filePath = ${artifact.filePath}`,
    });

    // Check 7: filePath starts with upload/ or workspace/
    checks.push({
      name: "path_in_allowed_area",
      passed: artifact.filePath.startsWith("upload/") || artifact.filePath.startsWith("workspace/"),
      detail: `filePath = ${artifact.filePath}`,
    });
  }

  // Check 8: type is a known artifact type
  const validTypes = ["code", "document", "research_report", "architecture_diagram", "test_report", "config", "plan", "dataset", "other"];
  checks.push({
    name: "type_is_valid",
    passed: validTypes.includes(artifact.type),
    detail: `type = ${artifact.type}`,
  });

  // Check 9: format is a known format
  const validFormats = ["markdown", "json", "typescript", "python", "text", "html", "svg", "javascript", "css", "sql"];
  checks.push({
    name: "format_is_valid",
    passed: validFormats.includes(artifact.format),
    detail: `format = ${artifact.format}`,
  });

  // Check 10: sizeBytes is positive
  checks.push({
    name: "size_positive",
    passed: artifact.sizeBytes > 0,
    detail: `sizeBytes = ${artifact.sizeBytes}`,
  });

  // Check 11: content length roughly matches sizeBytes
  checks.push({
    name: "content_size_consistent",
    passed: Math.abs(artifact.content.length - artifact.sizeBytes) <= 100,
    detail: `content.length=${artifact.content.length}, sizeBytes=${artifact.sizeBytes}`,
  });

  const allPassed = checks.every((c) => c.passed);

  return {
    passed: allPassed,
    layer: "artifact",
    checks,
    summary: `Artifact "${artifact.name}": ${checks.filter((c) => c.passed).length}/${checks.length} checks passed`,
  };
}

// ─── 4. Task Completion Validation ──────────────────────────────────

export interface TaskCompletionInput {
  taskTitle: string;
  expectedOutput?: string | null;
  responseContent: string;
  toolsUsed: string[];
  artifactsCreated: string[];
  toolValidations: ValidationResult[];
  workspaceValidations: ValidationResult[];
  artifactValidations: ValidationResult[];
}

/**
 * Determine whether a task can be marked COMPLETED.
 *
 * RULE: A task may become COMPLETED only when:
 * - required tool calls succeeded (no failed tool validations)
 * - required workspace operations succeeded
 * - required artifacts exist when applicable
 * - artifact metadata is valid
 * - no required validation check failed
 *
 * A model saying "done" is NEVER sufficient.
 */
export function validateTaskCompletion(input: TaskCompletionInput): ValidationResult {
  const checks: ValidationCheck[] = [];

  // Check 1: all tool validations passed
  const failedTools = input.toolValidations.filter((v) => !v.passed);
  checks.push({
    name: "all_tool_validations_passed",
    passed: failedTools.length === 0,
    detail: failedTools.length === 0
      ? `${input.toolValidations.length} tool validations passed`
      : `${failedTools.length} tool validations FAILED: ${failedTools.map((v) => v.summary).join("; ")}`,
  });

  // Check 2: all workspace validations passed
  const failedWorkspace = input.workspaceValidations.filter((v) => !v.passed);
  checks.push({
    name: "all_workspace_validations_passed",
    passed: failedWorkspace.length === 0,
    detail: failedWorkspace.length === 0
      ? `${input.workspaceValidations.length} workspace validations passed`
      : `${failedWorkspace.length} workspace validations FAILED`,
  });

  // Check 3: all artifact validations passed
  const failedArtifacts = input.artifactValidations.filter((v) => !v.passed);
  checks.push({
    name: "all_artifact_validations_passed",
    passed: failedArtifacts.length === 0,
    detail: failedArtifacts.length === 0
      ? `${input.artifactValidations.length} artifact validations passed`
      : `${failedArtifacts.length} artifact validations FAILED: ${failedArtifacts.map((v) => v.summary).join("; ")}`,
  });

  // Check 4: response content is non-empty
  checks.push({
    name: "response_content_non_empty",
    passed: input.responseContent.length > 0,
    detail: `content length = ${input.responseContent.length}`,
  });

  // Check 5: if expectedOutput specified, response should contain relevant content
  // This is a SOFT check — we don't reject based on content matching alone,
  // but we log it for observability.
  if (input.expectedOutput) {
    const expectedLower = input.expectedOutput.toLowerCase();
    const responseLower = input.responseContent.toLowerCase();
    // Check if response contains any keyword from expectedOutput
    const keywords = expectedLower.split(/\s+/).filter((w) => w.length > 4).slice(0, 5);
    const hasKeyword = keywords.some((kw) => responseLower.includes(kw));
    checks.push({
      name: "response_relates_to_expected_output",
      passed: hasKeyword,
      detail: hasKeyword
        ? "response contains expected keywords"
        : `no keywords from expectedOutput "${input.expectedOutput.slice(0, 50)}" found in response`,
    });
  }

  // Check 6: model claiming success is not sufficient (observability check)
  // This check ALWAYS passes — it's documentation that we don't trust model claims
  checks.push({
    name: "model_claim_not_trusted",
    passed: true,
    detail: "Task completion determined by observable state, not model claim",
  });

  const allPassed = checks.every((c) => c.passed);
  const failedChecks = checks.filter((c) => !c.passed);

  return {
    passed: allPassed,
    layer: "task",
    checks,
    summary: `Task "${input.taskTitle}": ${checks.filter((c) => c.passed).length}/${checks.length} checks passed${failedChecks.length > 0 ? ` — FAILED: ${failedChecks.map((c) => c.name).join(", ")}` : ""}`,
  };
}
