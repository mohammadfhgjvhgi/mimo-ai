/**
 * Lightweight tooltip helper for collapsed sidebar buttons.
 * Uses native title attribute to avoid Radix overhead.
 */
import type { HTMLAttributes } from 'react'

export function tooltip(enabled: boolean, label: string): HTMLAttributes<HTMLElement> {
  if (!enabled) return {}
  return { title: label, 'aria-label': label }
}
