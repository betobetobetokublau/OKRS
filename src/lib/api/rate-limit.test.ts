import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit } from './rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first call within a fresh window', () => {
    const r = checkRateLimit('user:fresh-1', 5, 60_000);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.retryAfterSeconds).toBe(0);
  });

  it('counts calls down to zero, then blocks with Retry-After', () => {
    const key = 'user:count-down';
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit(key, 5, 60_000);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
    const blocked = checkRateLimit(key, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('resets counter after the window elapses', () => {
    const key = 'user:window-reset';
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000);
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(false);

    vi.advanceTimersByTime(61_000);

    const r = checkRateLimit(key, 3, 60_000);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('scopes limits per key (one key blocked does not affect another)', () => {
    for (let i = 0; i < 2; i++) checkRateLimit('k:a', 2, 60_000);
    expect(checkRateLimit('k:a', 2, 60_000).ok).toBe(false);
    expect(checkRateLimit('k:b', 2, 60_000).ok).toBe(true);
  });

  it('Retry-After is always at least 1 second', () => {
    const key = 'user:retry-min';
    for (let i = 0; i < 1; i++) checkRateLimit(key, 1, 100);
    const blocked = checkRateLimit(key, 1, 100);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
