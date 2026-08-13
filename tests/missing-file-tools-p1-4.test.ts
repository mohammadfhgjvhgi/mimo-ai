// ===================================================================
// P1-4: Missing File Tools Tests
// ===================================================================
// Tests for: file_edit, file_delete, file_rename, dir_create, dir_list
// Run with: bun run tests/missing-file-tools-p1-4.test.ts
// ===================================================================

import {
  ensureProjectDir,
  removeProjectDir,
  writeProjectFile,
  readProjectFile,
  PROJECTS_ROOT,
} from "../src/lib/ai/workspace";
import { executeTool } from "../src/lib/ai/tools";
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

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

function makeId(): string {
  return "c" + Math.random().toString(36).slice(2, 22).padEnd(21, "0");
}

const TEST_PROJECTS = new Set<string>();
const prisma = new PrismaClient();

async function createTestProject(id: string): Promise<void> {
  TEST_PROJECTS.add(id);
  await ensureProjectDir(id);
  await prisma.project.upsert({
    where: { id },
    create: { id, name: `Test ${id.slice(-6)}`, type: "software" },
    update: {},
  });
}

async function cleanupTestProjects(): Promise<void> {
  for (const id of TEST_PROJECTS) {
    await removeProjectDir(id).catch(() => {});
    await prisma.projectFile.deleteMany({ where: { projectId: id } }).catch(() => {});
    await prisma.project.delete({ where: { id } }).catch(() => {});
  }
  TEST_PROJECTS.clear();
}

console.log("\n=== SETUP ===");
await fs.mkdir(PROJECTS_ROOT, { recursive: true });

// ===================================================================
// file_edit
// ===================================================================

console.log("\n=== file_edit ===");

{
  const pid = makeId();
  await createTestProject(pid);
  await writeProjectFile(pid, "edit-test.txt", "line 1\nline 2\nline 3");

  const result = await executeTool("file_edit", {
    path: "edit-test.txt",
    edits: [
      { lineNumber: 2, newContent: "LINE 2 MODIFIED" },
    ],
    _systemProjectId: pid,
  });

  assert(result.error === undefined, "P1-4.1: file_edit succeeds");
  if (!result.error) {
    const output = result.output as { editsApplied: number };
    assert(output.editsApplied === 1, "P1-4.2: 1 edit applied");

    const read = await readProjectFile(pid, "edit-test.txt");
    assert(
      (read.data as string) === "line 1\nLINE 2 MODIFIED\nline 3",
      "P1-4.3: content edited correctly"
    );
  }
}

{
  const pid = makeId();
  await createTestProject(pid);
  await writeProjectFile(pid, "multi.txt", "a\nb\nc\nd\ne");

  const result = await executeTool("file_edit", {
    path: "multi.txt",
    edits: [
      { lineNumber: 1, newContent: "A" },
      { lineNumber: 3, newContent: "C" },
      { lineNumber: 5, newContent: "E" },
    ],
    _systemProjectId: pid,
  });

  assert(result.error === undefined, "P1-4.4: file_edit multiple lines succeeds");
  if (!result.error) {
    const read = await readProjectFile(pid, "multi.txt");
    assert(
      (read.data as string) === "A\nb\nC\nd\nE",
      "P1-4.5: multiple edits applied correctly"
    );
  }
}

// ===================================================================
// file_delete
// ===================================================================

console.log("\n=== file_delete ===");

{
  const pid = makeId();
  await createTestProject(pid);
  await writeProjectFile(pid, "delete-me.txt", "content");

  const result = await executeTool("file_delete", {
    path: "delete-me.txt",
    _systemProjectId: pid,
  });

  assert(result.error === undefined, "P1-4.6: file_delete succeeds");
  if (!result.error) {
    const output = result.output as { deleted: boolean };
    assert(output.deleted === true, "P1-4.7: deleted = true");

    // Verify file is gone
    const read = await readProjectFile(pid, "delete-me.txt");
    assert(read.success === false, "P1-4.8: file no longer exists");
  }
}

{
  const pid = makeId();
  await createTestProject(pid);

  const result = await executeTool("file_delete", {
    path: "nonexistent.txt",
    _systemProjectId: pid,
  });

  assert(result.error !== undefined, "P1-4.9: file_delete fails for non-existent file");
}

// ===================================================================
// file_rename
// ===================================================================

console.log("\n=== file_rename ===");

{
  const pid = makeId();
  await createTestProject(pid);
  await writeProjectFile(pid, "old-name.txt", "content");

  const result = await executeTool("file_rename", {
    oldPath: "old-name.txt",
    newPath: "new-name.txt",
    _systemProjectId: pid,
  });

  assert(result.error === undefined, "P1-4.10: file_rename succeeds");
  if (!result.error) {
    // Verify old file is gone
    const readOld = await readProjectFile(pid, "old-name.txt");
    assert(readOld.success === false, "P1-4.11: old file no longer exists");

    // Verify new file exists
    const readNew = await readProjectFile(pid, "new-name.txt");
    assert(readNew.success === true, "P1-4.12: new file exists");
    assert(
      (readNew.data as string) === "content",
      "P1-4.13: content preserved after rename"
    );
  }
}

{
  const pid = makeId();
  await createTestProject(pid);

  const result = await executeTool("file_rename", {
    oldPath: "nonexistent.txt",
    newPath: "new.txt",
    _systemProjectId: pid,
  });

  assert(result.error !== undefined, "P1-4.14: file_rename fails for non-existent source");
}

// ===================================================================
// dir_create
// ===================================================================

console.log("\n=== dir_create ===");

{
  const pid = makeId();
  await createTestProject(pid);

  const result = await executeTool("dir_create", {
    path: "new-dir",
    _systemProjectId: pid,
  });

  assert(result.error === undefined, "P1-4.15: dir_create succeeds");
  if (!result.error) {
    // Verify directory exists
    const dirPath = path.join(PROJECTS_ROOT, pid, "new-dir");
    const stat = await fs.stat(dirPath);
    assert(stat.isDirectory(), "P1-4.16: directory exists on disk");
  }
}

{
  const pid = makeId();
  await createTestProject(pid);

  // Create nested directory
  const result = await executeTool("dir_create", {
    path: "src/components",
    _systemProjectId: pid,
  });

  assert(result.error === undefined, "P1-4.17: dir_create nested succeeds");
  if (!result.error) {
    const dirPath = path.join(PROJECTS_ROOT, pid, "src", "components");
    const stat = await fs.stat(dirPath);
    assert(stat.isDirectory(), "P1-4.18: nested directory exists");
  }
}

// ===================================================================
// dir_list
// ===================================================================

console.log("\n=== dir_list ===");

{
  const pid = makeId();
  await createTestProject(pid);
  await writeProjectFile(pid, "file-a.txt", "a");
  await writeProjectFile(pid, "file-b.txt", "b");
  await writeProjectFile(pid, "src/index.ts", "code");

  const result = await executeTool("dir_list", {
    _systemProjectId: pid,
  });

  assert(result.error === undefined, "P1-4.19: dir_list succeeds");
  if (!result.error) {
    const output = result.output as { entries: Array<{ path: string }>; count: number };
    assert(output.count >= 2, "P1-4.20: list returns multiple entries");
    assert(
      output.entries.some((e) => e.path.includes("file-a")),
      "P1-4.21: list includes file-a.txt"
    );
  }
}

// ===================================================================
// Backward compat: global /upload/ path (no _systemProjectId)
// ===================================================================

console.log("\n=== Global path (backward compat) ===");

{
  // Create a test file in /upload/
  const testFile = `p1-4-global-${Date.now()}.txt`;
  await fs.writeFile(path.join("/home/z/my-project/upload", testFile), "global content");

  // file_delete without projectId (global path)
  const result = await executeTool("file_delete", { path: `upload/${testFile}` });
  assert(result.error === undefined, "P1-4.22: file_delete works on global /upload/ path");

  // Verify deleted
  try {
    await fs.stat(path.join("/home/z/my-project/upload", testFile));
    assert(false, "P1-4.23: global file should be deleted");
  } catch {
    assert(true, "P1-4.23: global file deleted successfully");
  }
}

// ===================================================================
// Cleanup
// ===================================================================

console.log("\n=== CLEANUP ===");
await cleanupTestProjects();
await prisma.$disconnect();
console.log("  Test projects removed.");

// ===================================================================
// Summary
// ===================================================================

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
