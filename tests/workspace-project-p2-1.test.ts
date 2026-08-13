// ===================================================================
// P2-1 B1/B2: Project Workspace Isolation + Regression Tests
// ===================================================================
// Tests for the project-aware WorkspaceService API.
// Run with: bun run tests/workspace-project-p2-1.test.ts
//
// Categories:
//   A — Project ID validation
//   B — Project isolation (CRITICAL)
//   C — Path traversal rejected
//   D — Symlink escape rejected
//   E — Blocked patterns
//   F — Read/write in project works
//   G — Backward compatibility (/upload/ still works)
//   H — Input validation (null bytes, empty)
//   I — Project lifecycle
//   J — Tool routing (via _systemProjectId)
//   K — Recursive isolation (symlink-safe traversal)
//   L — Missing parent creation
//   M — System authority (deferred to B3 — requires tool-caller injection)
// ===================================================================

import {
  validateProjectPath,
  ensureProjectDir,
  removeProjectDir,
  readProjectFile,
  writeProjectFile,
  patchProjectFile,
  listProjectTree,
  searchProject,
  searchProjectCode,
  PROJECTS_ROOT,
} from "../src/lib/ai/workspace";
import { executeTool } from "../src/lib/ai/tools";
import { executeToolCall } from "../src/lib/ai/tool-caller";
import { promises as fs } from "fs";
import path from "path";

// ─── Test framework ─────────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────

// Generate unique valid CUID-like project IDs for test isolation
let idCounter = 0;
function makeProjectId(): string {
  idCounter++;
  // CUID2 format: 'c' + 20-31 lowercase alphanumeric
  // Use a base + counter to ensure uniqueness across test runs
  const base = "c" + Date.now().toString(36).slice(-8) + idCounter.toString(36).padStart(4, "0");
  return base.padEnd(22, "0").slice(0, 22);
}

const TEST_PROJECTS = new Set<string>();

async function createTestProject(id: string): Promise<void> {
  TEST_PROJECTS.add(id);
  await ensureProjectDir(id);
}

async function cleanupTestProjects(): Promise<void> {
  for (const id of TEST_PROJECTS) {
    await removeProjectDir(id).catch(() => {});
  }
  TEST_PROJECTS.clear();
}

// ─── Setup ──────────────────────────────────────────────────────────

console.log("\n=== SETUP ===");
{
  // Ensure PROJECTS_ROOT exists
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  console.log("  PROJECTS_ROOT ready:", PROJECTS_ROOT);
}

// ===================================================================
// Category A: Project ID Validation
// ===================================================================

console.log("\n=== A. Project ID Validation ===");

{
  const validId = makeProjectId();
  const result = await validateProjectPath(validId, "test.txt", "write", false);
  // Will fail with PROJECT_DIR_MISSING because we haven't called ensureProjectDir,
  // but Layer 0 (projectId format) should PASS — failure is at Layer 4
  assert(
    result.code !== "INVALID_PROJECT_ID",
    "A1: Valid CUID projectId accepted by Layer 0"
  );
}

{
  const result = await validateProjectPath("c..invalid", "test.txt", "write", false);
  assert(
    result.valid === false && result.code === "INVALID_PROJECT_ID",
    "A2: projectId with '..' rejected with INVALID_PROJECT_ID"
  );
}

{
  const result = await validateProjectPath("", "test.txt", "write", false);
  assert(
    result.valid === false && result.code === "INVALID_PROJECT_ID",
    "A3: empty projectId rejected with INVALID_PROJECT_ID"
  );
}

{
  const result = await validateProjectPath("/etc/passwd", "test.txt", "write", false);
  assert(
    result.valid === false && result.code === "INVALID_PROJECT_ID",
    "A4: absolute path projectId rejected with INVALID_PROJECT_ID"
  );
}

{
  const result = await validateProjectPath("CABC12345678901234567890", "test.txt", "write", false);
  assert(
    result.valid === false && result.code === "INVALID_PROJECT_ID",
    "A5: uppercase projectId rejected with INVALID_PROJECT_ID"
  );
}

{
  const result = await validateProjectPath("cshort", "test.txt", "write", false);
  assert(
    result.valid === false && result.code === "INVALID_PROJECT_ID",
    "A6: too-short projectId rejected with INVALID_PROJECT_ID"
  );
}

// ===================================================================
// Category B: Project Isolation (CRITICAL)
// ===================================================================

console.log("\n=== B. Project Isolation ===");

{
  const projectA = makeProjectId();
  const projectB = makeProjectId();
  await createTestProject(projectA);
  await createTestProject(projectB);

  // Write a secret file in project B
  const writeB = await writeProjectFile(projectB, "secret.txt", "B-SECRET-MARKER-XYZ");
  assert(writeB.success === true, "B0: write to project B succeeds (setup)");

  // B1: Project A cannot read Project B's file via readProjectFile
  const readA = await readProjectFile(projectA, "secret.txt");
  assert(
    readA.success === false,
    "B1: Project A readProjectFile cannot read Project B's file (returns failure)"
  );
  if (!readA.success) {
    assert(
      readA.error !== undefined && !readA.error.includes("B-SECRET-MARKER-XYZ"),
      "B1b: error does not leak Project B's content"
    );
  }

  // B2: Project A cannot write to Project B's directory
  // Attempt: writeProjectFile(projectA, "../{projectB}/evil.txt", ...)
  const evilPath = `../${projectB}/evil.txt`;
  const writeA = await writeProjectFile(projectA, evilPath, "evil-content");
  assert(
    writeA.success === false,
    "B2: Project A writeProjectFile cannot write to Project B's directory (traversal rejected)"
  );
  if (!writeA.success) {
    assert(
      writeA.diagnostics?.code === "PROJECT_BOUNDARY_ESCAPE" || writeA.diagnostics?.code === "BLOCKED_PATTERN" || writeA.diagnostics?.code === "OUTSIDE_PROJECT_ROOT",
      "B2b: rejection code indicates boundary escape"
    );
  }
  // Verify project B does NOT have evil.txt
  const verifyB = await readProjectFile(projectB, "evil.txt");
  assert(
    verifyB.success === false,
    "B2c: Project B does not have evil.txt (write was blocked)"
  );

  // B3: Project A cannot patch Project B's file
  const patchA = await patchProjectFile(projectA, `../${projectB}/secret.txt`, "B-SECRET", "HACKED");
  assert(
    patchA.success === false,
    "B3: Project A patchProjectFile cannot patch Project B's file"
  );

  // B4: Project A searchProject does not return Project B's files
  const searchA = await searchProject(projectA, "secret");
  const searchData = searchA.data as { results: Array<{ path: string }> };
  const foundB = searchData?.results?.some((r) => r.path.includes("secret")) ?? false;
  assert(
    foundB === false,
    "B4: Project A searchProject does not find Project B's files"
  );

  // B5: Project A searchProjectCode does not return Project B's code
  const codeSearchA = await searchProjectCode(projectA, "B-SECRET-MARKER");
  const codeData = codeSearchA.data as { results: Array<{ file: string; content: string }> };
  const foundCode = codeData?.results?.some((r) => r.content.includes("B-SECRET-MARKER-XYZ")) ?? false;
  assert(
    foundCode === false,
    "B5: Project A searchProjectCode does not find Project B's content"
  );
}

// ===================================================================
// Category C: Path Traversal Rejected
// ===================================================================

console.log("\n=== C. Path Traversal Rejected ===");

{
  const projectA = makeProjectId();
  await createTestProject(projectA);

  // C1: ../../../etc/passwd
  const r1 = await readProjectFile(projectA, "../../../etc/passwd");
  assert(r1.success === false, "C1: ../../../etc/passwd rejected");

  // C2: ../../other-project/file.txt
  const otherProject = makeProjectId();
  const r2 = await readProjectFile(projectA, `../../${otherProject}/file.txt`);
  assert(r2.success === false, "C2: ../../other-project/file.txt rejected");

  // C3: ./../
  const r3 = await writeProjectFile(projectA, "./../escape.txt", "content");
  assert(r3.success === false, "C3: ./../ rejected");

  // C4: absolute path
  const r4 = await readProjectFile(projectA, "/etc/passwd");
  assert(
    r4.success === false && r4.diagnostics?.code === "ABSOLUTE_PATH",
    "C4: absolute path rejected with ABSOLUTE_PATH"
  );
}

// ===================================================================
// Category D: Symlink Escape Rejected
// ===================================================================

console.log("\n=== D. Symlink Escape Rejected ===");

{
  const projectA = makeProjectId();
  const projectB = makeProjectId();
  await createTestProject(projectA);
  await createTestProject(projectB);

  // Write a file in project B
  await writeProjectFile(projectB, "target.txt", "B-TARGET-CONTENT");

  // D1: Create symlink in project A pointing to project B's file
  const symlinkPath = path.join(PROJECTS_ROOT, projectA, "link-to-b");
  try {
    await fs.symlink(
      path.join(PROJECTS_ROOT, projectB, "target.txt"),
      symlinkPath
    );
  } catch (err) {
    console.log("  (symlink creation skipped:", (err as Error).message, ")");
  }

  // Reading via the symlink should fail
  const r1 = await readProjectFile(projectA, "link-to-b");
  assert(
    r1.success === false,
    "D1: symlink to Project B file rejected by readProjectFile"
  );
  if (!r1.success) {
    assert(
      r1.diagnostics?.code === "PROJECT_BOUNDARY_ESCAPE" || r1.diagnostics?.code === "NOT_FOUND",
      "D1b: rejection indicates boundary escape or not found"
    );
  }

  // D2: Symlink in project A pointing to /etc/passwd
  const etcSymlink = path.join(PROJECTS_ROOT, projectA, "etc-link");
  try {
    await fs.symlink("/etc/passwd", etcSymlink);
  } catch (err) {
    console.log("  (etc symlink creation skipped:", (err as Error).message, ")");
  }

  const r2 = await readProjectFile(projectA, "etc-link");
  assert(
    r2.success === false,
    "D2: symlink to /etc/passwd rejected by readProjectFile"
  );

  // D3: Symlink in project A pointing to ../../upload/file.txt
  const uploadSymlink = path.join(PROJECTS_ROOT, projectA, "upload-link");
  try {
    await fs.symlink(path.join(PROJECTS_ROOT, "../../upload"), uploadSymlink);
  } catch (err) {
    console.log("  (upload symlink creation skipped:", (err as Error).message, ")");
  }

  const r3 = await readProjectFile(projectA, "upload-link/hello.html");
  assert(
    r3.success === false,
    "D3: symlink to /upload rejected by readProjectFile"
  );
}

// ===================================================================
// Category E: Blocked Patterns
// ===================================================================

console.log("\n=== E. Blocked Patterns ===");

{
  const projectA = makeProjectId();
  await createTestProject(projectA);

  // E1: .env
  const r1 = await writeProjectFile(projectA, ".env", "SECRET=123");
  assert(
    r1.success === false && r1.diagnostics?.code === "BLOCKED_PATTERN",
    "E1: .env rejected with BLOCKED_PATTERN"
  );

  // E2: data.db
  const r2 = await writeProjectFile(projectA, "data.db", "binary");
  assert(
    r2.success === false && r2.diagnostics?.code === "BLOCKED_PATTERN",
    "E2: data.db rejected with BLOCKED_PATTERN"
  );

  // E3: .git/config
  const r3 = await writeProjectFile(projectA, ".git/config", "[core]");
  assert(
    r3.success === false && r3.diagnostics?.code === "BLOCKED_PATTERN",
    "E3: .git/config rejected with BLOCKED_PATTERN"
  );

  // E4: node_modules/foo
  const r4 = await writeProjectFile(projectA, "node_modules/foo/index.js", "code");
  assert(
    r4.success === false && r4.diagnostics?.code === "BLOCKED_PATTERN",
    "E4: node_modules/foo rejected with BLOCKED_PATTERN"
  );
}

// ===================================================================
// Category F: Read/Write in Project Works
// ===================================================================

console.log("\n=== F. Read/Write in Project Works ===");

{
  const projectA = makeProjectId();
  await createTestProject(projectA);

  // F1: writeProjectFile creates file in project root
  const w1 = await writeProjectFile(projectA, "hello.txt", "Hello World");
  assert(w1.success === true, "F1: writeProjectFile creates file in project root");

  // F2: writeProjectFile creates file in subdirectory
  const w2 = await writeProjectFile(projectA, "src/index.ts", "export default {}");
  assert(w2.success === true, "F2: writeProjectFile creates file in subdirectory");

  // F3: readProjectFile reads file written by writeProjectFile
  const r3 = await readProjectFile(projectA, "hello.txt");
  assert(r3.success === true, "F3: readProjectFile reads written file");
  if (r3.success) {
    assert(
      (r3.data as string) === "Hello World",
      "F3b: content matches what was written"
    );
  }

  // F4: patchProjectFile modifies existing file
  const p4 = await patchProjectFile(projectA, "hello.txt", "World", "Universe");
  assert(p4.success === true, "F4: patchProjectFile succeeds");
  if (p4.success) {
    const patched = await readProjectFile(projectA, "hello.txt");
    assert(
      (patched.data as string) === "Hello Universe",
      "F4b: content was patched correctly"
    );
  }

  // F5: patchProjectFile creates file if it doesn't exist
  const p5 = await patchProjectFile(projectA, "newfile.txt", "nonexistent", "created");
  assert(p5.success === true, "F5: patchProjectFile creates new file");
  if (p5.success) {
    const created = await readProjectFile(projectA, "newfile.txt");
    assert(
      (created.data as string) === "created",
      "F5b: new file content is correct"
    );
  }

  // F6: listProjectTree returns files written to project
  const tree = await listProjectTree(projectA);
  assert(tree.success === true, "F6: listProjectTree succeeds");
  if (tree.success) {
    const data = tree.data as { tree: Array<{ path: string }>; count: number };
    assert(data.count >= 3, "F6b: tree contains at least 3 files (hello.txt, src/index.ts, newfile.txt)");
    assert(
      data.tree.some((f) => f.path === "hello.txt"),
      "F6c: tree includes hello.txt"
    );
    assert(
      data.tree.some((f) => f.path === "src/index.ts"),
      "F6d: tree includes src/index.ts"
    );
  }

  // F7: searchProject finds files by name pattern
  const s7 = await searchProject(projectA, "hello");
  assert(s7.success === true, "F7: searchProject succeeds");
  if (s7.success) {
    const data = s7.data as { results: Array<{ path: string }>; count: number };
    assert(data.count >= 1, "F7b: found at least 1 file matching 'hello'");
    assert(
      data.results.some((r) => r.path === "hello.txt"),
      "F7c: found hello.txt"
    );
  }

  // F8: searchProjectCode finds text inside project files
  // (searchProjectCode only searches code extensions: .ts, .tsx, .js, .jsx, .py,
  //  .json, .md, .prisma, .sql, .css, .html. So we search src/index.ts which
  //  was written in F2.)
  const s8 = await searchProjectCode(projectA, "export default");
  assert(s8.success === true, "F8: searchProjectCode succeeds");
  if (s8.success) {
    const data = s8.data as { results: Array<{ file: string; content: string }> };
    assert(
      data.results.some((r) => r.file === "src/index.ts" && r.content.includes("export default")),
      "F8b: found 'export default' in src/index.ts"
    );
  }
}

// ===================================================================
// Category G: Backward Compatibility — /upload/ Still Works
// ===================================================================

console.log("\n=== G. Backward Compatibility ===");

{
  // Import the global (legacy) API
  const { write, read, search } = await import("../src/lib/ai/workspace");

  // G1: WorkspaceService.write still writes to /upload/
  const testFile = `p2-1-backward-compat-${Date.now()}.txt`;
  const w1 = await write(testFile, "backward compat content");
  assert(w1.success === true, "G1: WorkspaceService.write still works");

  // G2: WorkspaceService.read still reads it
  const r2 = await read(`upload/${testFile}`);
  assert(r2.success === true, "G2: WorkspaceService.read still reads /upload/ files");
  if (r2.success) {
    assert(
      (r2.data as string) === "backward compat content",
      "G2b: content matches"
    );
  }

  // G3: WorkspaceService.search still finds /upload/ files
  const s3 = await search(testFile);
  assert(s3.success === true, "G3: WorkspaceService.search still works");
  if (s3.success) {
    const data = s3.data as { results: Array<{ path: string }>; count: number };
    assert(data.count >= 1, "G3b: found the /upload/ file");
  }

  // Cleanup the test file
  await fs.unlink(path.join("/home/z/my-project/upload", testFile)).catch(() => {});

  // G4-G6: tool-level backward compat (no _systemProjectId → /upload/)
  // DEFERRED to B3/B4 — requires tool-caller _systemProjectId injection logic.
  // At the B1/B2 level, the global WorkspaceService.write/read/search API
  // backward compat is verified by G1-G3 above.
  console.log("  (G4-G6: tool-level backward compat deferred to B3/B4)");
}

// ===================================================================
// Category H: Input Validation
// ===================================================================

console.log("\n=== H. Input Validation ===");

{
  const projectA = makeProjectId();
  await createTestProject(projectA);

  // H1: null byte
  const r1 = await readProjectFile(projectA, "file\0name.txt");
  assert(
    r1.success === false && r1.diagnostics?.code === "NULL_BYTE",
    "H1: path with null byte rejected with NULL_BYTE"
  );

  // H2: empty path
  const r2 = await readProjectFile(projectA, "");
  assert(
    r2.success === false && r2.diagnostics?.code === "EMPTY_PATH",
    "H2: empty path rejected with EMPTY_PATH"
  );
}

// ===================================================================
// Category I: Project Lifecycle
// ===================================================================

console.log("\n=== I. Project Lifecycle ===");

{
  // I1: ensureProjectDir creates the project directory
  const projectA = makeProjectId();
  const e1 = await ensureProjectDir(projectA);
  assert(e1.success === true, "I1: ensureProjectDir creates project directory");
  TEST_PROJECTS.add(projectA);

  // Verify directory exists
  const stat1 = await fs.stat(path.join(PROJECTS_ROOT, projectA));
  assert(stat1.isDirectory(), "I1b: directory exists on disk");

  // I2: ensureProjectDir is idempotent
  const e2 = await ensureProjectDir(projectA);
  assert(e2.success === true, "I2: ensureProjectDir is idempotent");

  // I3: removeProjectDir removes the project directory
  const r3 = await removeProjectDir(projectA);
  assert(r3.success === true, "I3: removeProjectDir removes project directory");
  TEST_PROJECTS.delete(projectA);

  // Verify directory is gone
  try {
    await fs.stat(path.join(PROJECTS_ROOT, projectA));
    assert(false, "I3b: directory should be gone");
  } catch {
    assert(true, "I3b: directory is gone from disk");
  }

  // I4: ensureProjectDir rejects invalid projectId
  const e4 = await ensureProjectDir("../evil");
  assert(
    e4.success === false && e4.diagnostics?.code === "INVALID_PROJECT_ID",
    "I4: ensureProjectDir rejects invalid projectId"
  );
}

// ===================================================================
// Category J: Tool Routing (via _systemProjectId)
// ===================================================================

console.log("\n=== J. Tool Routing ===");

{
  const projectA = makeProjectId();
  await createTestProject(projectA);

  // J1: file_write with _systemProjectId writes to project directory
  const w1 = await executeTool("file_write", {
    filename: "routed.txt",
    content: "project-routed-content",
    _systemProjectId: projectA,
  });
  assert(w1.error === undefined, "J1: file_write with _systemProjectId succeeds");

  // J2: verify it did NOT write to /upload/
  const uploadPath = path.join("/home/z/my-project/upload", "routed.txt");
  try {
    await fs.stat(uploadPath);
    assert(false, "J2: file_write with _systemProjectId should NOT write to /upload/");
    await fs.unlink(uploadPath).catch(() => {});
  } catch {
    assert(true, "J2: file_write with _systemProjectId did NOT write to /upload/");
  }

  // J2b: verify it DID write to project directory
  const projectPath = path.join(PROJECTS_ROOT, projectA, "routed.txt");
  try {
    const stat = await fs.stat(projectPath);
    assert(stat.isFile(), "J2b: file written to project directory");
  } catch {
    assert(false, "J2b: file NOT found in project directory");
  }

  // J3: file_write without _systemProjectId writes to /upload/ (backward compat)
  const w3 = await executeTool("file_write", {
    filename: "legacy-routed.txt",
    content: "legacy-content",
  });
  assert(w3.error === undefined, "J3: file_write without _systemProjectId succeeds");
  if (!w3.error) {
    try {
      const stat = await fs.stat(path.join("/home/z/my-project/upload", "legacy-routed.txt"));
      assert(stat.isFile(), "J3b: file written to /upload/ (backward compat)");
      await fs.unlink(path.join("/home/z/my-project/upload", "legacy-routed.txt")).catch(() => {});
    } catch {
      assert(false, "J3b: file NOT found in /upload/");
    }
  }

  // J4: file_read with _systemProjectId reads from project directory
  const r4 = await executeTool("file_read", {
    path: "routed.txt",
    _systemProjectId: projectA,
  });
  assert(r4.error === undefined, "J4: file_read with _systemProjectId reads from project");
  if (!r4.error) {
    const output = r4.output as { content: string };
    assert(
      output.content === "project-routed-content",
      "J4b: content matches project file"
    );
  }

  // J5: file_read with _systemProjectId cannot read /upload/ files via traversal
  await fs.writeFile(path.join("/home/z/my-project/upload", "p2-1-j5-test.txt"), "upload content");
  const r5 = await executeTool("file_read", {
    path: "../../upload/p2-1-j5-test.txt",
    _systemProjectId: projectA,
  });
  assert(
    r5.error !== undefined,
    "J5: file_read with _systemProjectId cannot read /upload/ files via traversal"
  );
  await fs.unlink(path.join("/home/z/my-project/upload", "p2-1-j5-test.txt")).catch(() => {});
}

// ===================================================================
// Category K: Recursive Isolation (symlink-safe traversal)
// ===================================================================

console.log("\n=== K. Recursive Isolation ===");

{
  const projectA = makeProjectId();
  const projectB = makeProjectId();
  await createTestProject(projectA);
  await createTestProject(projectB);

  // Write a real file in project A
  await writeProjectFile(projectA, "real.txt", "A-real-content");

  // Write a secret in project B
  await writeProjectFile(projectB, "secret.txt", "B-LEAK-MARKER-12345");

  // K1: Create symlink in project A → project B's directory
  const symlinkToB = path.join(PROJECTS_ROOT, projectA, "link-to-b");
  try {
    await fs.symlink(path.join(PROJECTS_ROOT, projectB), symlinkToB);
  } catch (err) {
    console.log("  (symlink to B creation skipped:", (err as Error).message, ")");
  }

  // searchProject(A) should NOT discover B's files via the symlink
  const s1 = await searchProject(projectA, "secret");
  const s1data = s1.data as { results: Array<{ path: string }> };
  const leak1 = s1data?.results?.some((r) => r.path.includes("secret") || r.path.includes("B-LEAK")) ?? false;
  assert(leak1 === false, "K1: searchProject(A) does not discover B's files via symlink");

  // K2: Create symlink in project A → /etc
  const symlinkToEtc = path.join(PROJECTS_ROOT, projectA, "etc-link");
  try {
    await fs.symlink("/etc", symlinkToEtc);
  } catch (err) {
    console.log("  (etc symlink creation skipped:", (err as Error).message, ")");
  }

  const s2 = await searchProject(projectA, "passwd");
  const s2data = s2.data as { results: Array<{ path: string }> };
  const leak2 = s2data?.results?.some((r) => r.path.includes("passwd") || r.path.includes("etc-link")) ?? false;
  assert(leak2 === false, "K2: searchProject(A) does not traverse symlink to /etc");

  // K3: Create symlink in project A → /upload
  const symlinkToUpload = path.join(PROJECTS_ROOT, projectA, "upload-link");
  try {
    await fs.symlink("/home/z/my-project/upload", symlinkToUpload);
  } catch (err) {
    console.log("  (upload symlink creation skipped:", (err as Error).message, ")");
  }

  // Write a marker file to /upload/
  await fs.writeFile(path.join("/home/z/my-project/upload", "p2-1-k3-marker.txt"), "UPLOAD-LEAK-MARKER");
  const s3 = await searchProjectCode(projectA, "UPLOAD-LEAK-MARKER");
  const s3data = s3.data as { results: Array<{ file: string; content: string }> };
  const leak3 = s3data?.results?.some((r) => r.content.includes("UPLOAD-LEAK-MARKER")) ?? false;
  assert(leak3 === false, "K3: searchProjectCode(A) does not traverse symlink to /upload");
  await fs.unlink(path.join("/home/z/my-project/upload", "p2-1-k3-marker.txt")).catch(() => {});

  // K4: listProjectTree(A) does not expose files outside project A
  const tree = await listProjectTree(projectA);
  const treeData = tree.data as { tree: Array<{ path: string }> };
  const hasExternalSymlinks = treeData.tree.some(
    (f) => f.path === "link-to-b" || f.path === "etc-link" || f.path === "upload-link"
  );
  assert(
    hasExternalSymlinks === false,
    "K4: listProjectTree(A) does not expose symlinks (they are skipped entirely)"
  );
  // Verify the real file IS in the tree
  assert(
    treeData.tree.some((f) => f.path === "real.txt"),
    "K4b: listProjectTree(A) still includes real files in project A"
  );
}

// ===================================================================
// Category L: Missing Parent Creation
// ===================================================================

console.log("\n=== L. Missing Parent Creation ===");

{
  const projectA = makeProjectId();
  await createTestProject(projectA);

  // L1: writeProjectFile with one missing directory level
  const w1 = await writeProjectFile(projectA, "src/index.ts", "export default {}");
  assert(w1.success === true, "L1: writeProjectFile creates src/ then index.ts");

  if (w1.success) {
    // Verify the file exists at the expected path
    const filePath = path.join(PROJECTS_ROOT, projectA, "src", "index.ts");
    try {
      const stat = await fs.stat(filePath);
      assert(stat.isFile(), "L1b: file exists at src/index.ts");
    } catch {
      assert(false, "L1b: file NOT found at src/index.ts");
    }
  }

  // L2: writeProjectFile with two missing directory levels
  const w2 = await writeProjectFile(projectA, "src/components/App.tsx", "export const App = () => null");
  assert(w2.success === true, "L2: writeProjectFile creates src/components/ then App.tsx");

  if (w2.success) {
    const filePath = path.join(PROJECTS_ROOT, projectA, "src", "components", "App.tsx");
    try {
      const stat = await fs.stat(filePath);
      assert(stat.isFile(), "L2b: file exists at src/components/App.tsx");
    } catch {
      assert(false, "L2b: file NOT found at src/components/App.tsx");
    }
  }

  // L2c: read back the deeply nested file
  const r2 = await readProjectFile(projectA, "src/components/App.tsx");
  assert(r2.success === true, "L2c: readProjectFile can read the nested file");
  if (r2.success) {
    assert(
      (r2.data as string).includes("App"),
      "L2d: nested file content is correct"
    );
  }
}

// ===================================================================
// Category M: System Authority (model cannot override projectId)
// ===================================================================

console.log("\n=== M. System Authority ===");

{
  const projectA = makeProjectId();
  const projectB = makeProjectId();
  await createTestProject(projectA);
  await createTestProject(projectB);

  // M1: Model attempts projectId = B in tool args; system context projectId = A;
  //     actual write goes to project A (model value stripped, system value wins)
  const r1 = await executeToolCall(
    {
      id: "call_m1",
      name: "file_write",
      arguments: {
        filename: "m1-test.txt",
        content: "M1-content",
        projectId: projectB, // Model tries to inject projectId = B
      },
    },
    { conversationId: "test-conv-m1", agentName: "developer", projectId: projectA }
  );
  assert(r1.success === true, "M1: file_write succeeds despite model projectId injection");
  // Verify file landed in project A (system value), NOT project B (model value)
  const inA = await readProjectFile(projectA, "m1-test.txt");
  assert(inA.success === true, "M1b: file written to project A (system projectId wins)");
  const inB = await readProjectFile(projectB, "m1-test.txt");
  assert(inB.success === false, "M1c: file NOT in project B (model projectId ignored)");

  // M2: Model attempts _systemProjectId = B in tool args; system context projectId = A;
  //     actual write goes to project A (stripped, system wins)
  const r2 = await executeToolCall(
    {
      id: "call_m2",
      name: "file_write",
      arguments: {
        filename: "m2-test.txt",
        content: "M2-content",
        _systemProjectId: projectB, // Model tries to inject _systemProjectId = B directly
      },
    },
    { conversationId: "test-conv-m2", agentName: "developer", projectId: projectA }
  );
  assert(r2.success === true, "M2: file_write succeeds despite model _systemProjectId injection");
  const inA2 = await readProjectFile(projectA, "m2-test.txt");
  assert(inA2.success === true, "M2b: file written to project A (system value wins over model _systemProjectId)");
  const inB2 = await readProjectFile(projectB, "m2-test.txt");
  assert(inB2.success === false, "M2c: file NOT in project B");

  // M3: Model attempts projectId = "" (empty) in tool args; system context projectId = A;
  //     actual write goes to project A (stripped, system wins)
  const r3 = await executeToolCall(
    {
      id: "call_m3",
      name: "file_write",
      arguments: {
        filename: "m3-test.txt",
        content: "M3-content",
        projectId: "", // Model tries to clear projectId
      },
    },
    { conversationId: "test-conv-m3", agentName: "developer", projectId: projectA }
  );
  assert(r3.success === true, "M3: file_write succeeds despite model empty projectId");
  const inA3 = await readProjectFile(projectA, "m3-test.txt");
  assert(inA3.success === true, "M3b: file written to project A (system value wins over empty model value)");
}

// ===================================================================
// Cleanup
// ===================================================================

console.log("\n=== CLEANUP ===");
await cleanupTestProjects();
console.log("  Test projects removed.");

// ===================================================================
// Summary
// ===================================================================

console.log("\n=== Summary ===");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${passed + failed}`);

if (failed > 0) {
  console.log("\n❌ SOME TESTS FAILED — STOP (do not proceed to B3)");
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED — B1/B2 verified");
  process.exit(0);
}
