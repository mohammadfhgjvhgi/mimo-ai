// ===================================================================
// P2-5/P2-6: File Versioning + Diff Viewer Tests
// ===================================================================
// Tests for:
//   P2-5: recordFileVersion, getFileHistory, revertFile
//   P2-6: diffVersions
// Run with: bun run tests/workspace-versioning-p2.test.ts
// ===================================================================

import {
  ensureProjectDir,
  removeProjectDir,
  writeProjectFile,
  readProjectFile,
  patchProjectFile,
  getFileHistory,
  revertFile,
  diffVersions,
  PROJECTS_ROOT,
} from "../src/lib/ai/workspace";
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";

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
  // Create Project DB record (required for FK constraint on ProjectFile)
  await prisma.project.upsert({
    where: { id },
    create: { id, name: `Test Project ${id.slice(-6)}`, type: "software" },
    update: { name: `Test Project ${id.slice(-6)}` },
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
// P2-5: File Versioning — recordFileVersion (via writeProjectFile)
// ===================================================================

console.log("\n=== P2-5: Version Recording ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Write v1
  const w1 = await writeProjectFile(projectA, "versioned.txt", "version 1 content");
  assert(w1.success === true, "P2-5.1: writeProjectFile v1 succeeds");

  // Verify ProjectFile + FileVersion created
  const pf = await prisma.projectFile.findUnique({
    where: { projectId_path: { projectId: projectA, path: "versioned.txt" } },
    include: { versions: true },
  });
  assert(pf !== null, "P2-5.2: ProjectFile record created");
  assert(pf!.version === 1, "P2-5.3: current version = 1");
  assert(pf!.versions.length === 1, "P2-5.4: 1 FileVersion recorded");
  assert(pf!.versions[0].version === 1, "P2-5.5: FileVersion version = 1");
  assert(pf!.versions[0].content === "version 1 content", "P2-5.6: FileVersion content matches");

  // Write v2 (different content)
  const w2 = await writeProjectFile(projectA, "versioned.txt", "version 2 content");
  assert(w2.success === true, "P2-5.7: writeProjectFile v2 succeeds");

  const pf2 = await prisma.projectFile.findUnique({
    where: { projectId_path: { projectId: projectA, path: "versioned.txt" } },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  assert(pf2!.version === 2, "P2-5.8: current version incremented to 2");
  assert(pf2!.versions.length === 2, "P2-5.9: 2 FileVersions recorded");
  assert(pf2!.versions[0].version === 2, "P2-5.10: latest FileVersion = v2");
  assert(pf2!.versions[0].content === "version 2 content", "P2-5.11: v2 content matches");

  // Write same content again (should NOT create new version — idempotent)
  const w3 = await writeProjectFile(projectA, "versioned.txt", "version 2 content");
  assert(w3.success === true, "P2-5.12: writeProjectFile same content succeeds");

  const pf3 = await prisma.projectFile.findUnique({
    where: { projectId_path: { projectId: projectA, path: "versioned.txt" } },
    include: { versions: true },
  });
  assert(pf3!.version === 2, "P2-5.13: version unchanged (idempotent)");
  assert(pf3!.versions.length === 2, "P2-5.14: no new version for identical content");
}

// ===================================================================
// P2-5: patchProjectFile records versions
// ===================================================================

console.log("\n=== P2-5: Patch Records Version ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Initial write
  await writeProjectFile(projectA, "patch.txt", "line 1\nline 2\nline 3");

  // Patch (creates v2)
  const p1 = await patchProjectFile(projectA, "patch.txt", "line 2", "LINE 2 MODIFIED");
  assert(p1.success === true, "P2-5.15: patchProjectFile succeeds");

  const pf = await prisma.projectFile.findUnique({
    where: { projectId_path: { projectId: projectA, path: "patch.txt" } },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  assert(pf!.version === 2, "P2-5.16: patch incremented version to 2");
  assert(pf!.versions.length === 2, "P2-5.17: 2 versions after patch");

  // Verify disk content was patched
  const r = await readProjectFile(projectA, "patch.txt");
  assert(
    (r.data as string) === "line 1\nLINE 2 MODIFIED\nline 3",
    "P2-5.18: disk content patched correctly"
  );
}

// ===================================================================
// P2-5: getFileHistory
// ===================================================================

console.log("\n=== P2-5: getFileHistory ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Create 3 versions
  await writeProjectFile(projectA, "history.txt", "v1");
  await writeProjectFile(projectA, "history.txt", "v2");
  await writeProjectFile(projectA, "history.txt", "v3");

  const h = await getFileHistory(projectA, "history.txt");
  assert(h.success === true, "P2-5.19: getFileHistory succeeds");

  const data = h.data as {
    currentVersion: number;
    versions: Array<{ version: number; content?: string }>;
  };
  assert(data.currentVersion === 3, "P2-5.20: current version = 3");
  assert(data.versions.length === 3, "P2-5.21: 3 versions in history");
  assert(data.versions[0].version === 3, "P2-5.22: newest version first (v3)");
  assert(data.versions[2].version === 1, "P2-5.23: oldest version last (v1)");
}

// ===================================================================
// P2-5: getFileHistory for non-existent file
// ===================================================================

{
  const projectA = makeId();
  await createTestProject(projectA);

  const h = await getFileHistory(projectA, "nonexistent.txt");
  assert(h.success === false, "P2-5.24: getFileHistory fails for non-existent file");
}

// ===================================================================
// P2-5: revertFile
// ===================================================================

console.log("\n=== P2-5: revertFile ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Create v1, v2, v3
  await writeProjectFile(projectA, "revert.txt", "original v1");
  await writeProjectFile(projectA, "revert.txt", "modified v2");
  await writeProjectFile(projectA, "revert.txt", "further modified v3");

  // Verify current is v3
  const r1 = await readProjectFile(projectA, "revert.txt");
  assert((r1.data as string) === "further modified v3", "P2-5.25: current content is v3");

  // Revert to v1
  const rev = await revertFile(projectA, "revert.txt", 1);
  assert(rev.success === true, "P2-5.26: revertFile to v1 succeeds");

  // Verify disk content is now v1's content
  const r2 = await readProjectFile(projectA, "revert.txt");
  assert(
    (r2.data as string) === "original v1",
    "P2-5.27: disk content reverted to v1"
  );

  // Verify a new version was created (v4) with v1's content
  const h = await getFileHistory(projectA, "revert.txt");
  const hData = h.data as { currentVersion: number; versions: Array<{ version: number }> };
  assert(hData.currentVersion === 4, "P2-5.28: revert created new version v4");
  assert(hData.versions.length === 4, "P2-5.29: 4 versions total after revert");
}

// ===================================================================
// P2-5: revertFile to non-existent version
// ===================================================================

{
  const projectA = makeId();
  await createTestProject(projectA);
  await writeProjectFile(projectA, "test.txt", "content");

  const rev = await revertFile(projectA, "test.txt", 99);
  assert(rev.success === false, "P2-5.30: revertFile fails for non-existent version");
}

// ===================================================================
// P2-6: diffVersions
// ===================================================================

console.log("\n=== P2-6: diffVersions ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Create v1 and v2 with known diff
  await writeProjectFile(projectA, "diff.txt", "line 1\nline 2\nline 3");
  await writeProjectFile(projectA, "diff.txt", "line 1\nLINE 2 MODIFIED\nline 3\nline 4");

  const d = await diffVersions(projectA, "diff.txt", 1, 2);
  assert(d.success === true, "P2-6.1: diffVersions succeeds");

  const data = d.data as {
    versionA: number;
    versionB: number;
    added: number;
    removed: number;
    diff: Array<{ type: "added" | "removed" | "same"; content: string }>;
  };
  assert(data.versionA === 1, "P2-6.2: versionA = 1");
  assert(data.versionB === 2, "P2-6.3: versionB = 2");
  assert(data.added === 2, "P2-6.4: 2 lines added (modified line 2 + new line 4)");
  assert(data.removed === 1, "P2-6.5: 1 line removed (original line 2)");
}

// ===================================================================
// P2-6: diffVersions identical content
// ===================================================================

{
  const projectA = makeId();
  await createTestProject(projectA);

  await writeProjectFile(projectA, "same.txt", "same\ncontent");
  await writeProjectFile(projectA, "same.txt", "different");

  const d = await diffVersions(projectA, "same.txt", 1, 1);
  assert(d.success === true, "P2-6.6: diffVersions same version succeeds");

  const data = d.data as { added: number; removed: number };
  assert(data.added === 0, "P2-6.7: 0 added for same version");
  assert(data.removed === 0, "P2-6.8: 0 removed for same version");
}

// ===================================================================
// P2-6: diffVersions non-existent version
// ===================================================================

{
  const projectA = makeId();
  await createTestProject(projectA);
  await writeProjectFile(projectA, "test.txt", "content");

  const d = await diffVersions(projectA, "test.txt", 1, 99);
  assert(d.success === false, "P2-6.9: diffVersions fails for non-existent version");
}

// ===================================================================
// P2-5: Version cap (MAX_VERSIONS_PER_FILE = 50)
// ===================================================================

console.log("\n=== P2-5: Version Cap ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Write 55 versions
  for (let i = 1; i <= 55; i++) {
    await writeProjectFile(projectA, "capped.txt", `version ${i}`);
  }

  const h = await getFileHistory(projectA, "capped.txt");
  const data = h.data as {
    currentVersion: number;
    versions: Array<{ version: number }>;
  };
  assert(data.currentVersion === 55, "P2-5.31: current version = 55");
  assert(
    data.versions.length <= 50,
    "P2-5.32: versions capped at 50 (got " + data.versions.length + ")"
  );
}

// ===================================================================
// P2-5: Project isolation — versions don't leak across projects
// ===================================================================

console.log("\n=== P2-5: Project Isolation ===");

{
  const projectA = makeId();
  const projectB = makeId();
  await createTestProject(projectA);
  await createTestProject(projectB);

  await writeProjectFile(projectA, "shared-name.txt", "A content");
  await writeProjectFile(projectB, "shared-name.txt", "B content");

  const hA = await getFileHistory(projectA, "shared-name.txt");
  const hB = await getFileHistory(projectB, "shared-name.txt");

  const dataA = hA.data as { versions: Array<{ version: number }> };
  const dataB = hB.data as { versions: Array<{ version: number }> };

  assert(dataA.versions.length === 1, "P2-5.33: project A has 1 version");
  assert(dataB.versions.length === 1, "P2-5.34: project B has 1 version");

  // Verify they are distinct records
  const pfA = await prisma.projectFile.findUnique({
    where: { projectId_path: { projectId: projectA, path: "shared-name.txt" } },
  });
  const pfB = await prisma.projectFile.findUnique({
    where: { projectId_path: { projectId: projectB, path: "shared-name.txt" } },
  });
  assert(pfA!.id !== pfB!.id, "P2-5.35: project A and B have distinct ProjectFile records");
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
