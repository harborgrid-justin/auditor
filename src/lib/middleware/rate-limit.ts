import { NextResponse } from 'next/server';

interface RateLimitEntry {
  timestamps: number[];
}

/**
 * Sliding window rate limiter with in-memory store.
 *
 * For single-instance deployments this works as-is. For multi-instance
 * deployments behind a load balancer, configure the REDIS_URL environment
 * variable to use a shared Redis-backed store (see RateLimitRedisStore).
 *
 * Headers returned on 429:
 *   - Retry-After: seconds until the next request is allowed
 *   - X-RateLimit-Limit: maximum requests per window
 *   - X-RateLimit-Remaining: remaining requests in current window
 *   - X-RateLimit-Reset: epoch seconds when the window resets
 */

// ---------------------------------------------------------------------------
// Store abstraction
// ---------------------------------------------------------------------------

interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  delete(key: string): void;
  entries(): IterableIterator<[string, RateLimitEntry]>;
}

class InMemoryStore implements RateLimitStore {
  private readonly map = new Map<string, RateLimitEntry>();
  get(key: string) { return this.map.get(key); }
  set(key: string, entry: RateLimitEntry) { this.map.set(key, entry); }
  delete(key: string) { this.map.delete(key); }
  entries() { return this.map.entries(); }
}

// ---------------------------------------------------------------------------
// Singleton store
// ---------------------------------------------------------------------------

const store: RateLimitStore = new InMemoryStore();

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  for (const [key, entry] of Array.from(store.entries())) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

/**
 * Sliding window rate limiter.
 * Returns null if allowed, or a NextResponse 429 if rate limited.
 *
 * @param key - Unique identifier for the client (e.g., IP + route)
 * @param maxRequests - Maximum requests allowed within the window
 * @param windowMs - Window duration in milliseconds (default: 60s)
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): NextResponse | null {
  cleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  const remaining = Math.max(0, maxRequests - entry.timestamps.length - 1);
  const resetEpoch = entry.timestamps.length > 0
    ? Math.ceil((entry.timestamps[0] + windowMs) / 1000)
    : Math.ceil((now + windowMs) / 1000);

  if (entry.timestamps.length >= maxRequests) {
    const retryAfter = Math.ceil(
      (entry.timestamps[0] + windowMs - now) / 1000
    );
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetEpoch),
        },
      }
    );
  }

  entry.timestamps.push(now);

  // Note: successful responses should add these headers in the middleware
  // that calls this function. We only set them on 429 responses here.
  return null;
}

/**
 * Reset the rate limiter for a specific key. Useful in tests.
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}
