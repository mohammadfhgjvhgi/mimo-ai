/**
 * NOVA AI v5.0 — Date & Time Utilities
 * ------------------------------------
 * Centralised, SSR-safe date formatting.
 *
 * Why this exists:
 * - `toLocaleDateString()` without an explicit `timeZone` renders differently
 *   on the server (UTC) vs the client (local tz), causing React hydration
 *   mismatches.
 * - `Date.now()` used as seed data produces different timestamps on server
 *   and client module evaluation.
 *
 * Rules:
 * - ALWAYS pass an explicit `timeZone` when formatting dates for render.
 * - Seed timestamps must be deterministic constants, never `Date.now()`.
 */

/** User's canonical timezone (set globally for this project). */
export const NOVA_TZ = 'Asia/Jerusalem';

/** Stable seed timestamp for the initial conversation (deterministic SSR). */
export const SEED_CREATED_AT = 1_754_400_000_000; // 2025-08-05T00:00:00Z

/**
 * Formats a timestamp as a short Arabic date (e.g. "٥ أغسطس").
 * Uses an explicit timezone so server and client produce identical output.
 */
export function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'short',
    timeZone: NOVA_TZ,
  });
}

/** Formats a timestamp as a short Arabic time (e.g. "٣:٤٥ م"). */
export function formatShortTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ar-SA', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: NOVA_TZ,
  });
}
