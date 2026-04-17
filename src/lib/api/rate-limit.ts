/**
 * Tiny in-memory token bucket. Good enough for a single-node Vercel
 * serverless function to blunt brute-force / spam on low-traffic
 * admin endpoints; for production multi-region, swap to Redis / Upstash.
 *
 * Keyed by caller-identity (user id, ip, etc). Window is rolling per key.
 */

type Bucket = { count: number; resetAt: number };

// NB: this lives in-module and therefore resets on every cold start. That's
// acceptable — we're just raising the cost of scripted abuse, not auditing.
const BUCKETS = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  b.count += 1;
  return { ok: true, retryAfterSeconds: 0, remaining: limit - b.count };
}
