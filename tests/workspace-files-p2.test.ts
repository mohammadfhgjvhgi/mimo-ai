// ===================================================================
// P2-2/P2-3/P2-4: File Tree API + Multi-File + Editor Tests
// ===================================================================
// Tests for:
//   P2-2: /api/workspace/tree route + listProjectTree
//   P2-3: extractCodeBlocks with inline filenames (multi-file generation)
//   P2-4: /api/workspace/file GET/PUT routes
//   P2-6: DEFERRED — depends on P2-5 (File Versioning) which is deferred
// Run with: bun run tests/workspace-files-p2.test.ts
// ===================================================================

import {
  ensureProjectDir,
  removeProjectDir,
  writeProjectFile,
  readProjectFile,
  listProjectTree,
  PROJECTS_ROOT,
} from "../src/lib/ai/workspace";
import { extractCodeBlocks } from "../src/lib/ai/execution-engine";
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

console.log("\n=== SETUP ===");
await fs.mkdir(PROJECTS_ROOT, { recursive: true });

// ===================================================================
// P2-2: listProjectTree + tree structure
// ===================================================================

console.log("\n=== P2-2: File Tree ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Write multiple files in nested structure
  await writeProjectFile(projectA, "index.html", "<html></html>");
  await writeProjectFile(projectA, "src/index.ts", "export default {}");
  await writeProjectFile(projectA, "src/components/Button.tsx", "export const Button = () => null");
  await writeProjectFile(projectA, "src/utils/helper.ts", "export const x = 1");
  await writeProjectFile(projectA, "README.md", "# Project");

  const tree = await listProjectTree(projectA);
  assert(tree.success === true, "P2-2.1: listProjectTree succeeds");

  const data = tree.data as { tree: Array<{ path: string; type: string }>; count: number };
  assert(data.count === 5, "P2-2.2: tree contains 5 files");
  assert(
    data.tree.some((f) => f.path === "index.html"),
    "P2-2.3: tree includes index.html at root"
  );
  assert(
    data.tree.some((f) => f.path === "src/index.ts"),
    "P2-2.4: tree includes src/index.ts"
  );
  assert(
    data.tree.some((f) => f.path === "src/components/Button.tsx"),
    "P2-2.5: tree includes nested src/components/Button.tsx"
  );
  assert(
    data.tree.some((f) => f.path === "src/utils/helper.ts"),
    "P2-2.6: tree includes src/utils/helper.ts"
  );
  assert(
    data.tree.some((f) => f.path === "README.md"),
    "P2-2.7: tree includes README.md"
  );
}

// ===================================================================
// P2-2: tree does NOT leak across projects
// ===================================================================

console.log("\n=== P2-2: Project Isolation in Tree ===");

{
  const projectA = makeId();
  const projectB = makeId();
  await createTestProject(projectA);
  await createTestProject(projectB);

  await writeProjectFile(projectA, "a-file.txt", "A content");
  await writeProjectFile(projectB, "b-file.txt", "B content");

  const treeA = await listProjectTree(projectA);
  const dataA = treeA.data as { tree: Array<{ path: string }> };
  assert(
    dataA.tree.every((f) => !f.path.includes("b-file")),
    "P2-2.8: Project A tree does NOT contain Project B files"
  );

  const treeB = await listProjectTree(projectB);
  const dataB = treeB.data as { tree: Array<{ path: string }> };
  assert(
    dataB.tree.every((f) => !f.path.includes("a-file")),
    "P2-2.9: Project B tree does NOT contain Project A files"
  );
}

// ===================================================================
// P2-3: Multi-file generation with inline filenames
// ===================================================================

console.log("\n=== P2-3: Multi-File Generation ===");

{
  // Test: code blocks with inline filename syntax ```lang:filename.ext
  const content = `I'll create a multi-file project:

\`\`\`html:index.html
<!DOCTYPE html>
<html><body>Hello</body></html>
\`\`\`

\`\`\`css:styles.css
body { color: red; }
\`\`\`

\`\`\`javascript:app.js
console.log("hello");
\`\`\`
`;

  const blocks = extractCodeBlocks(content);
  assert(blocks.length === 3, "P2-3.1: extracted 3 code blocks");
  assert(blocks[0].filename === "index.html", "P2-3.2: first block filename = index.html");
  assert(blocks[0].lang === "html", "P2-3.3: first block lang = html");
  assert(blocks[1].filename === "styles.css", "P2-3.4: second block filename = styles.css");
  assert(blocks[1].lang === "css", "P2-3.5: second block lang = css");
  assert(blocks[2].filename === "app.js", "P2-3.6: third block filename = app.js");
  assert(blocks[2].lang === "javascript", "P2-3.7: third block lang = javascript");
}

{
  // Test: backward compat — code blocks without inline filename (uses hint or generated)
  const content = `Here's the code:

\`\`\`html
<div>Hello</div>
\`\`\`
`;

  const blocks = extractCodeBlocks(content);
  assert(blocks.length === 1, "P2-3.8: extracted 1 code block (no inline filename)");
  assert(blocks[0].lang === "html", "P2-3.9: lang = html");
  assert(blocks[0].filename === undefined, "P2-3.10: filename undefined (will be generated)");
}

{
  // Test: space-separated filename ```html filename.html
  const content = `\`\`\`html page.html
<h1>Test</h1>
\`\`\`
`;

  const blocks = extractCodeBlocks(content);
  assert(blocks.length === 1, "P2-3.11: extracted 1 code block (space-separated filename)");
  assert(blocks[0].filename === "page.html", "P2-3.12: filename = page.html");
}

{
  // Test: hint-based filename (original P1 behavior)
  const content = `Let me create file \`config.json\`:

\`\`\`json
{ "name": "test" }
\`\`\`
`;

  const blocks = extractCodeBlocks(content);
  assert(blocks.length === 1, "P2-3.13: extracted 1 code block (hint-based)");
  assert(blocks[0].filename === "config.json", "P2-3.14: filename from hint = config.json");
}

// ===================================================================
// P2-3: Multi-file write to project workspace (integration)
// ===================================================================

console.log("\n=== P2-3: Multi-File Write to Project ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  const content = `Creating a 3-file project:

\`\`\`html:index.html
<!DOCTYPE html>
<html><body>Hello</body></html>
\`\`\`

\`\`\`css:styles.css
body { color: red; }
\`\`\`

\`\`\`javascript:app.js
console.log("hello");
\`\`\`
`;

  const blocks = extractCodeBlocks(content);

  // Simulate what executeResponse does: write each file to project workspace
  for (const block of blocks) {
    const filename = block.filename ?? `file-${Date.now()}.${block.lang}`;
    const result = await writeProjectFile(projectA, filename, block.code);
    assert(result.success === true, `P2-3: wrote ${filename} to project`);
  }

  // Verify all 3 files exist
  const tree = await listProjectTree(projectA);
  const data = tree.data as { tree: Array<{ path: string }> };
  assert(
    data.tree.some((f) => f.path === "index.html"),
    "P2-3.15: index.html exists in project"
  );
  assert(
    data.tree.some((f) => f.path === "styles.css"),
    "P2-3.16: styles.css exists in project"
  );
  assert(
    data.tree.some((f) => f.path === "app.js"),
    "P2-3.17: app.js exists in project"
  );
}

// ===================================================================
// P2-4: readProjectFile + writeProjectFile (editor save/load)
// ===================================================================

console.log("\n=== P2-4: Code Editor Load/Save ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Write initial file
  const w1 = await writeProjectFile(projectA, "editor-test.ts", "const x = 1;");
  assert(w1.success === true, "P2-4.1: writeProjectFile for editor test succeeds");

  // Read it back (simulates editor load)
  const r1 = await readProjectFile(projectA, "editor-test.ts");
  assert(r1.success === true, "P2-4.2: readProjectFile loads file");
  assert(
    (r1.data as string) === "const x = 1;",
    "P2-4.3: content matches what was written"
  );

  // Modify and save (simulates editor save)
  const w2 = await writeProjectFile(projectA, "editor-test.ts", "const x = 2;\nconst y = 3;");
  assert(w2.success === true, "P2-4.4: writeProjectFile overwrites existing file");

  // Read back the modified content
  const r2 = await readProjectFile(projectA, "editor-test.ts");
  assert(
    (r2.data as string) === "const x = 2;\nconst y = 3;",
    "P2-4.5: modified content is correct"
  );
}

// ===================================================================
// P2-4: editor cannot access /upload/ files (project-scoped only)
// ===================================================================

console.log("\n=== P2-4: Editor Project Scoping ===");

{
  const projectA = makeId();
  await createTestProject(projectA);

  // Write a file to /upload/ (global)
  await fs.writeFile(path.join("/home/z/my-project/upload", "p2-4-global.txt"), "global content");

  // Try to read it via project-scoped readProjectFile (should fail — different root)
  const r = await readProjectFile(projectA, "../../upload/p2-4-global.txt");
  assert(
    r.success === false,
    "P2-4.6: editor cannot read /upload/ files via project path (traversal blocked)"
  );

  // Cleanup
  await fs.unlink(path.join("/home/z/my-project/upload", "p2-4-global.txt")).catch(() => {});
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
  console.log("\n❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED");
  process.exit(0);
}
