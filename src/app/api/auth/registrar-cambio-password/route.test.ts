import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

let userResult: { user: { id: string } | null } = { user: null };
let profileResult: { data: { must_change_password: boolean } | null } = {
  data: { must_change_password: true },
};
let uwResult: { data: { workspace_id: string } | null } = { data: null };
const inserts: Array<{ table: string; row: unknown }> = [];

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
    select: () => ({
      eq: () => ({
        limit: () => ({ maybeSingle: async () => uwResult }),
      }),
    }),
    insert: (row: unknown) => {
      inserts.push({ table, row });
      return Promise.resolve({ error: null });
    },
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => mockSupabase,
  createAdminClient: () => mockAdmin,
}));

import { POST } from './route';

describe('POST /api/auth/registrar-cambio-password', () => {
  beforeEach(() => {
    userResult = { user: null };
    profileResult = { data: { must_change_password: true } };
    uwResult = { data: null };
    inserts.length = 0;
  });

  it('returns 401 when no session', async () => {
    const res = await POST();
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it('passes the must_change_password gate (audits the forced-rotation flow)', async () => {
    userResult = { user: { id: 'user-forced-rotate' } };
    profileResult = { data: { must_change_password: true } };
    uwResult = { data: { workspace_id: 'ws-1' } };

    const res = await POST();
    expect(res.status).toBe(200);
    expect(inserts).toEqual([
      {
        table: 'password_reset_audits',
        row: {
          actor_user_id: 'user-forced-rotate',
          target_user_id: 'user-forced-rotate',
          workspace_id: 'ws-1',
          must_change_password: false,
        },
      },
    ]);
  });

  it('returns ok with skipped marker when user has no workspace', async () => {
    userResult = { user: { id: 'user-no-ws' } };
    uwResult = { data: null };

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped?: string };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe('no-workspace');
    expect(inserts).toHaveLength(0);
  });

  it('rate-limits the 6th call from the same user within a minute', async () => {
    userResult = { user: { id: 'user-rl-test' } };
    uwResult = { data: { workspace_id: 'ws-1' } };

    for (let i = 0; i < 5; i++) {
      const ok = await POST();
      expect(ok.status).toBe(200);
    }
    const sixth = await POST();
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('Retry-After')).toBeTruthy();
  });
});
