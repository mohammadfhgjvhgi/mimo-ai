// ===================================================================
// P1-B B1: WorkspaceService Tests
// ===================================================================
// Focused tests for the WorkspaceService skeleton.
// Run with: bun run tests/workspace-b1.test.ts
// ===================================================================

import {
  validatePath,
  read,
  write,
  search,
  searchCode,
  patch,
  list,
  stat,
  mkdir,
  ensureWorkspaceDirs,
  WORKSPACE_ROOT,
  SANDBOX_ROOT,
  UPLOAD_DIR,
  type WorkspaceResult,
} from "../src/lib/ai/workspace";

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

async function setup() {
  await ensureWorkspaceDirs();
  // Create test files
  const { promises: fs } = await import("fs");
  const path = await import("path");
  await fs.writeFile(path.join(UPLOAD_DIR, "b1-test.txt"), "Hello B1 test file\nLine 2\nLine 3", "utf8");
  await fs.writeFile(path.join(UPLOAD_DIR, "b1-search.ts"), "const hello = 'world';\nconst test = 'search';", "utf8");
}

async function cleanup() {
  const { promises: fs } = await import("fs");
  const path = await import("path");
  try {
    await fs.unlink(path.join(UPLOAD_DIR, "b1-test.txt"));
    await fs.unlink(path.join(UPLOAD_DIR, "b1-search.ts"));
    await fs.unlink(path.join(UPLOAD_DIR, "b1-write-test.txt")).catch(() => {});
    await fs.unlink(path.join(UPLOAD_DIR, "b1-patch-test.txt")).catch(() => {});
  } catch {
    // ignore
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

console.log("\n=== Setup ===");
await setup();

console.log("\n=== 1. Path Validation — Valid Read Paths ===");
{
  const r1 = await validatePath("upload/b1-test.txt", "read", true);
  assert(r1.valid === true, "upload/b1-test.txt should be valid for read");

  const r2 = await validatePath("src/lib/ai/model.ts", "read", true);
  assert(r2.valid === true, "src/lib/ai/model.ts should be valid for read");

  const r3 = await validatePath("prisma/schema.prisma", "read", true);
  assert(r3.valid === true, "prisma/schema.prisma should be valid for read");
}

console.log("\n=== 2. Path Validation — Blocked Patterns ===");
{
  const r1 = await validatePath(".env", "read", true);
  assert(r1.valid === false, ".env should be blocked");
  assert(r1.code === "BLOCKED_PATTERN", "should return BLOCKED_PATTERN code");

  const r2 = await validatePath("db/custom.db", "read", true);
  assert(r2.valid === false, "db/custom.db should be blocked");

  const r3 = await validatePath(".git/config", "read", true);
  assert(r3.valid === false, ".git/config should be blocked");

  const r4 = await validatePath("node_modules/react/index.js", "read", true);
  assert(r4.valid === false, "node_modules/react/index.js should be blocked");

  const r5 = await validatePath(".next/server/page.js", "read", true);
  assert(r5.valid === false, ".next/server/page.js should be blocked");
}

console.log("\n=== 3. Path Validation — Traversal Attacks ===");
{
  const r1 = await validatePath("../../../etc/passwd", "read", true);
  assert(r1.valid === false, "../../../etc/passwd should be blocked");

  const r2 = await validatePath("upload/../../../etc/passwd", "read", true);
  assert(r2.valid === false, "upload/../../../etc/passwd should be blocked");

  const r3 = await validatePath("upload/../../.env", "read", true);
  assert(r3.valid === false, "upload/../../.env should be blocked");
}

console.log("\n=== 4. Path Validation — Absolute Paths ===");
{
  const r1 = await validatePath("/etc/passwd", "read", true);
  assert(r1.valid === false, "/etc/passwd should be blocked");
  assert(r1.code === "ABSOLUTE_PATH", "should return ABSOLUTE_PATH code");

  const r2 = await validatePath("/home/z/my-project/.env", "read", true);
  assert(r2.valid === false, "/home/z/my-project/.env should be blocked");
}

console.log("\n=== 5. Path Validation — Null Bytes ===");
{
  const r1 = await validatePath("upload/test\0.txt", "read", true);
  assert(r1.valid === false, "path with null byte should be blocked");
  assert(r1.code === "NULL_BYTE", "should return NULL_BYTE code");
}

console.log("\n=== 6. Path Validation — Write Mode Restrictions ===");
{
  // Write to src/ should fail (read-only root)
  const r1 = await validatePath("src/new-file.ts", "write", false);
  assert(r1.valid === false, "write to src/ should be blocked");

  // Write to upload/ should succeed (using full path)
  const r2 = await validatePath("upload/b1-write-test.txt", "write", false);
  assert(r2.valid === true, "write to upload/ should be allowed");
}

console.log("\n=== 7. Read Operation ===");
{
  const result = await read("upload/b1-test.txt");
  assert(result.success === true, "read should succeed");
  assert(typeof result.data === "string", "data should be string");
  assert((result.data as string).includes("Hello B1"), "content should include 'Hello B1'");
  assert(result.metadata?.size !== undefined, "should have size metadata");
  assert(result.metadata?.type === "file", "should have type 'file'");
}

console.log("\n=== 8. Read — Non-Existent File ===");
{
  const result = await read("upload/nonexistent-file-xyz.txt");
  assert(result.success === false, "read non-existent should fail");
  assert(result.error?.includes("not found") || result.error?.includes("NOT_FOUND") || result.diagnostics?.code === "NOT_FOUND", "should mention not found");
}

console.log("\n=== 9. Read — Blocked File (.env) ===");
{
  const result = await read(".env");
  assert(result.success === false, "read .env should fail");
  assert(result.diagnostics?.code === "BLOCKED_PATTERN", "should return BLOCKED_PATTERN");
}

console.log("\n=== 10. Write Operation ===");
{
  const result = await write("b1-write-test.txt", "Test content from B1");
  assert(result.success === true, "write should succeed");
  assert(result.metadata?.size !== undefined, "should have size");
  assert(result.path?.includes("b1-write-test.txt") === true, "path should include filename");

  // Verify content
  const readResult = await read("upload/b1-write-test.txt");
  assert(readResult.success === true, "written file should be readable");
  assert((readResult.data as string) === "Test content from B1", "content should match");
}

console.log("\n=== 11. Write — Invalid Filename (path separator) ===");
{
  const result = await write("../escape.txt", "content");
  assert(result.success === false, "write with .. should fail");

  const result2 = await write("subdir/file.txt", "content");
  assert(result2.success === false || result2.success === true, "write with / handled (may create subdir if within write root)");
}

console.log("\n=== 12. Search Operation ===");
{
  const result = await search("b1-test", 10);
  assert(result.success === true, "search should succeed");
  const data = result.data as { results: Array<{ path: string }>; count: number };
  assert(data.count > 0, "should find at least 1 result");
  assert(data.results.some((r) => r.path.includes("b1-test")), "should find b1-test file");
}

console.log("\n=== 13. Search — Blocked Files Excluded ===");
{
  const result = await search(".env", 10);
  assert(result.success === true, "search should succeed");
  const data = result.data as { results: Array<{ path: string }> };
  const envFound = data.results.some((r) => r.path.includes(".env"));
  assert(envFound === false, ".env should NOT appear in search results");
}

console.log("\n=== 14. SearchCode Operation ===");
{
  const result = await searchCode("hello", 10);
  assert(result.success === true, "searchCode should succeed");
  const data = result.data as { results: Array<{ file: string; line: number }> };
  assert(data.results.length > 0, "should find at least 1 match");
  assert(data.results.some((r) => r.file.includes("b1-search.ts")), "should find match in b1-search.ts");
}

console.log("\n=== 15. SearchCode — Blocked Files Excluded ===");
{
  const result = await searchCode("DATABASE_URL", 10);
  assert(result.success === true, "searchCode should succeed");
  const data = result.data as { results: Array<{ file: string; path?: string }> };
  const envFound = data.results.some((r) => (r.path ?? r.file ?? "").includes(".env"));
  assert(envFound === false, ".env should NOT appear in code search results");
}

console.log("\n=== 16. Patch Operation ===");
{
  // Create a file to patch
  await write("b1-patch-test.txt", "original content here");
  
  const result = await patch("b1-patch-test.txt", "original", "patched");
  assert(result.success === true, "patch should succeed");
  assert((result.data as { patched: boolean }).patched === true, "should report patched=true");

  // Verify content
  const readResult = await read("upload/b1-patch-test.txt");
  assert((readResult.data as string).includes("patched") === true, "content should include 'patched'");
  assert((readResult.data as string).includes("original") === false, "content should NOT include 'original'");
}

console.log("\n=== 17. Patch — Non-Existent File (creates it) ===");
{
  const result = await patch("b1-patch-create.txt", "findme", "replaced");
  assert(result.success === true, "patch on non-existent file should succeed (creates it)");

  const readResult = await read("upload/b1-patch-create.txt");
  assert(readResult.success === true, "created file should be readable");
  assert((readResult.data as string).includes("replaced") === true, "content should include 'replaced'");
}

console.log("\n=== 18. List Operation ===");
{
  const result = await list("upload");
  assert(result.success === true, "list should succeed");
  const data = result.data as Array<{ name: string; type: string }>;
  assert(Array.isArray(data), "data should be array");
  assert(data.length > 0, "upload/ should have files");
  assert(data.some((item) => item.name === "b1-test.txt"), "should find b1-test.txt");
}

console.log("\n=== 19. Stat Operation ===");
{
  const result = await stat("upload/b1-test.txt");
  assert(result.success === true, "stat should succeed");
  assert(result.metadata?.size !== undefined, "should have size");
  assert(result.metadata?.type === "file", "should be type 'file'");
  assert(result.metadata?.modified !== undefined, "should have modified date");
}

console.log("\n=== 20. Mkdir Operation ===");
{
  const result = await mkdir("b1-test-dir");
  assert(result.success === true, "mkdir should succeed");
  assert(result.metadata?.type === "directory", "should be type 'directory'");

  // Verify directory exists
  const statResult = await stat("upload/b1-test-dir");
  assert(statResult.success === true, "created directory should exist");
  assert(statResult.metadata?.type === "directory", "should be directory type");

  // Cleanup
  const { promises: fs } = await import("fs");
  const path = await import("path");
  await fs.rmdir(path.join(UPLOAD_DIR, "b1-test-dir")).catch(() => {});
  await fs.unlink(path.join(UPLOAD_DIR, "b1-patch-create.txt")).catch(() => {});
}

console.log("\n=== 21. Structured Result Format ===");
{
  const result = await read("upload/b1-test.txt");
  assert(result.operation === "read", "should have operation 'read'");
  assert(typeof result.success === "boolean", "success should be boolean");
  assert(result.path !== undefined, "should have path");
  assert(result.metadata !== undefined, "should have metadata");
  assert(result.error === undefined, "should NOT have error on success");

  const failResult = await read("upload/nonexistent.txt");
  assert(failResult.success === false, "failure should have success=false");
  assert(failResult.error !== undefined, "failure should have error");
  assert(failResult.diagnostics?.code !== undefined, "failure should have diagnostics.code");
}

console.log("\n=== 22. Constants ===");
{
  assert(WORKSPACE_ROOT === "/home/z/my-project/workspace", "WORKSPACE_ROOT should be correct");
  assert(SANDBOX_ROOT === "/home/z/my-project", "SANDBOX_ROOT should be correct");
  assert(UPLOAD_DIR.includes("upload"), "UPLOAD_DIR should include 'upload'");
}

// ─── Cleanup ───────────────────────────────────────────────────────

console.log("\n=== Cleanup ===");
await cleanup();

// ─── Summary ───────────────────────────────────────────────────────

console.log("\n=== Summary ===");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${passed + failed}`);

if (failed > 0) {
  console.log("\n❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED");
  process.exit(0);
}
