/**
 * MiMo Core — Feature Flags
 * -------------------------
 * Runtime-tunable flags. Readonly from the rest of the system.
 * See MIMO_ENGINEERING_SPEC.md §10.
 */

export interface FeatureFlags {
  readonly deepThinking: boolean;
  readonly webSearch: boolean;
  readonly multiAgent: boolean;
  readonly knowledgeGraph: boolean;
  readonly streamingChat: boolean;
  readonly memoryEngine: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  deepThinking: false,
  webSearch: true,
  multiAgent: true,
  knowledgeGraph: false,
  streamingChat: true,
  memoryEngine: true,
};

/** Current flags. Mutated only via `setFlags` in the kernel. */
let currentFlags: FeatureFlags = { ...DEFAULT_FLAGS };

export function getFlags(): FeatureFlags {
  return currentFlags;
}

export function setFlags(patch: Partial<FeatureFlags>): void {
  currentFlags = { ...currentFlags, ...patch };
}
