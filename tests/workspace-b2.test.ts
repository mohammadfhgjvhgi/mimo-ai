// ===================================================================
// P1-B B2: Read/Search Migration Tests
// ===================================================================
// Tests proving file_read, file_search, code_search work through
// WorkspaceService with security enforcement.
// Run with: bun run tests/workspace-b2.test.ts
// ===================================================================

import { executeTool } from "../src/lib/ai/tools";
import { promises as fs } from "fs";
import path from "path";

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

async function setup() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, "b2-test.txt"), "Hello B2 test\nLine 2\nLine 3", "utf8");
  await fs.writeFile(path.join(UPLOAD_DIR, "b2-code.ts"), "const hello = 'world';\nconst test = 'b2';", "utf8");
}

async function cleanup() {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, "b2-test.txt"));
    await fs.unlink(path.join(UPLOAD_DIR, "b2-code.ts"));
  } catch { /* ignore */ }
}

console.log("\n=== Setup ===");
await setup();

// ─── file_read through WorkspaceService ─────────────────────────────

console.log("\n=== 1. file_read — Valid File ===");
{
  const result = await executeTool("file_read", { path: "upload/b2-test.txt" });
  assert(!result.error, "file_read should not error");
  const output = result.output as { path: string; size: number; content: string };
  assert(output.content.includes("Hello B2"), "content should include 'Hello B2'");
  assert(output.size > 0, "size should be > 0");
  assert(output.path.includes("b2-test.txt"), "path should include filename");
}

console.log("\n=== 2. file_read — Source File (src/) ===");
{
  const result = await executeTool("file_read", { path: "src/lib/ai/model.ts" });
  assert(!result.error, "file_read src/ should not error");
  const output = result.output as { content: string };
  assert(output.content.includes("ZAI"), "content should include 'ZAI'");
}

console.log("\n=== 3. file_read — .env Blocked ===");
{
  const result = await executeTool("file_read", { path: ".env" });
  assert(result.error !== undefined, ".env should be blocked");
  assert((result.error ?? "").includes("denied") || (result.error ?? "").includes("blocked"), "error should mention denied/blocked");
}

console.log("\n=== 4. file_read — .db Blocked ===");
{
  const result = await executeTool("file_read", { path: "db/custom.db" });
  assert(result.error !== undefined, ".db should be blocked");
}

console.log("\n=== 5. file_read — .git Blocked ===");
{
  const result = await executeTool("file_read", { path: ".git/config" });
  assert(result.error !== undefined, ".git/config should be blocked");
}

console.log("\n=== 6. file_read — node_modules Blocked ===");
{
  const result = await executeTool("file_read", { path: "node_modules/react/index.js" });
  assert(result.error !== undefined, "node_modules should be blocked");
}

console.log("\n=== 7. file_read — .next Blocked ===");
{
  const result = await executeTool("file_read", { path: ".next/server/page.js" });
  assert(result.error !== undefined, ".next should be blocked");
}

console.log("\n=== 8. file_read — Traversal Blocked ===");
{
  const result = await executeTool("file_read", { path: "../../../etc/passwd" });
  assert(result.error !== undefined, "traversal should be blocked");
}

console.log("\n=== 9. file_read — Non-Existent File ===");
{
  const result = await executeTool("file_read", { path: "upload/nonexistent-xyz.txt" });
  assert(result.error !== undefined, "non-existent file should error");
}

console.log("\n=== 10. file_read — Output Contract ===");
{
  const result = await executeTool("file_read", { path: "upload/b2-test.txt" });
  assert(!result.error, "should succeed");
  const output = result.output as { path: string; size: number; content: string };
  assert(typeof output.path === "string", "path should be string");
  assert(typeof output.size === "number", "size should be number");
  assert(typeof output.content === "string", "content should be string");
}

// ─── file_search through WorkspaceService ───────────────────────────

console.log("\n=== 11. file_search — Valid Pattern ===");
{
  const result = await executeTool("file_search", { pattern: "b2-test", maxResults: 10 });
  assert(!result.error, "file_search should not error");
  const output = result.output as { results: Array<{ path: string }>; count: number };
  assert(output.count > 0, "should find at least 1 result");
  assert(output.results.some((r) => r.path.includes("b2-test")), "should find b2-test.txt");
}

console.log("\n=== 12. file_search — .env Excluded ===");
{
  const result = await executeTool("file_search", { pattern: ".env", maxResults: 20 });
  assert(!result.error, "file_search should not error");
  const output = result.output as { results: Array<{ path: string }> };
  const envFound = output.results.some((r) => r.path.includes(".env"));
  assert(envFound === false, ".env should NOT appear in search results");
}

console.log("\n=== 13. file_search — .git Excluded ===");
{
  const result = await executeTool("file_search", { pattern: "config", maxResults: 20 });
  assert(!result.error, "file_search should not error");
  const output = result.output as { results: Array<{ path: string }> };
  const gitFound = output.results.some((r) => r.path.includes(".git/"));
  assert(gitFound === false, ".git/ files should NOT appear in search results");
}

console.log("\n=== 14. file_search — node_modules Excluded ===");
{
  const result = await executeTool("file_search", { pattern: "react", maxResults: 20 });
  assert(!result.error, "file_search should not error");
  const output = result.output as { results: Array<{ path: string }> };
  const nmFound = output.results.some((r) => r.path.includes("node_modules/"));
  assert(nmFound === false, "node_modules/ files should NOT appear in search results");
}

console.log("\n=== 15. file_search — Output Contract ===");
{
  const result = await executeTool("file_search", { pattern: "b2", maxResults: 5 });
  assert(!result.error, "should succeed");
  const output = result.output as { pattern: string; results: Array<{ path: string; size: number }>; count: number };
  assert(typeof output.pattern === "string", "pattern should be string");
  assert(Array.isArray(output.results), "results should be array");
  assert(typeof output.count === "number", "count should be number");
  if (output.results.length > 0) {
    assert(typeof output.results[0].path === "string", "result.path should be string");
    assert(typeof output.results[0].size === "number", "result.size should be number");
  }
}

// ─── code_search through WorkspaceService ───────────────────────────

console.log("\n=== 16. code_search — Valid Query ===");
{
  const result = await executeTool("code_search", { query: "hello", maxResults: 10 });
  assert(!result.error, "code_search should not error");
  const output = result.output as { results: Array<{ file: string; line: number; content: string }>; count: number };
  assert(output.count > 0, "should find at least 1 match");
  assert(output.results.some((r) => r.file.includes("b2-code.ts")), "should find match in b2-code.ts");
}

console.log("\n=== 17. code_search — .env Content Excluded ===");
{
  const result = await executeTool("code_search", { query: "DATABASE_URL", maxResults: 20 });
  assert(!result.error, "code_search should not error");
  const output = result.output as { results: Array<{ file: string }> };
  const envFound = output.results.some((r) => r.file.includes(".env"));
  assert(envFound === false, ".env should NOT appear in code search results");
}

console.log("\n=== 18. code_search — .db Excluded ===");
{
  const result = await executeTool("code_search", { query: "sqlite", maxResults: 20 });
  assert(!result.error, "code_search should not error");
  const output = result.output as { results: Array<{ file: string }> };
  const dbFound = output.results.some((r) => r.file.includes(".db"));
  assert(dbFound === false, ".db files should NOT appear in code search results");
}

console.log("\n=== 19. code_search — node_modules Excluded ===");
{
  const result = await executeTool("code_search", { query: "export", maxResults: 20 });
  assert(!result.error, "code_search should not error");
  const output = result.output as { results: Array<{ file: string }> };
  const nmFound = output.results.some((r) => r.file.includes("node_modules/"));
  assert(nmFound === false, "node_modules/ should NOT appear in code search results");
}

console.log("\n=== 20. code_search — Output Contract ===");
{
  const result = await executeTool("code_search", { query: "const", maxResults: 5 });
  assert(!result.error, "should succeed");
  const output = result.output as { query: string; results: Array<{ file: string; line: number; content: string }>; count: number };
  assert(typeof output.query === "string", "query should be string");
  assert(Array.isArray(output.results), "results should be array");
  assert(typeof output.count === "number", "count should be number");
  if (output.results.length > 0) {
    assert(typeof output.results[0].file === "string", "result.file should be string");
    assert(typeof output.results[0].line === "number", "result.line should be number");
    assert(typeof output.results[0].content === "string", "result.content should be string");
  }
}

// ─── No Direct fs.* Access Verification ─────────────────────────────

console.log("\n=== 21. No Direct fs.* in file_read ===");
{
  // Read the source file and verify no fs.* calls in file_read execute function
  const source = await fs.readFile("src/lib/ai/tools/index.ts", "utf8");
  const fileReadSection = source.substring(
    source.indexOf("file_read:"),
    source.indexOf("file_write:")
  );
  const hasFsCall = /fs\.\w+\(/.test(fileReadSection);
  assert(hasFsCall === false, "file_read should not have direct fs.* calls");
}

console.log("\n=== 22. No Direct fs.* in file_search ===");
{
  const source = await fs.readFile("src/lib/ai/tools/index.ts", "utf8");
  const fileSearchSection = source.substring(
    source.indexOf("file_search:"),
    source.indexOf("code_search:")
  );
  const hasFsCall = /fs\.\w+\(/.test(fileSearchSection);
  assert(hasFsCall === false, "file_search should not have direct fs.* calls");
}

console.log("\n=== 23. No Direct fs.* in code_search ===");
{
  const source = await fs.readFile("src/lib/ai/tools/index.ts", "utf8");
  const codeSearchSection = source.substring(
    source.indexOf("code_search:"),
    source.indexOf("patch:")
  );
  const hasFsCall = /fs\.\w+\(/.test(codeSearchSection);
  assert(hasFsCall === false, "code_search should not have direct fs.* calls");
}

console.log("\n=== 24. No safeJoin in tools ===");
{
  const source = await fs.readFile("src/lib/ai/tools/index.ts", "utf8");
  // Should only appear in comment, not as function call
  const hasSafeJoinCall = /[^/\s]safeJoin\s*\(/.test(source);
  assert(hasSafeJoinCall === false, "safeJoin() should not be called in tools (migrated to WorkspaceService)");
}

console.log("\n=== 25. No blockedPatterns in tools ===");
{
  const source = await fs.readFile("src/lib/ai/tools/index.ts", "utf8");
  // Should only appear in comment
  const hasBlockedPatterns = /const blockedPatterns/.test(source);
  assert(hasBlockedPatterns === false, "blockedPatterns should not be defined in tools (migrated to WorkspaceService)");
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
