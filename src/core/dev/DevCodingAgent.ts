/**
 * MiMo Core — Development Coding Agent
 * --------------------------------------
 * Phase 116: Built-in Development Workspace.
 *
 * An AI agent that can analyze a DevProject, propose changes, and apply
 * them. ALL file mutations go through FileExplorerService (which uses
 * SandboxManager.resolveSafePath + validateWrite). The agent NEVER:
 *   - touches the filesystem directly
 *   - grants itself permissions
 *   - disables the sandbox
 *   - accesses host files outside project root
 *   - imports z-ai-web-dev-sdk directly (uses modelRegistry)
 *
 * Workflow:
 *   analyze → propose → (caller approves high-risk) → apply →
 *   optionally runBuild → optionally runTests → report
 *
 * The model is invoked via `modelRegistry.default().chat()` so the
 * adapter (ZAIModel) is the only place that knows about the SDK.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';
import { modelRegistry } from '../registry';
import type { ModelRequest } from '../types';
import { SandboxError, type SandboxProfile } from './SandboxManager';
import { getProject, type DevProjectRecord, type DevProjectType } from './ProjectManager';
import {
  listFiles,
  readFile,
  writeFile,
  deleteFile,
  type DevFileNode,
} from './FileExplorerService';
import { runBuild } from './BuildSystem';
import { runTests } from './TestRunner';
import { writeLog } from './LogService';

const log = createLogger('dev:agent');

// ─── Types ───

export interface ProjectAnalysis {
  fileCount: number;
  type: DevProjectType;
  runtime: string;
  packageManager: string;
  dependencies: Record<string, string>;
  structure: { path: string; isDirectory: boolean; size: number }[];
}

export type FileChangeAction = 'create' | 'modify' | 'delete';
export type FileChangeRisk = 'low' | 'medium' | 'high';

export interface ProposedFileChange {
  path: string;
  action: FileChangeAction;
  currentContent?: string;
  proposedContent?: string;
  reason: string;
  risk: FileChangeRisk;
}

export interface ChangeProposal {
  files: ProposedFileChange[];
  summary: string;
  highRiskCount: number;
}

export interface ApplyResult {
  applied: number;
  skipped: number;
  errors: string[];
}

export interface WorkflowResult {
  analysis: ProjectAnalysis;
  proposal: ChangeProposal;
  apply: ApplyResult;
  build?: { status: string; errors: number; warnings: number } | null;
  tests?: { passed: number; failed: number; skipped: number } | null;
  summary: string;
}

// ─── analyzeProject ───

export async function analyzeProject(
  projectId: string,
  profile: SandboxProfile = 'standard',
): Promise<ProjectAnalysis> {
  const project = await getProject(projectId);
  if (!project) {
    throw new SandboxError(`project not found: ${projectId}`, 'PROJECT_NOT_FOUND', { projectId });
  }

  // List top-level structure (recursively, but cap)
  const tree = await listFiles(projectId, '', profile);
  const flatStructure = flattenTree(tree).slice(0, 200);

  // Read package.json or requirements.txt for dependencies
  let dependencies: Record<string, string> = {};
  const root = path.resolve(project.rootPath);
  const pkgJsonPath = path.join(root, 'package.json');
  const hasPkgJson = await fs.stat(pkgJsonPath).then(() => true).catch(() => false);
  if (hasPkgJson) {
    try {
      const content = await fs.readFile(pkgJsonPath, 'utf8');
      const pkg = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      dependencies = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
    } catch { /* ignore */ }
  }
  const reqsPath = path.join(root, 'requirements.txt');
  const hasReqs = await fs.stat(reqsPath).then(() => true).catch(() => false);
  if (hasReqs && Object.keys(dependencies).length === 0) {
    try {
      const content = await fs.readFile(reqsPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = trimmed.match(/^([a-zA-Z0-9_\-.]+)[=<>~!]+(.+)$/);
        if (m) dependencies[m[1]!] = m[2]!;
        else dependencies[trimmed] = '*';
      }
    } catch { /* ignore */ }
  }

  return {
    fileCount: flatStructure.length,
    type: project.type,
    runtime: project.runtime,
    packageManager: project.packageManager,
    dependencies,
    structure: flatStructure.map((n) => ({
      path: n.path,
      isDirectory: n.isDirectory,
      size: n.size,
    })),
  };
}

// ─── proposeChange ───

export async function proposeChange(
  projectId: string,
  instruction: string,
  profile: SandboxProfile = 'standard',
): Promise<ChangeProposal> {
  if (!instruction || instruction.trim().length === 0) {
    throw new SandboxError('instruction is required', 'PROFILE_VIOLATION', { action: 'agent.propose' });
  }
  if (instruction.length > 8000) {
    throw new SandboxError('instruction too long (max 8000 chars)', 'PROFILE_VIOLATION', { action: 'agent.propose' });
  }

  const analysis = await analyzeProject(projectId, profile);
  const project = (await getProject(projectId))!;

  // Read up to 10 small files to give the model real context
  const contextFiles: { path: string; content: string }[] = [];
  const candidates = analysis.structure
    .filter((f) => !f.isDirectory)
    .filter((f) => f.size > 0 && f.size < 50_000)
    .slice(0, 10);
  for (const f of candidates) {
    try {
      const data = await readFile(projectId, f.path, profile);
      contextFiles.push({ path: f.path, content: data.content.slice(0, 8192) });
    } catch { /* skip */ }
  }

  const prompt = buildProposalPrompt(project, analysis, contextFiles, instruction);
  const proposalJson = await invokeModelForJson(prompt, projectId);

  const proposal = parseProposal(proposalJson);
  await writeLog(projectId, 'agent', 'info', `change proposed: ${proposal.files.length} file(s), ${proposal.highRiskCount} high-risk`, {
    instruction: instruction.slice(0, 200),
    fileCount: proposal.files.length,
    highRiskCount: proposal.highRiskCount,
  });

  mimoEvents.emit(
    createEvent('dev.agent.proposed' as never, { projectId, fileCount: proposal.files.length }, 'dev:agent'),
  );
  return proposal;
}

// ─── applyChange ───

export async function applyChange(
  projectId: string,
  proposal: ChangeProposal,
  profile: SandboxProfile = 'standard',
  options?: { requireApproval?: boolean; approvedHighRisk?: boolean },
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, skipped: 0, errors: [] };

  for (const change of proposal.files) {
    try {
      // Validate path (defensive — FileExplorerService will also validate)
      if (!change.path || change.path.length === 0) {
        result.errors.push(`invalid path (empty)`);
        result.skipped++;
        continue;
      }
      // Reject absolute / traversal patterns early
      if (/^[/\\]/.test(change.path) || change.path.includes('..')) {
        result.errors.push(`invalid path: ${change.path}`);
        result.skipped++;
        continue;
      }

      if (change.risk === 'high' && options?.requireApproval && !options?.approvedHighRisk) {
        result.errors.push(`high-risk change requires approval: ${change.path}`);
        result.skipped++;
        continue;
      }

      if (change.action === 'create' || change.action === 'modify') {
        if (typeof change.proposedContent !== 'string') {
          result.errors.push(`missing proposedContent for ${change.path}`);
          result.skipped++;
          continue;
        }
        await writeFile(projectId, change.path, change.proposedContent, profile);
        result.applied++;
      } else if (change.action === 'delete') {
        await deleteFile(projectId, change.path, profile);
        result.applied++;
      } else {
        result.errors.push(`unknown action: ${change.action as string} for ${change.path}`);
        result.skipped++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${change.path}: ${msg}`);
      result.skipped++;
    }
  }

  await writeLog(projectId, 'agent', result.errors.length === 0 ? 'info' : 'warn', `change applied: ${result.applied} applied, ${result.skipped} skipped`, {
    applied: result.applied,
    skipped: result.skipped,
    errorCount: result.errors.length,
  });

  mimoEvents.emit(
    createEvent('dev.agent.applied' as never, { projectId, applied: result.applied, skipped: result.skipped }, 'dev:agent'),
  );
  log.info('change applied', { projectId, applied: result.applied, skipped: result.skipped });
  return result;
}

// ─── runWorkflow ───

export async function runWorkflow(
  projectId: string,
  instruction: string,
  profile: SandboxProfile = 'standard',
  options?: { runBuildAfter?: boolean; runTestsAfter?: boolean; approvedHighRisk?: boolean },
): Promise<WorkflowResult> {
  const analysis = await analyzeProject(projectId, profile);
  const proposal = await proposeChange(projectId, instruction, profile);
  const apply = await applyChange(projectId, proposal, profile, {
    requireApproval: proposal.highRiskCount > 0,
    approvedHighRisk: options?.approvedHighRisk,
  });

  let build: WorkflowResult['build'] = null;
  let tests: WorkflowResult['tests'] = null;

  if (options?.runBuildAfter && apply.applied > 0) {
    try {
      const b = await runBuild(projectId, profile);
      build = { status: b.status, errors: b.errors.length, warnings: b.warnings.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      build = { status: 'failed', errors: 1, warnings: 0 };
      await writeLog(projectId, 'agent', 'error', `workflow build step failed: ${msg}`, { instruction: instruction.slice(0, 100) });
    }
  }
  if (options?.runTestsAfter && apply.applied > 0) {
    try {
      const t = await runTests(projectId, profile);
      tests = { passed: t.passed, failed: t.failed, skipped: t.skipped };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tests = { passed: 0, failed: 0, skipped: 0 };
      await writeLog(projectId, 'agent', 'error', `workflow test step failed: ${msg}`, { instruction: instruction.slice(0, 100) });
    }
  }

  const summary = `Applied ${apply.applied} of ${proposal.files.length} changes` +
    (build ? `, build ${build.status}` : '') +
    (tests ? `, ${tests.passed} tests passed` : '');

  await writeLog(projectId, 'agent', 'info', `workflow complete: ${summary}`, {
    applied: apply.applied,
    skipped: apply.skipped,
    buildStatus: build?.status,
    testPassed: tests?.passed,
  });

  return { analysis, proposal, apply, build, tests, summary };
}

// ─── helpers ───

function flattenTree(nodes: DevFileNode[]): DevFileNode[] {
  const out: DevFileNode[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.children) out.push(...flattenTree(n.children));
  }
  return out;
}

function buildProposalPrompt(
  project: DevProjectRecord,
  analysis: ProjectAnalysis,
  contextFiles: { path: string; content: string }[],
  instruction: string,
): string {
  const structure = analysis.structure
    .map((s) => `${s.isDirectory ? 'DIR ' : 'FILE'} ${s.path} (${s.size} bytes)`)
    .join('\n');
  const deps = Object.entries(analysis.dependencies)
    .slice(0, 50)
    .map(([k, v]) => `${k}@${v}`)
    .join(', ');

  const fileBlocks = contextFiles
    .map((f) => `--- FILE: ${f.path} ---\n${f.content}\n--- END FILE ---`)
    .join('\n\n');

  return `You are a coding agent operating inside a sandboxed development workspace.

Project: ${project.name} (type=${project.type}, runtime=${project.runtime}, packageManager=${project.packageManager})

Project structure:
${structure}

Dependencies: ${deps}

Existing files (truncated):
${fileBlocks}

User instruction:
${instruction}

Propose a set of file changes that satisfies the instruction. Return STRICT JSON only — no markdown, no commentary.

JSON schema:
{
  "summary": "<one sentence summary of changes>",
  "files": [
    {
      "path": "<relative path inside project root>",
      "action": "create" | "modify" | "delete",
      "currentContent": "<only for modify/delete — current file contents>",
      "proposedContent": "<only for create/modify — full new file contents>",
      "reason": "<why this change is needed>",
      "risk": "low" | "medium" | "high"
    }
  ]
}

Rules:
- Paths are RELATIVE to the project root. Never use absolute paths or '..'.
- 'high' risk = deletes a file, overwrites a large file, or could break the build.
- Keep proposedContent under 8KB per file.
- Return at most 20 file changes.
- Output ONLY the JSON object. No prose.`;
}

async function invokeModelForJson(prompt: string, projectId: string): Promise<unknown> {
  const model = modelRegistry.default();
  if (!model) {
    throw new SandboxError('no default model registered', 'INTERNAL', { projectId });
  }

  const request: ModelRequest = {
    messages: [
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    maxTokens: 4096,
  };

  const requestId = `agent-${randomUUID()}`;
  await writeLog(projectId, 'agent', 'debug', `model invoked for proposal`, {
    requestId,
    promptChars: prompt.length,
  }, undefined, requestId);

  let response;
  try {
    response = await model.chat(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SandboxError(`model invocation failed: ${msg}`, 'INTERNAL', { projectId, requestId, error: msg });
  }

  return extractJson(response.content);
}

/**
 * Extract a JSON object from a model response that may include markdown
 * fences or surrounding prose. Returns the first valid object found.
 */
function extractJson(content: string): unknown {
  const trimmed = content.trim();
  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }
  // Try to find a ```json ... ``` block
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]!.trim());
    } catch { /* fall through */ }
  }
  // Try to find the first { ... } block (greedy-balanced)
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch { /* fall through */ }
  }
  throw new SandboxError('model did not return valid JSON', 'INTERNAL', { contentPreview: trimmed.slice(0, 500) });
}

function parseProposal(json: unknown): ChangeProposal {
  if (!json || typeof json !== 'object') {
    throw new SandboxError('invalid proposal: expected object', 'INTERNAL');
  }
  const obj = json as Record<string, unknown>;
  const filesRaw = Array.isArray(obj.files) ? obj.files : [];
  const files: ProposedFileChange[] = [];
  let highRiskCount = 0;
  for (const f of filesRaw.slice(0, 20)) {
    const fr = f as Record<string, unknown>;
    const action = String(fr.action ?? '').toLowerCase();
    if (!['create', 'modify', 'delete'].includes(action)) continue;
    const risk = String(fr.risk ?? 'low').toLowerCase();
    const safeRisk: FileChangeRisk = risk === 'high' ? 'high' : risk === 'medium' ? 'medium' : 'low';
    if (safeRisk === 'high') highRiskCount++;
    files.push({
      path: String(fr.path ?? ''),
      action: action as FileChangeAction,
      currentContent: typeof fr.currentContent === 'string' ? fr.currentContent : undefined,
      proposedContent: typeof fr.proposedContent === 'string' ? fr.proposedContent : undefined,
      reason: String(fr.reason ?? ''),
      risk: safeRisk,
    });
  }
  return {
    files,
    summary: String(obj.summary ?? `${files.length} file changes`),
    highRiskCount,
  };
}

// Avoid unused import warning
void db;
