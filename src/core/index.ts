/**
 * MiMo Core — Public API Surface
 * ------------------------------
 * The ONLY entry point the Application layer may import.
 *
 * See: MIMO_ENGINEERING_SPEC.md §13
 *
 * Anything not exported here is internal and must not be imported from
 * outside `src/core`.
 */

// Kernel — entry point
export { mimoKernel, getFlags, setFlags } from './kernel';
export type { FeatureFlags } from './kernel';

// Registries (for advanced consumers that want to register custom plugins)
export { toolRegistry, agentRegistry, modelRegistry } from './registry';
export type { Tool, Agent, Model } from './registry';

// Workflow — the main pipeline (reason → plan → execute → validate)
export { runWorkflow, runWorkflowValidated } from './workflow';
export type { WorkflowResult, RunWorkflowOptions } from './workflow';

// Validator (the final gate — exposed for testing / introspection)
export { validateResponse } from './validator';
export type { ValidationReport, ValidationIssue } from './validator';

// Context builder (for Application layer to assemble context before calling workflow)
export { buildContext } from './context';
export type { BuildContextOptions } from './context';

// Prompt engine (rarely needed externally, but exposed for testing)
export { buildPrompt } from './prompts';
export type { BuiltPrompt } from './prompts';

// Memory engine (for direct memory access — e.g. seeding initial facts)
export { memoryEngine } from './memory';

// Search provider (for tools/agents that need live web data)
export { getSearchProvider, registerSearchProvider } from './search';
export type { SearchProvider, SearchResult } from './search';

// Events (for Application layer that wants to subscribe to core events)
export { mimoEvents, EVENT } from './events';
export type { MiMoEvent, EventHandler, Unsubscribe } from './types';

// Canonical types — so Application code can be strongly typed without
// reaching into internal module paths.
export type {
  ContextObject,
  Plan,
  Decision,
  Run,
  RunStepResult,
  AgentResult,
  AgentTask,
  Artifact,
  MemoryEntry,
  MemoryQuery,
  MemoryType,
  ModelRequest,
  ModelResponse,
  ModelMessage,
  ConversationTurn,
  Intent,
  PromptMode,
} from './types';

// Errors (so Application code can `instanceof` check)
export {
  MiMoError,
  CoreError,
  AgentError,
  ToolError,
  ModelError,
  MemoryError,
  ValidationError,
  RegistryError,
  OrchestrationError,
} from './errors';

// Security audit (real DB + source scan)
export { auditDbSecurity } from './security';
export type { DbSecurityStatus, SecretFinding } from './security';

// Backup engine (safe-by-construction: filename-only API)
export {
  createBackup,
  restoreBackup,
  restoreBackupByFilename,
  listBackups,
  deleteBackup,
  deleteBackupByFilename,
  isValidBackupFilename,
  BACKUP_DIR,
  DB_PATH,
  type BackupInfo,
  type RestoreResult,
} from './backup';

// Agent lifecycle + checkpoint manager (for recovery flows)
export {
  createAgentLifecycle,
  runAgentLifecycle,
  recoverAgentState,
  type AgentLifecycleHandle,
  type AgentState,
} from './agents/AgentLifecycle';
export {
  saveCheckpoint,
  recoverCheckpoint,
  isInterrupted,
  findInterruptedTasks,
  type Checkpoint,
} from './agents/CheckpointManager';
