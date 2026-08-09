/**
 * MiMo AI — Reliability Layer
 *
 * Based on:
 * - Circuit Breaker pattern (LiteLLM Redis implementation, April 2026)
 * - Graceful Degradation (BuildMVPFast, April 2026) — 5-layer ladder
 * - Idempotency (Arpit Bhayani) — idempotency keys for retry-safe agents
 * - Saga Pattern (Microsoft Azure Architecture Center) — compensating transactions
 *
 * States: Closed → Open → Half-Open
 */

type CircuitState = 'closed' | 'open' | 'half-open'

interface CircuitBreakerConfig {
  failureThreshold: number  // failures before opening
  recoveryTimeout: number   // ms before half-open
  halfOpenMaxCalls: number  // test calls in half-open
}

interface CircuitBreakerState {
  state: CircuitState
  failureCount: number
  successCount: number
  lastFailureTime: number
  halfOpenCalls: number
}

/**
 * In-memory circuit breaker (production: use Redis)
 */
class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map()
  private config: CircuitBreakerConfig

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeout: config.recoveryTimeout ?? 60_000, // 1 minute
      halfOpenMaxCalls: config.halfOpenMaxCalls ?? 3,
    }
  }

  /**
   * Check if a call is allowed
   */
  canCall(key: string): boolean {
    const state = this.states.get(key)

    if (!state) {
      return true // no state = closed = allow
    }

    switch (state.state) {
      case 'closed':
        return true
      case 'open':
        // Check if recovery timeout has passed
        const now = Date.now()
        if (now - state.lastFailureTime > this.config.recoveryTimeout) {
          // Transition to half-open
          state.state = 'half-open'
          state.halfOpenCalls = 0
          return true
        }
        return false // still open
      case 'half-open':
        // Allow limited test calls
        return state.halfOpenCalls < this.config.halfOpenMaxCalls
    }
  }

  /**
   * Record a successful call
   */
  recordSuccess(key: string): void {
    const state = this.states.get(key)

    if (!state) return

    if (state.state === 'half-open') {
      state.successCount++
      state.halfOpenCalls++

      // If enough successes in half-open, close the circuit
      if (state.successCount >= this.config.halfOpenMaxCalls) {
        state.state = 'closed'
        state.failureCount = 0
        state.successCount = 0
      }
    } else if (state.state === 'closed') {
      // Reset failure count on success
      state.failureCount = 0
    }
  }

  /**
   * Record a failed call
   */
  recordFailure(key: string): void {
    let state = this.states.get(key)

    if (!state) {
      state = {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        halfOpenCalls: 0,
      }
      this.states.set(key, state)
    }

    state.failureCount++
    state.lastFailureTime = Date.now()

    if (state.state === 'half-open') {
      // Failure in half-open → back to open
      state.state = 'open'
      state.halfOpenCalls = 0
    } else if (state.state === 'closed' && state.failureCount >= this.config.failureThreshold) {
      // Too many failures → open the circuit
      state.state = 'open'
    }
  }

  /**
   * Get current state for monitoring
   */
  getState(key: string): CircuitBreakerState | null {
    return this.states.get(key) ?? null
  }

  /**
   * Get all states (for dashboard)
   */
  getAllStates(): Record<string, CircuitBreakerState> {
    const result: Record<string, CircuitBreakerState> = {}
    for (const [key, state] of this.states.entries()) {
      result[key] = state
    }
    return result
  }
}

/**
 * Fallback Chain — 5-layer degradation ladder
 *
 * Layer 1: Primary model (GLM-4.6)
 * Layer 2: Cheaper/faster model (GLM-4.5-Flash)
 * Layer 3: Cached prior response
 * Layer 4: Checkpoint + resume later
 * Layer 5: Degraded UX ("I can't complete this now")
 */
export class FallbackChain<T> {
  private layers: Array<{
    name: string
    execute: () => Promise<T>
    condition?: (error: Error) => boolean
  }> = []

  addLayer(
    name: string,
    execute: () => Promise<T>,
    condition?: (error: Error) => boolean
  ): this {
    this.layers.push({ name, execute, condition })
    return this
  }

  async execute(): Promise<{ result: T; layer: string }> {
    let lastError: Error | null = null

    for (const layer of this.layers) {
      try {
        // If this is not the first layer, check condition
        if (lastError && layer.condition && !layer.condition(lastError)) {
          continue // skip this layer if condition not met
        }

        const result = await layer.execute()
        return { result, layer: layer.name }
      } catch (e) {
        lastError = e as Error
        // Continue to next layer
      }
    }

    throw lastError ?? new Error('All fallback layers failed')
  }
}

/**
 * Idempotency Manager
 * Prevents duplicate side effects on retry
 */
class IdempotencyManager {
  private cache: Map<string, { result: unknown; timestamp: number }> = new Map()
  private ttl: number

  constructor(ttl: number = 300_000) {
    this.ttl = ttl // 5 minutes default
  }

  /**
   * Execute a function with idempotency guarantee
   * If the same key has been used recently, return cached result
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // Check cache
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.result as T
    }

    // Execute
    const result = await fn()

    // Cache
    this.cache.set(key, { result, timestamp: Date.now() })

    // Cleanup old entries
    this.cleanup()

    return result
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key)
      }
    }
  }
}

/**
 * Retry with exponential backoff + jitter
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    baseDelay?: number
    maxDelay?: number
    shouldRetry?: (error: Error, attempt: number) => boolean
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 8000,
    shouldRetry = () => true,
  } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e as Error

      if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
        throw lastError
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelay
      )

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// Singleton instances
export const circuitBreaker = new CircuitBreaker()
export const idempotencyManager = new IdempotencyManager()
