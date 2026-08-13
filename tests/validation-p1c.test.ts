// ===================================================================
// P1-C: Validation Service Tests
// ===================================================================
// Tests for the canonical validation boundary.
// Run with: bun run tests/validation-p1c.test.ts
// ===================================================================

import {
  validateToolResult,
  validateWorkspaceResult,
  validateArtifact,
  validateTaskCompletion,
  type ToolResultToValidate,
  type ArtifactToValidate,
} from "../src/lib/ai/validation";
import type { WorkspaceResult } from "../src/lib/ai/workspace";
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UPLOAD_DIR = "/home/z/my-project/upload";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log("  ✅ PASS:", message);
    passed++;
  } else {
    console.log("  ❌ FAIL:", message);
    failed++;
  }
}

// ─── Tool Result Validation ─────────────────────────────────────────

console.log("\n=== 1. Valid Tool Result → PASS ===");
{
  const result: ToolResultToValidate = {
    toolName: "web_search",
    success: true,
    output: { results: [] },
    durationMs: 100,
  };
  const validation = validateToolResult(result);
  assert(validation.passed === true, "valid tool result should PASS");
  assert(validation.layer === "tool", "layer should be 'tool'");
  assert(validation.checks.length >= 5, "should have at least 5 checks");
}

console.log("\n=== 2. Malformed Tool Result (success + error) → FAIL ===");
{
  const result: ToolResultToValidate = {
    toolName: "web_search",
    success: true,
    output: { results: [] },
    error: "something went wrong",
    durationMs: 100,
  };
  const validation = validateToolResult(result);
  assert(validation.passed === false, "success+error should FAIL");
  assert(validation.checks.some((c) => c.name === "no_success_with_error" && !c.passed), "should fail on no_success_with_error");
}

console.log("\n=== 3. Failed Tool Execution → correct validation ===");
{
  const result: ToolResultToValidate = {
    toolName: "file_read",
    success: false,
    output: null,
    error: "File not found",
    durationMs: 5,
  };
  const validation = validateToolResult(result);
  assert(validation.passed === true, "failed tool with proper error should PASS validation (contract is valid)");
  assert(validation.checks.some((c) => c.name === "error_present_on_failure" && c.passed), "should pass error_present check");
}

console.log("\n=== 4. Failed Tool Without Error → FAIL ===");
{
  const result: ToolResultToValidate = {
    toolName: "file_read",
    success: false,
    output: null,
    error: "",
    durationMs: 5,
  };
  const validation = validateToolResult(result);
  assert(validation.passed === false, "failed tool without error should FAIL");
  assert(validation.checks.some((c) => c.name === "error_present_on_failure" && !c.passed), "should fail error_present check");
}

console.log("\n=== 5. Tool Result Missing Duration → FAIL ===");
{
  const result: ToolResultToValidate = {
    toolName: "web_search",
    success: true,
    output: {},
    durationMs: -1,
  };
  const validation = validateToolResult(result);
  assert(validation.passed === false, "negative duration should FAIL");
}

// ─── Workspace Result Validation ────────────────────────────────────

console.log("\n=== 6. Valid Workspace Result → PASS ===");
{
  const result: WorkspaceResult = {
    success: true,
    operation: "read",
    path: "upload/test.txt",
    data: "file content",
    metadata: { size: 12, type: "file" },
  };
  const validation = validateWorkspaceResult(result);
  assert(validation.passed === true, "valid workspace result should PASS");
  assert(validation.layer === "workspace", "layer should be 'workspace'");
}

console.log("\n=== 7. Invalid Workspace Result (success + error) → FAIL ===");
{
  const result: WorkspaceResult = {
    success: true,
    operation: "read",
    error: "something failed",
  };
  const validation = validateWorkspaceResult(result);
  assert(validation.passed === false, "success+error should FAIL");
}

console.log("\n=== 8. Failed Workspace Result Without Diagnostics → FAIL ===");
{
  const result: WorkspaceResult = {
    success: false,
    operation: "write",
    error: "Write failed",
  };
  const validation = validateWorkspaceResult(result);
  assert(validation.passed === false, "failed without diagnostics code should FAIL");
}

console.log("\n=== 9. Failed Workspace Result With Diagnostics → PASS ===");
{
  const result: WorkspaceResult = {
    success: false,
    operation: "write",
    error: "Write failed",
    diagnostics: { code: "WRITE_ERROR", detail: "disk full" },
  };
  const validation = validateWorkspaceResult(result);
  assert(validation.passed === true, "failed with proper diagnostics should PASS validation");
}

console.log("\n=== 10. Workspace Result With Path Traversal → FAIL ===");
{
  const result: WorkspaceResult = {
    success: true,
    operation: "read",
    path: "../../../etc/passwd",
    data: "content",
  };
  const validation = validateWorkspaceResult(result);
  assert(validation.passed === false, "path traversal should FAIL");
  assert(validation.checks.some((c) => c.name === "path_within_sandbox" && !c.passed), "should fail path_within_sandbox");
}

// ─── Artifact Validation ────────────────────────────────────────────

console.log("\n=== 11. Valid Artifact → PASS ===");
{
  // Create a real file for validation
  await fs.writeFile(path.join(UPLOAD_DIR, "p1c-test.html"), "<h1>Test</h1>", "utf8");
  const stat = await fs.stat(path.join(UPLOAD_DIR, "p1c-test.html"));

  const artifact: ArtifactToValidate = {
    name: "p1c-test.html",
    type: "code",
    format: "html",
    content: "<h1>Test</h1>",
    filePath: "upload/p1c-test.html",
    sizeBytes: stat.size,
  };
  const validation = await validateArtifact(artifact);
  assert(validation.passed === true, "valid artifact should PASS");
  assert(validation.layer === "artifact", "layer should be 'artifact'");

  // Cleanup
  await fs.unlink(path.join(UPLOAD_DIR, "p1c-test.html"));
}

console.log("\n=== 12. Missing Artifact File → FAIL ===");
{
  const artifact: ArtifactToValidate = {
    name: "nonexistent.html",
    type: "code",
    format: "html",
    content: "<h1>Test</h1>",
    filePath: "upload/nonexistent-xyz123.html",
    sizeBytes: 15,
  };
  const validation = await validateArtifact(artifact);
  assert(validation.passed === false, "missing file should FAIL");
  assert(validation.checks.some((c) => c.name === "file_exists_on_disk" && !c.passed), "should fail file_exists_on_disk");
}

console.log("\n=== 13. Invalid Artifact Path (traversal) → FAIL ===");
{
  const artifact: ArtifactToValidate = {
    name: "test.html",
    type: "code",
    format: "html",
    content: "<h1>Test</h1>",
    filePath: "../../../etc/passwd",
    sizeBytes: 15,
  };
  const validation = await validateArtifact(artifact);
  assert(validation.passed === false, "traversal path should FAIL");
  assert(validation.checks.some((c) => c.name === "path_within_boundary" && !c.passed), "should fail path_within_boundary");
}

console.log("\n=== 14. Invalid Artifact Type → FAIL ===");
{
  await fs.writeFile(path.join(UPLOAD_DIR, "p1c-type-test.txt"), "test", "utf8");
  const stat = await fs.stat(path.join(UPLOAD_DIR, "p1c-type-test.txt"));

  const artifact: ArtifactToValidate = {
    name: "p1c-type-test.txt",
    type: "invalid_type",
    format: "text",
    content: "test",
    filePath: "upload/p1c-type-test.txt",
    sizeBytes: stat.size,
  };
  const validation = await validateArtifact(artifact);
  assert(validation.passed === false, "invalid type should FAIL");
  assert(validation.checks.some((c) => c.name === "type_is_valid" && !c.passed), "should fail type_is_valid");

  await fs.unlink(path.join(UPLOAD_DIR, "p1c-type-test.txt"));
}

console.log("\n=== 15. Size Mismatch → FAIL ===");
{
  await fs.writeFile(path.join(UPLOAD_DIR, "p1c-size-test.txt"), "small", "utf8");
  const stat = await fs.stat(path.join(UPLOAD_DIR, "p1c-size-test.txt"));

  const artifact: ArtifactToValidate = {
    name: "p1c-size-test.txt",
    type: "code",
    format: "text",
    content: "small",
    filePath: "upload/p1c-size-test.txt",
    sizeBytes: 99999, // Wrong size
  };
  const validation = await validateArtifact(artifact);
  assert(validation.passed === false, "size mismatch should FAIL");
  assert(validation.checks.some((c) => c.name === "size_matches" && !c.passed), "should fail size_matches");

  await fs.unlink(path.join(UPLOAD_DIR, "p1c-size-test.txt"));
}

console.log("\n=== 16. Null filePath → FAIL ===");
{
  const artifact: ArtifactToValidate = {
    name: "test.html",
    type: "code",
    format: "html",
    content: "<h1>Test</h1>",
    filePath: null,
    sizeBytes: 15,
  };
  const validation = await validateArtifact(artifact);
  assert(validation.passed === false, "null filePath should FAIL");
  assert(validation.checks.some((c) => c.name === "has_file_path" && !c.passed), "should fail has_file_path");
}

// ─── Task Completion Validation ─────────────────────────────────────

console.log("\n=== 17. Task With All Validations Passed → COMPLETED ===");
{
  const validation = validateTaskCompletion({
    taskTitle: "Build HTML page",
    responseContent: "Here is the HTML:\n```html\n<h1>Hello</h1>\n```",
    toolsUsed: ["file_write"],
    artifactsCreated: ["artifact-1"],
    toolValidations: [{ passed: true, layer: "tool", checks: [], summary: "OK" }],
    workspaceValidations: [{ passed: true, layer: "workspace", checks: [], summary: "OK" }],
    artifactValidations: [{ passed: true, layer: "artifact", checks: [], summary: "OK" }],
  });
  assert(validation.passed === true, "all validations passed → task should PASS");
  assert(validation.layer === "task", "layer should be 'task'");
}

console.log("\n=== 18. Task With Failed Artifact Validation → FAIL ===");
{
  const validation = validateTaskCompletion({
    taskTitle: "Build HTML page",
    responseContent: "Done!",
    toolsUsed: [],
    artifactsCreated: ["artifact-1"],
    toolValidations: [],
    workspaceValidations: [],
    artifactValidations: [{ passed: false, layer: "artifact", checks: [{ name: "file_exists", passed: false }], summary: "File not found" }],
  });
  assert(validation.passed === false, "failed artifact validation → task should FAIL");
  assert(validation.checks.some((c) => c.name === "all_artifact_validations_passed" && !c.passed), "should fail all_artifact_validations_passed");
}

console.log("\n=== 19. Task With Failed Tool Validation → FAIL ===");
{
  const validation = validateTaskCompletion({
    taskTitle: "Search the web",
    responseContent: "Here are the results",
    toolsUsed: ["web_search"],
    artifactsCreated: [],
    toolValidations: [{ passed: false, layer: "tool", checks: [{ name: "output_present", passed: false }], summary: "No output" }],
    workspaceValidations: [],
    artifactValidations: [],
  });
  assert(validation.passed === false, "failed tool validation → task should FAIL");
  assert(validation.checks.some((c) => c.name === "all_tool_validations_passed" && !c.passed), "should fail all_tool_validations_passed");
}

console.log("\n=== 20. Task With Empty Response → FAIL ===");
{
  const validation = validateTaskCompletion({
    taskTitle: "Do something",
    responseContent: "",
    toolsUsed: [],
    artifactsCreated: [],
    toolValidations: [],
    workspaceValidations: [],
    artifactValidations: [],
  });
  assert(validation.passed === false, "empty response → task should FAIL");
  assert(validation.checks.some((c) => c.name === "response_content_non_empty" && !c.passed), "should fail response_content_non_empty");
}

console.log("\n=== 21. Model Claiming Success Without Observable State → FAIL ===");
{
  // Model says "I created the file successfully" but no tools used, no artifacts
  const validation = validateTaskCompletion({
    taskTitle: "Create HTML file",
    responseContent: "I have successfully created the HTML file. It's done!",
    toolsUsed: [], // No tools used
    artifactsCreated: [], // No artifacts
    toolValidations: [],
    workspaceValidations: [],
    artifactValidations: [],
  });
  // This should PASS because response is non-empty and no validations failed
  // BUT the model claim is noted as not trusted
  assert(validation.passed === true, "model claim alone passes basic validation (no failures)");
  assert(validation.checks.some((c) => c.name === "model_claim_not_trusted" && c.passed), "should have model_claim_not_trusted check");
  assert(validation.checks.some((c) => c.name === "model_claim_not_trusted" && c.detail?.includes("observable state")), "should mention observable state");
}

console.log("\n=== 22. Task With expectedOutput Matching → PASS ===");
{
  const validation = validateTaskCompletion({
    taskTitle: "Write Python function",
    expectedOutput: "Python function that adds two numbers",
    responseContent: "Here is a Python function:\n```python\ndef add(a, b):\n    return a + b\n```",
    toolsUsed: ["file_write"],
    artifactsCreated: [],
    toolValidations: [{ passed: true, layer: "tool", checks: [], summary: "OK" }],
    workspaceValidations: [],
    artifactValidations: [],
  });
  assert(validation.passed === true, "matching expectedOutput → PASS");
  assert(validation.checks.some((c) => c.name === "response_relates_to_expected_output" && c.passed), "should pass response_relates check");
}

console.log("\n=== 23. Task With expectedOutput NOT Matching → FAIL ===");
{
  const validation = validateTaskCompletion({
    taskTitle: "Write Python function",
    expectedOutput: "Python function that adds two numbers",
    responseContent: "The weather is nice today.",
    toolsUsed: [],
    artifactsCreated: [],
    toolValidations: [],
    workspaceValidations: [],
    artifactValidations: [],
  });
  assert(validation.passed === false, "non-matching expectedOutput → FAIL");
  assert(validation.checks.some((c) => c.name === "response_relates_to_expected_output" && !c.passed), "should fail response_relates check");
}

// ─── Integration: Real Artifact Validation ─────────────────────────

console.log("\n=== 24. Integration: Real Artifact From DB ===");
{
  // Create a conversation + artifact
  const conv = await prisma.conversation.create({ data: { title: "P1-C Test", goal: "test", status: "active" } });

  // Create a real file
  await fs.writeFile(path.join(UPLOAD_DIR, "p1c-integration.html"), "<h1>Integration Test</h1>", "utf8");
  const stat = await fs.stat(path.join(UPLOAD_DIR, "p1c-integration.html"));

  const artifact = await prisma.artifact.create({
    data: {
      conversationId: conv.id,
      name: "p1c-integration.html",
      type: "code",
      format: "html",
      content: "<h1>Integration Test</h1>",
      filePath: "upload/p1c-integration.html",
      sizeBytes: stat.size,
    },
  });

  // Validate the real artifact
  const validation = await validateArtifact(artifact);
  assert(validation.passed === true, "real artifact should PASS validation");
  assert(validation.checks.some((c) => c.name === "file_exists_on_disk" && c.passed), "file should exist on disk");

  // Cleanup
  await prisma.artifact.delete({ where: { id: artifact.id } });
  await prisma.conversation.delete({ where: { id: conv.id } });
  await fs.unlink(path.join(UPLOAD_DIR, "p1c-integration.html"));
}

// ─── Summary ───────────────────────────────────────────────────────

console.log("\n=== Summary ===");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${passed + failed}`);

await prisma.$disconnect();

if (failed > 0) {
  console.log("\n❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED");
  process.exit(0);
}
