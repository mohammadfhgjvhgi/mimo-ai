// Shared rate limiting utility for API routes
// In-memory per-IP limiter with automatic cleanup of expired entries.

const RATE_LIMIT_WINDOW_MS = 60_000;

// Default limits per endpoint category (requests per minute per IP)
export const RATE_LIMITS = {
  chat: 10, // expensive — LLM calls
  write: 30, // mutations: POST/PUT/PATCH/DELETE on workspace, projects, conversations
  read: 60, // GET requests
  build: 5, // very expensive — build/test/lint commands
} as const;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const limitMaps = new Map<string, Map<string, RateLimitEntry>>();

// Cleanup expired entries every 2 minutes to prevent memory leak
let lastCleanup = Date.now();
function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < 120_000) return;
  lastCleanup = now;
  for (const map of limitMaps.values()) {
    for (const [ip, entry] of map.entries()) {
      if (now > entry.resetAt) {
        map.delete(ip);
      }
    }
  }
}

/**
 * Check rate limit for a given category and IP.
 * Returns { allowed, remaining }.
 */
export function checkRateLimit(
  category: keyof typeof RATE_LIMITS,
  ip: string
): { allowed: boolean; remaining: number } {
  cleanupExpired();

  const max = RATE_LIMITS[category];
  let map = limitMaps.get(category);
  if (!map) {
    map = new Map();
    limitMaps.set(category, map);
  }

  const now = Date.now();
  const entry = map.get(ip);

  if (!entry || now > entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}

/** Extract client IP from request headers */
export function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
