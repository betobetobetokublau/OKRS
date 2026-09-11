import { describe, it, expect, vi } from 'vitest';
import { probeConnectivity, formatCountdown } from './connectivity';

describe('probeConnectivity', () => {
  it('returns true on 204 and uses a cache-busting HEAD request', async () => {
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toMatch(/^\/api\/ping\?t=\d+$/);
      expect(init?.method).toBe('HEAD');
      expect(init?.cache).toBe('no-store');
      return new Response(null, { status: 204 });
    });
    expect(await probeConnectivity(f as unknown as typeof fetch)).toBe(true);
  });
  it('returns false on network error', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await probeConnectivity(f as unknown as typeof fetch)).toBe(false);
  });
  it('returns false on server error', async () => {
    const f = vi.fn(async () => new Response(null, { status: 503 }));
    expect(await probeConnectivity(f as unknown as typeof fetch)).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('formats and clamps', () => {
    expect(formatCountdown(10)).toBe('10 s');
    expect(formatCountdown(0.4)).toBe('0 s');
    expect(formatCountdown(-3)).toBe('0 s');
  });
});
