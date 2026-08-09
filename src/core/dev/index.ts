/**
 * MiMo Core — Development Workspace (Phase 116)
 * ----------------------------------------------
 * Public API surface for the Development Workspace subsystem.
 *
 * Re-exported by `@/core` (the top-level barrel) so application code
 * only needs one import.
 */

// Sandbox foundation
export {
  SandboxError as DevSandboxError,
  getProjectRoot,
  resolveSafePath,
  validateWrite,
  ensureProjectDir,
  deleteProjectDir,
  getProjectStats,
  getProfileLimits,
  getSnapshotPath,
  getSandboxRoot,
  getSnapshotRoot,
} from './SandboxManager';
export type { SandboxProfile, ProfileLimits, ProjectStats } from './SandboxManager';

// Project manager
export {
  createProject,
  getProject,
  listProjects,
  listRecentProjects,
  updateProject,
  archiveProject,
  unarchiveProject,
  deleteProject,
  duplicateProject,
  getPermission,
  setPermission,
} from './ProjectManager';
export type {
  CreateDevProjectInput,
  DevProjectRecord,
  DevProjectType,
  DevProjectStatus,
  DevRuntime,
  DevPackageManager,
  EnvVarStatus,
  DevBuildSummary,
  DevTestSummary,
} from './ProjectManager';

// File explorer
export {
  listFiles,
  readFile,
  writeFile,
  createDirectory,
  moveFile,
  deleteFile,
  searchFiles,
  getMimeType,
  computeHash,
} from './FileExplorerService';
export type {
  DevFileRecord,
  DevFileNode,
  DevFileContent,
} from './FileExplorerService';

// Build system
export {
  detectProjectType,
  getBuildCommand,
  runBuild,
  listBuilds,
  getBuild,
} from './BuildSystem';
export type { DevBuildRecord, BuildCommand } from './BuildSystem';

// Test runner
export {
  getTestCommand,
  runTests,
  listTestRuns,
  getTestRun,
} from './TestRunner';
export type { DevTestRunRecord, TestCommand } from './TestRunner';

// Terminal service
export {
  executeCommand,
  listProcesses,
  killProcess,
} from './TerminalService';
export type { TerminalExecResult, DevProcessRecord } from './TerminalService';

// Git integration
export {
  getStatus,
  getDiff,
  getBranches,
  commit,
  getHistory,
  escapeShellArg,
} from './GitIntegration';
export type { GitStatus, GitHistoryEntry, GitCommitResult } from './GitIntegration';

// Resource monitor
export {
  getMetrics,
  getProcessList,
} from './ResourceMonitor';
export type { ResourceMetrics, ProcessListEntry } from './ResourceMonitor';

// Snapshot engine
export {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  cloneProject,
} from './SnapshotEngine';
export type { DevSnapshotRecord } from './SnapshotEngine';

// Dev coding agent
export {
  analyzeProject,
  proposeChange,
  applyChange,
  runWorkflow as runAgentWorkflow,
} from './DevCodingAgent';
export type {
  ProjectAnalysis,
  FileChangeAction,
  FileChangeRisk,
  ProposedFileChange,
  ChangeProposal,
  ApplyResult,
  WorkflowResult,
} from './DevCodingAgent';

// Log service
export {
  writeLog as writeDevLog,
  queryLogs as queryDevLogs,
  getLogChannels,
  redactMetadata,
} from './LogService';
export type {
  DevLogLevel,
  DevLogChannel,
  DevLogRecord,
  QueryLogsOptions,
} from './LogService';
