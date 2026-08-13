// ===================================================================
// MiMo AI — Checkpoint Service (P4-2)
// ===================================================================
// Saves and restores mission execution state for resume after crash.
//
// A checkpoint captures:
//   - conversationId: which conversation the mission belongs to
//   - missionId: unique identifier for the mission run
//   - taskGraph: JSON serialization of task IDs + statuses
//
// Checkpoints are saved:
//   - At mission start (initial state)
//   - After each task completion
//
// On resume:
//   - Load the latest checkpoint for the conversation
//   - Reconstruct the task graph
//   - Skip already-completed tasks
//   - Continue from where the mission left off
// ===================================================================

import { db } from "@/lib/db";

export interface CheckpointData {
  missionId: string;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dependencies: string[];
  }>;
}

/**
 * Save a checkpoint for a mission.
 */
export async function saveCheckpoint(
  conversationId: string,
  missionId: string,
  taskGraph: CheckpointData
): Promise<void> {
  try {
    await db.checkpoint.create({
      data: {
        conversationId,
        missionId,
        taskGraph: JSON.stringify(taskGraph),
      },
    });
  } catch (err) {
    // Non-fatal — checkpoint is best-effort
    console.warn(`[checkpoint] Failed to save checkpoint for ${conversationId}:`, err);
  }
}

/**
 * Load the latest checkpoint for a conversation.
 * Returns null if no checkpoint exists.
 */
export async function loadLatestCheckpoint(
  conversationId: string
): Promise<{ missionId: string; taskGraph: CheckpointData; createdAt: Date } | null> {
  try {
    const checkpoint = await db.checkpoint.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });

    if (!checkpoint) return null;

    return {
      missionId: checkpoint.missionId,
      taskGraph: JSON.parse(checkpoint.taskGraph),
      createdAt: checkpoint.createdAt,
    };
  } catch (err) {
    console.warn(`[checkpoint] Failed to load checkpoint for ${conversationId}:`, err);
    return null;
  }
}

/**
 * Delete all checkpoints for a conversation (cleanup after mission completes).
 */
export async function clearCheckpoints(conversationId: string): Promise<void> {
  try {
    await db.checkpoint.deleteMany({ where: { conversationId } });
  } catch (err) {
    console.warn(`[checkpoint] Failed to clear checkpoints for ${conversationId}:`, err);
  }
}
