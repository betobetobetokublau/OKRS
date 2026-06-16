import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Shared mutable state. Reset in `beforeEach`.
let userResult: { user: { id: string } | null } = { user: null };
let profileResult: { data: { must_change_password: boolean } | null } = {
  data: { must_change_password: false },
};
let updateError: { message: string } | null = null;
// Capture profile updates so we can assert `onboarded_at` was written.
const updates: Array<{ table: string; values: Record<string, unknown>; id: string }> = [];

const mockSupabase: any = {
  auth: {
    getUser: async () => ({ data: userResult }),
  },
  from: (table: string) => ({
    select: () => ({
      eq: () => ({ single: async () => profileResult }),
    }),
    _table: table,
  }),
};

const mockAdmin: any = {
  from: (table: string) => ({
    update: (values: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => {
        updates.push({ table, values, id });
        return Promise.resolve({ error: updateError });
      },
    }),
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => mockSupabase,
  createAdminClient: () => mockAdmin,
}));

import { POST } from './route';

describe('POST /api/onboarding/completar', () => {
  beforeEach(() => {
    userResult = { user: null };
    profileResult = { data: { must_change_password: false } };
    updateError = null;
    updates.length = 0;
  });

  it('returns 401 when no session', async () => {
    const res = await POST();
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate-limited', async () => {
    // 20 / minute. Use a unique user id so this test's bucket is isolated
    // from any other test that touches the onboarding endpoint.
    userResult = { user: { id: 'onboarding-rl-1' } };

    for (let i = 0; i < 20; i++) {
      const ok = await POST();
      expect(ok.status).not.toBe(429);
    }
    const twentyFirst = await POST();
    expect(twentyFirst.status).toBe(429);
    expect(twentyFirst.headers.get('Retry-After')).toBeTruthy();
  });

  it('returns 200 on success and writes onboarded_at', async () => {
    userResult = { user: { id: 'onboarding-success-1' } };

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(updates).toHaveLength(1);
    const u = updates[0]!;
    expect(u.table).toBe('profiles');
    expect(u.id).toBe('onboarding-success-1');
    // `onboarded_at` should be an ISO timestamp string.
    expect(typeof u.values.onboarded_at).toBe('string');
    expect(() => new Date(u.values.onboarded_at as string).toISOString()).not.toThrow();
  });
});
