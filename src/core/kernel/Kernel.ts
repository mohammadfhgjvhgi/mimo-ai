/**
 * MiMo Core — Kernel
 * ------------------
 * Boots the system: registers all default Tools, Agents, and Models
 * exactly once. Provides the public API surface the Application layer
 * uses.
 *
 * Calling `mimoKernel.boot()` is idempotent.
 *
 * Phase 116 fix: boot() now also installs graceful-shutdown handlers and
 * runs startup validation (previously dead code).
 */

import { toolRegistry, agentRegistry, modelRegistry } from '../registry';
import { createMockModel, createZAIModel } from '../models';
import { initLocalProvider } from '../models/LocalModelProvider';
import {
  WebSearchTool,
  MemoryRecallTool,
  MemoryStoreTool,
} from '../tools';
import {
  ResearchAgent,
  MemoryAgent,
  PlannerAgent,
  WriterAgent,
} from '../agents';
import { createLogger } from '../logger';
import { getFlags, setFlags, type FeatureFlags } from './flags';
import { installShutdownHandlers } from './GracefulShutdown';
import { startupBoot } from './StartupValidator';
import { consolidateMemories } from '../memory/MemoryIntelligence';

const log = createLogger('kernel');

interface Kernel {
  /** Boot the system (idempotent). Returns true if this call booted. */
  boot(options?: { flags?: Partial<FeatureFlags> }): Promise<boolean>;
  isBooted(): boolean;
  /** Re-apply feature flags at runtime. */
  configure(flags: Partial<FeatureFlags>): void;
}

let booted = false;
let bootPromise: Promise<boolean> | null = null;

async function boot(options?: { flags?: Partial<FeatureFlags> }): Promise<boolean> {
  // If boot is already in-flight, await the same promise (prevents race
  // condition where two concurrent boot() calls both pass the `booted` check
  // and try to register everything twice, causing RegistryError).
  if (bootPromise) {
    log.debug('boot in-flight — awaiting existing promise');
    return bootPromise;
  }
  if (booted) {
    log.debug('already booted — skipping');
    return false;
  }
  if (options?.flags) setFlags(options.flags);

  bootPromise = (async () => {

  // Phase 116: validate environment (DATABASE_URL, disk writability, etc.)
  // Best-effort — never blocks boot, logs warnings.
  try {
    startupBoot();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('startup validation warning', { error: msg });
  }

  // Register tools.
  toolRegistry.register(WebSearchTool);
  toolRegistry.register(MemoryRecallTool);
  toolRegistry.register(MemoryStoreTool);

  // Register agents.
  agentRegistry.register(PlannerAgent);
  agentRegistry.register(ResearchAgent);
  agentRegistry.register(MemoryAgent);
  agentRegistry.register(WriterAgent);

  // Register models.
  // Strategy: Mock model is ALWAYS registered as default (offline-safe, no
  // API key, no network). This guarantees MiMo boots and the full pipeline
  // works in any environment. Real providers (ZAI, Local/Ollama) are then
  // attempted as optional upgrades — if they succeed they become the
  // default, if they fail the Mock stays as default and chat still works.
  const mockModel = createMockModel();
  modelRegistry.register(mockModel, { default: true });
  log.info('mock model registered as default (offline-safe)', { id: mockModel.id });

  // Optional: ZAI provider (z-ai-web-dev-sdk). If the SDK is unavailable
  // or initialization fails, the Mock model remains default and MiMo
  // continues to work. ZAI is NEVER a hard dependency.
  try {
    const zaiModel = createZAIModel();
    modelRegistry.register(zaiModel, { default: true });
    log.info('ZAI model registered and promoted to default', { id: zaiModel.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('ZAI model not registered — using Mock default', { error: msg });
  }

  // Phase 116: detect + register local model provider (Ollama) if available.
  // This is REAL availability detection — no fake registration. If Ollama
  // is not running, the system gracefully continues with the ZAI provider only.
  // The local provider, when available, becomes a fallback for the ModelRouter.
  try {
    const localModel = await initLocalProvider();
    if (localModel) {
      modelRegistry.register(localModel);
      log.info('local model provider registered (Ollama)', { id: localModel.id });
    } else {
      log.info('local model provider not available — Ollama not running (this is OK)');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.debug('local provider detection skipped', { error: msg });
  }

  // Phase 116: install SIGTERM/SIGINT/uncaughtException handlers so
  // in-flight requests + DB connections + child processes shut down cleanly.
  try {
    installShutdownHandlers();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('shutdown handlers not installed', { error: msg });
  }

  // Phase 116: run memory consolidation on boot — deduplicates, merges,
  // archives low-confidence memories, promotes stable memories to knowledge.
  // Fire-and-forget (does not block boot). Catches all errors so boot never
  // fails due to consolidation issues.
  void consolidateMemories()
    .then((result) => {
      if (result && (result.merged > 0 || result.archived > 0 || result.promoted > 0)) {
        log.info('memory consolidation completed', {
          merged: result.merged,
          archived: result.archived,
          promoted: result.promoted,
        });
      }
    })
    .catch((err) => {
      log.warn('memory consolidation failed on boot', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

  booted = true;
  log.info('kernel booted', {
    tools: toolRegistry.list().length,
    agents: agentRegistry.list().length,
    models: modelRegistry.list().length,
    flags: getFlags(),
  });
  return true;
  })(); // close bootPromise IIFE
}

export const mimoKernel: Kernel = {
  boot,
  isBooted: () => booted,
  configure: (flags) => {
    setFlags(flags);
    log.info('flags updated', { flags: getFlags() });
  },
};
