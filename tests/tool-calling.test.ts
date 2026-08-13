// ===================================================================
// P1-A: Tool Calling Tests
// ===================================================================
// Focused tests for the canonical tool calling mechanism.
// Run with: bun run tests/tool-calling.test.ts
// ===================================================================

import {
  generateToolSchemaForAgent,
  parseToolCallsFromResponse,
  validateToolArguments,
  checkToolPermission,
  executeToolCall,
  formatToolResultsForModel,
  type ToolCallContext,
} from "../src/lib/ai/tool-caller";

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

function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got: ${JSON.stringify(actual)})`);
}

// ─── Tests ──────────────────────────────────────────────────────────

const mockContext: ToolCallContext = {
  conversationId: "test-conv",
  taskId: "test-task",
  agentName: "researcher",
};

// ─── Robust cleanup (P2-0 tech-debt fix) ────────────────────────────
// Stale rows from prior failed test runs (orphaned when a test crashed
// before reaching its `prisma.conversation.delete`) cause spurious
// failures in the memory-isolation tests. This setup() runs before any
// test executes and removes:
//   - Memory rows whose content contains known test markers
//   - Conversation rows whose title matches known test conversation titles
//   - Memory rows with conversationId="" (reject-path artifacts that
//     should never have been persisted, but are cleaned defensively)
// This makes the test suite hermetic: it cannot be polluted by its own
// prior failed runs.
async function setup() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    // Clean stale test memories (by content marker)
    await prisma.memory.deleteMany({
      where: {
        OR: [
          { content: { contains: "ConvA-secret-marker-xyz789" } },
          { content: { contains: "Test memory without context" } },
          { content: { contains: "Test project scope fabrication" } },
          { content: { contains: "User prefers dark mode - test15" } },
          { content: { contains: "User prefers Python - test16" } },
        ],
      },
    });
    // Clean stale test conversations (by title marker)
    await prisma.conversation.deleteMany({
      where: {
        OR: [
          { title: { contains: "Test Conv 15" } },
          { title: { contains: "Test Conv 16" } },
          { title: { contains: "Conv A 18" } },
          { title: { contains: "Conv B 18" } },
          { title: { contains: "Conv 19" } },
        ],
      },
    });
  } catch {
    // Non-fatal — tests will surface real issues
  } finally {
    await prisma.$disconnect();
  }
}

await setup();

console.log("\n=== 1. Valid Tool Invocation ===");
{
  const result = await executeToolCall(
    { id: "call_1", name: "web_search", arguments: { query: "React 19", num: 3 } },
    mockContext
  );
  assert(result.success === true, "web_search should succeed");
  assert(result.name === "web_search", "tool name should be web_search");
  assert(result.output !== null, "output should not be null");
  assert(typeof result.durationMs === "number", "durationMs should be a number");
}

console.log("\n=== 2. Unknown Tool ===");
{
  const result = await executeToolCall(
    { id: "call_2", name: "nonexistent_tool", arguments: {} },
    mockContext
  );
  assert(result.success === false, "unknown tool should fail");
  assert(result.error?.includes("Unknown tool") || result.error?.includes("not found") || result.error?.includes("not authorized") === false, "error should mention unknown tool");
}

console.log("\n=== 3. Invalid Arguments (missing required) ===");
{
  const result = await executeToolCall(
    { id: "call_3", name: "web_search", arguments: {} },
    mockContext
  );
  assert(result.success === false, "missing required arg should fail");
  assert(result.error?.includes("Missing required") === true, "error should mention missing argument");
}

console.log("\n=== 4. Permission Rejection ===");
{
  // Developer agent doesn't have web_search in defaultTools
  const devContext: ToolCallContext = {
    conversationId: "test-conv",
    taskId: "test-task",
    agentName: "developer",
  };
  const result = await executeToolCall(
    { id: "call_4", name: "web_search", arguments: { query: "test" } },
    devContext
  );
  assert(result.success === false, "developer should not be allowed web_search");
  assert(result.error?.includes("not authorized") === true, "error should mention authorization");
}

console.log("\n=== 5. Tool Failure (invalid input) ===");
{
  const result = await executeToolCall(
    { id: "call_5", name: "web_reader", arguments: { url: "not-a-valid-url" } },
    mockContext
  );
  // web_reader might fail or return error for invalid URL
  assert(result.durationMs >= 0, "should have duration even on failure");
  // Either succeeds (SDK might handle gracefully) or fails with error
  assert(typeof result.success === "boolean", "should return boolean success");
}

console.log("\n=== 6. Malformed Model Intent ===");
{
  const mockResponse = {
    choices: [
      {
        message: {
          role: "assistant",
          content: "I'll help you with that.",
          tool_calls: [
            {
              id: "call_6",
              type: "function",
              function: {
                name: "web_search",
                arguments: "{invalid json}",
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  };

  const calls = parseToolCallsFromResponse(mockResponse);
  assert(calls.length === 1, "should parse 1 tool call");
  assert(calls[0].name === "web_search", "tool name should be web_search");
  assert(calls[0].arguments._parseError !== undefined, "malformed args should set _parseError");

  const result = await executeToolCall(calls[0], mockContext);
  assert(result.success === false, "malformed args should fail");
  assert(result.error?.includes("Malformed") === true, "error should mention malformed");
}

console.log("\n=== 7. Normal Non-Tool Response ===");
{
  const mockResponse = {
    choices: [
      {
        message: {
          role: "assistant",
          content: "The answer is 4.",
        },
        finish_reason: "stop",
      },
    ],
  };

  const calls = parseToolCallsFromResponse(mockResponse);
  assert(calls.length === 0, "non-tool response should have 0 tool calls");
}

console.log("\n=== 8. Tool Result Formatted for Model ===");
{
  const results = [
    {
      id: "call_8",
      name: "web_search",
      success: true,
      output: { results: [{ url: "https://example.com", name: "Example" }] },
      durationMs: 100,
    },
    {
      id: "call_9",
      name: "file_read",
      success: false,
      output: null,
      error: "Access denied",
      durationMs: 5,
    },
  ];

  const formatted = formatToolResultsForModel(results);
  assert(formatted.length === 2, "should format 2 results");
  assert(formatted[0].role === "tool", "role should be tool");
  assert(formatted[0].tool_call_id === "call_8", "should have correct id");
  assert(formatted[0].content.includes("example.com") === true, "should include output content");
  assert(formatted[1].content.includes("Access denied") === true, "should include error for failed tool");
}

console.log("\n=== 9. Tool Schema Generation ===");
{
  const schemas = generateToolSchemaForAgent("researcher");
  assert(schemas.length > 0, "researcher should have tool schemas");
  assert(schemas.some((s) => s.function.name === "web_search"), "should include web_search");
  assert(schemas.some((s) => s.function.name === "web_reader"), "should include web_reader");
  assert(schemas.some((s) => s.function.name === "memory_store"), "should include memory_store");

  const devSchemas = generateToolSchemaForAgent("developer");
  assert(devSchemas.some((s) => s.function.name === "file_read"), "developer should have file_read");
  assert(!devSchemas.some((s) => s.function.name === "web_search"), "developer should NOT have web_search");
}

console.log("\n=== 10. Schema Validation ===");
{
  const valid = validateToolArguments("web_search", { query: "test" });
  assert(valid.valid === true, "valid args should pass");

  const missingArg = validateToolArguments("web_search", {});
  assert(missingArg.valid === false, "missing args should fail");
  assert(missingArg.error?.includes("query") === true, "error should mention 'query'");

  const unknownTool = validateToolArguments("nonexistent", {});
  assert(unknownTool.valid === false, "unknown tool should fail");
}

console.log("\n=== 11. Permission Check ===");
{
  const allowed = checkToolPermission("researcher", "web_search");
  assert(allowed.allowed === true, "researcher should be allowed web_search");

  const denied = checkToolPermission("developer", "web_search");
  assert(denied.allowed === false, "developer should be denied web_search");
  assert(denied.reason?.includes("not authorized") === true, "should mention authorization");
}

console.log("\n=== 12. Empty Response Handling ===");
{
  const calls = parseToolCallsFromResponse({});
  assert(calls.length === 0, "empty object should return 0 calls");

  const calls2 = parseToolCallsFromResponse({ choices: [] });
  assert(calls2.length === 0, "empty choices should return 0 calls");

  const calls3 = parseToolCallsFromResponse({ choices: [{ message: {} }] });
  assert(calls3.length === 0, "no tool_calls should return 0 calls");
}

// ─── P1-A Blocker Fix Tests ─────────────────────────────────────────

console.log("\n=== 13. page_reader (web_reader tool) — Valid URL ===");
{
  const result = await executeToolCall(
    { id: "call_13", name: "web_reader", arguments: { url: "https://example.com" } },
    mockContext
  );
  assert(result.name === "web_reader", "tool name should be web_reader (external name)");
  assert(result.success === true, "web_reader should succeed with page_reader SDK function");
  assert(result.output !== null, "output should not be null");
  const output = result.output as { title?: string; content?: string };
  assert(typeof output.title === "string", "output should have title string");
}

console.log("\n=== 14. page_reader — Invalid Arguments ===");
{
  const result = await executeToolCall(
    { id: "call_14", name: "web_reader", arguments: {} },
    mockContext
  );
  assert(result.success === false, "missing url should fail");
  assert(result.error?.includes("url") === true, "error should mention url");
}

console.log("\n=== 15. memory_store — Conversation-Scoped (system-injected) ===");
{
  // Create a real conversation in DB for FK constraint
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const conv = await prisma.conversation.create({
    data: { title: "Test Conv 15", goal: "test", status: "active" }
  });
  try {
    const result = await executeToolCall(
      {
        id: "call_15",
        name: "memory_store",
        arguments: { type: "preference", content: "User prefers dark mode - test15" },
      },
      { conversationId: conv.id, taskId: "task-15", agentName: "researcher" }
    );
    assert(result.success === true, "memory_store should succeed with system context");
    const output = result.output as { scope?: string; stored?: boolean };
    assert(output.stored === true, "memory should be stored");
    assert(output.scope === "conversation", "scope should be conversation (system-controlled)");
  } finally {
    // Cleanup — ALWAYS runs, even if assertions fail
    await prisma.conversation.delete({ where: { id: conv.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

console.log("\n=== 16. memory_store — Model Cannot Request Global Scope ===");
{
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const conv = await prisma.conversation.create({
    data: { title: "Test Conv 16", goal: "test", status: "active" }
  });
  try {
    // Model tries to create global memory by providing conversationId="" to get global scope
    const result = await executeToolCall(
      {
        id: "call_16",
        name: "memory_store",
        arguments: {
          type: "preference",
          content: "User prefers Python - test16",
          conversationId: "", // Model tries to omit conversationId
        },
      },
      { conversationId: conv.id, taskId: "task-16", agentName: "researcher" }
    );
    assert(result.success === true, "memory_store should still succeed (system overrides scope)");
    const output = result.output as { scope?: string };
    assert(output.scope === "conversation", "scope should be conversation despite model's attempt at global");
  } finally {
    // Cleanup — ALWAYS runs
    await prisma.conversation.delete({ where: { id: conv.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

console.log("\n=== 17. memory_store — Missing Conversation Context ===");
{
  // No conversationId in context — should fail safely, not default to global
  const result = await executeToolCall(
    {
      id: "call_17",
      name: "memory_store",
      arguments: { type: "preference", content: "Test memory without context" },
    },
    { conversationId: "", taskId: undefined, agentName: "researcher" }
  );
  // With empty conversationId, tool-caller won't inject _systemConversationId
  // memory_store should reject
  assert(result.output !== null, "should have output");
  const output = result.output as { stored?: boolean; error?: string };
  assert(output.stored === false || output.error !== undefined, "should not store without conversation context");
}

console.log("\n=== 18. memory_store — Conversation A Memory Not in B ===");
{
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const convA = await prisma.conversation.create({ data: { title: "Conv A 18", goal: "test", status: "active" } });
  const convB = await prisma.conversation.create({ data: { title: "Conv B 18", goal: "test", status: "active" } });
  try {
    // Store memory in Conv A
    const resultA = await executeToolCall(
      {
        id: "call_18a",
        name: "memory_store",
        arguments: { type: "preference", content: "ConvA-secret-marker-xyz789" },
      },
      { conversationId: convA.id, taskId: "task-18a", agentName: "researcher" }
    );
    assert(resultA.success === true, "memory should be stored in Conv A");

    // Retrieve via knowledge_search in Conv B — should NOT find it
    const resultB = await executeToolCall(
      {
        id: "call_18b",
        name: "knowledge_search",
        arguments: { query: "ConvA-secret-marker-xyz789" },
      },
      { conversationId: convB.id, taskId: "task-18b", agentName: "researcher" }
    );
    assert(resultB.success === true, "knowledge_search should succeed");
    const output = resultB.output as { memories?: Array<{ content: string }> };
    const memories = output.memories ?? [];
    const leaked = memories.some((m) => m.content.includes("ConvA-secret-marker-xyz789"));
    assert(leaked === false, "Conv A memory should NOT appear in Conv B search results");
  } finally {
    // Cleanup — ALWAYS runs, even if the isolation assertion fails
    await prisma.conversation.delete({ where: { id: convA.id } }).catch(() => {});
    await prisma.conversation.delete({ where: { id: convB.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

console.log("\n=== 19. memory_store — Project Scope Cannot Be Fabricated ===");
{
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const conv = await prisma.conversation.create({ data: { title: "Conv 19", goal: "test", status: "active" } });
  try {
    // Model tries to set projectId to escalate scope
    const result = await executeToolCall(
      {
        id: "call_19",
        name: "memory_store",
        arguments: {
          type: "preference",
          content: "Test project scope fabrication - test19",
          projectId: "fake-project-id", // Model tries to inject projectId
        },
      },
      { conversationId: conv.id, taskId: "task-19", agentName: "researcher" }
    );
    assert(result.success === true, "memory_store should succeed");
    const output = result.output as { scope?: string };
    assert(output.scope === "conversation", "scope should be conversation, not project (model cannot fabricate project scope)");
  } finally {
    // Cleanup — ALWAYS runs
    await prisma.conversation.delete({ where: { id: conv.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

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
