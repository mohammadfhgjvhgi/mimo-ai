// ===================================================================
// P1-B B3: Write/Edit Migration Tests
// ===================================================================
// Tests proving file_write, patch, and execution-engine work through
// WorkspaceService with security enforcement.
// Run with: bun run tests/workspace-b3.test.ts
// ===================================================================

import { executeTool } from "../src/lib/ai/tools";
import { executeResponse } from "../src/lib/ai/execution-engine";
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const UPLOAD_DIR = "/home/z/my-project/upload";
const prisma = new PrismaClient();

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

async function cleanup() {
  const files = [
    "b3-write-test.txt",
    "b3-patch-test.txt",
    "b3-patch-create.txt",
    "b3-traversal-test.txt",
  ];
  for (const f of files) {
    try { await fs.unlink(path.join(UPLOAD_DIR, f)); } catch { /* ignore */ }
  }
}

// ─── file_write through WorkspaceService ────────────────────────────

console.log("\n=== 1. file_write — Valid Write ===");
{
  const result = await executeTool("file_write", {
    filename: "b3-write-test.txt",
    content: "Hello B3 write test",
  });
  assert(!result.error, "file_write should not error");
  const output = result.output as { path: string; absolutePath: string; size: number };
  assert(output.path.includes("b3-write-test.txt"), "path should include filename");
  assert(output.size > 0, "size should be > 0");
  assert(output.absolutePath !== undefined, "absolutePath should be defined");

  // Verify file exists on disk
  const content = await fs.readFile(path.join(UPLOAD_DIR, "b3-write-test.txt"), "utf8");
  assert(content === "Hello B3 write test", "file content should match");
}

console.log("\n=== 2. file_write — Path Traversal Blocked ===");
{
  const result = await executeTool("file_write", {
    filename: "../escape.txt",
    content: "should not write",
  });
  assert(result.error !== undefined, "traversal should be blocked");
}

console.log("\n=== 3. file_write — Path Separator Blocked ===");
{
  const result = await executeTool("file_write", {
    filename: "subdir/test.txt",
    content: "should not write",
  });
  assert(result.error !== undefined, "path separator should be blocked");
}

console.log("\n=== 4. file_write — .env Blocked ===");
{
  const result = await executeTool("file_write", {
    filename: ".env",
    content: "should not write",
  });
  // .env is blocked by WorkspaceService blockedPatterns
  assert(result.error !== undefined, ".env write should be blocked");
}

console.log("\n=== 5. file_write — Output Contract ===");
{
  const result = await executeTool("file_write", {
    filename: "b3-write-test.txt",
    content: "contract test",
  });
  assert(!result.error, "should succeed");
  const output = result.output as { path: string; absolutePath: string; size: number };
  assert(typeof output.path === "string", "path should be string");
  assert(typeof output.absolutePath === "string", "absolutePath should be string");
  assert(typeof output.size === "number", "size should be number");
}

// ─── patch through WorkspaceService ─────────────────────────────────

console.log("\n=== 6. patch — Valid Patch (existing file) ===");
{
  // Create a file first
  await executeTool("file_write", {
    filename: "b3-patch-test.txt",
    content: "original content here",
  });

  const result = await executeTool("patch", {
    filename: "b3-patch-test.txt",
    find: "original",
    replace: "patched",
  });
  assert(!result.error, "patch should not error");
  const output = result.output as { path: string; size: number; patched: boolean };
  assert(output.patched === true, "should report patched=true");

  // Verify content
  const content = await fs.readFile(path.join(UPLOAD_DIR, "b3-patch-test.txt"), "utf8");
  assert(content.includes("patched"), "content should include 'patched'");
  assert(!content.includes("original"), "content should NOT include 'original'");
}

console.log("\n=== 7. patch — Non-Existent File (creates it) ===");
{
  const result = await executeTool("patch", {
    filename: "b3-patch-create.txt",
    find: "nonexistent",
    replace: "created content",
  });
  assert(!result.error, "patch on non-existent file should succeed");
  const output = result.output as { patched: boolean };
  assert(output.patched === false, "should report patched=false (find not found, appended)");

  // Verify file was created
  const content = await fs.readFile(path.join(UPLOAD_DIR, "b3-patch-create.txt"), "utf8");
  assert(content.includes("created content"), "file should contain replace content");
}

console.log("\n=== 8. patch — Path Traversal Blocked ===");
{
  const result = await executeTool("patch", {
    filename: "../escape.txt",
    find: "a",
    replace: "b",
  });
  assert(result.error !== undefined, "traversal should be blocked");
}

console.log("\n=== 9. patch — Output Contract ===");
{
  const result = await executeTool("patch", {
    filename: "b3-patch-test.txt",
    find: "patched",
    replace: "updated",
  });
  assert(!result.error, "should succeed");
  const output = result.output as { path: string; size: number; patched: boolean };
  assert(typeof output.path === "string", "path should be string");
  assert(typeof output.size === "number", "size should be number");
  assert(typeof output.patched === "boolean", "patched should be boolean");
}

// ─── execution-engine through WorkspaceService ─────────────────────

console.log("\n=== 10. execution-engine — File Creation ===");
{
  // Create a conversation for FK constraint
  const conv = await prisma.conversation.create({
    data: { title: "B3 Test Conv", goal: "test", status: "active" },
  });

  const result = await executeResponse(
    'Here is some code:\n\n```html\n<h1>Hello B3</h1>\n<p>Test page</p>\n```\n\nDone.',
    { conversationId: conv.id, agentName: "developer" }
  );

  assert(result.filesCreated.length > 0, "should create at least 1 file");
  assert(result.artifactsCreated > 0, "should create at least 1 artifact");

  const file = result.filesCreated[0];
  assert(file.filename !== undefined, "file should have filename");
  assert(file.size > 0, "file should have size > 0");
  assert(file.artifactId !== undefined, "file should have artifactId");

  // Verify file exists on disk
  const diskFile = path.join(UPLOAD_DIR, file.filename);
  const exists = await fs.access(diskFile).then(() => true).catch(() => false);
  assert(exists, "file should exist on disk");

  // Verify artifact in DB
  const artifact = await prisma.artifact.findUnique({
    where: { id: file.artifactId! },
  });
  assert(artifact !== null, "artifact should exist in DB");
  assert(artifact?.filePath !== null && artifact?.filePath !== undefined, "artifact.filePath should be populated (B3)");

  // Cleanup
  await prisma.artifact.deleteMany({ where: { conversationId: conv.id } });
  await prisma.conversation.delete({ where: { id: conv.id } });
  try { await fs.unlink(diskFile); } catch { /* ignore */ }
}

console.log("\n=== 11. execution-engine — No Code Blocks ===");
{
  const conv = await prisma.conversation.create({
    data: { title: "B3 No Code", goal: "test", status: "active" },
  });

  const result = await executeResponse(
    "This is just text, no code blocks here.",
    { conversationId: conv.id, agentName: "orchestrator" }
  );

  assert(result.filesCreated.length === 0, "should create 0 files");
  assert(result.artifactsCreated === 0, "should create 0 artifacts");

  await prisma.conversation.delete({ where: { id: conv.id } });
}

console.log("\n=== 12. execution-engine — HTML Preview Detection ===");
{
  const conv = await prisma.conversation.create({
    data: { title: "B3 HTML Preview", goal: "test", status: "active" },
  });

  const result = await executeResponse(
    '```html\n<h1>Preview Test</h1>\n```',
    { conversationId: conv.id, agentName: "developer" }
  );

  assert(result.previewable === true, "should detect HTML as previewable");
  assert(result.previewArtifactId !== undefined, "should have previewArtifactId");

  // Cleanup
  await prisma.artifact.deleteMany({ where: { conversationId: conv.id } });
  await prisma.conversation.delete({ where: { id: conv.id } });
  if (result.filesCreated[0]) {
    try { await fs.unlink(path.join(UPLOAD_DIR, result.filesCreated[0].filename)); } catch { /* ignore */ }
  }
}

// ─── No Direct Filesystem Bypass ────────────────────────────────────

console.log("\n=== 13. No Direct fs.* in file_write ===");
{
  const source = await fs.readFile("src/lib/ai/tools/index.ts", "utf8");
  const section = source.substring(
    source.indexOf("file_write:"),
    source.indexOf("memory_store:")
  );
  const hasFsCall = /fs\.\w+\(/.test(section);
  assert(hasFsCall === false, "file_write should not have direct fs.* calls");
}

console.log("\n=== 14. No Direct fs.* in patch ===");
{
  const source = await fs.readFile("src/lib/ai/tools/index.ts", "utf8");
  const section = source.substring(
    source.indexOf("patch:"),
    source.indexOf("diff:")
  );
  const hasFsCall = /fs\.\w+\(/.test(section);
  assert(hasFsCall === false, "patch should not have direct fs.* calls");
}

console.log("\n=== 15. No Direct fs.* in execution-engine ===");
{
  const source = await fs.readFile("src/lib/ai/execution-engine.ts", "utf8");
  // Check for fs.readFile, fs.writeFile, fs.stat, fs.mkdir, fs.readdir
  const hasFsCall = /fs\.(readFile|writeFile|stat|mkdir|readdir)\s*\(/.test(source);
  assert(hasFsCall === false, "execution-engine should not have direct fs.* calls");
}

console.log("\n=== 16. No UPLOAD_DIR in execution-engine ===");
{
  const source = await fs.readFile("src/lib/ai/execution-engine.ts", "utf8");
  const hasUploadDir = /UPLOAD_DIR/.test(source);
  assert(hasUploadDir === false, "execution-engine should not reference UPLOAD_DIR");
}

console.log("\n=== 17. No ensureUploadDir in execution-engine ===");
{
  const source = await fs.readFile("src/lib/ai/execution-engine.ts", "utf8");
  const hasEnsure = /ensureUploadDir/.test(source);
  assert(hasEnsure === false, "execution-engine should not have ensureUploadDir");
}

// ─── Cleanup ───────────────────────────────────────────────────────

console.log("\n=== Cleanup ===");
await cleanup();
await prisma.$disconnect();

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
