import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Mutable mock state — `beforeEach` resets these between cases so the
// mocks can swap in different auth/role/RPC responses without having
// to re-wire vi.mock each time.
let userResult: { user: { id: string } | null } = { user: null };
let profileResult: { data: { must_change_password: boolean } | null } = {
  data: { must_change_password: false },
};
let uwResult: { data: { role: string } | null } = { data: null };
let rpcResult: { data: { ok: boolean; error?: string } | null; error: { message: string } | null } = {
  data: null,
  error: null,
};
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

const mockSupabase: any = {
  auth: {
    getUser: async () => ({ data: userResult }),
  },
  from: (table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({ single: async () => profileResult }),
        }),
      };
    }
    if (table === 'user_workspaces') {
      // requireWorkspaceRole uses select('role').eq(user_id).eq(workspace_id).single()
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ single: async () => uwResult }),
            single: async () => uwResult,
          }),
        }),
      };
    }
    return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
  },
  rpc: async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return rpcResult;
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => mockSupabase,
  createAdminClient: () => mockSupabase,
}));

import { POST } from './route';

function postBody(body: Record<string, unknown>): Request {
  return new Request('https://example.test/api/auth/cambiar-rol-usuario', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  target_user_id: 'target-user-1',
  workspace_id: 'ws-1',
  role: 'manager' as const,
};

describe('POST /api/auth/cambiar-rol-usuario', () => {
  beforeEach(() => {
    userResult = { user: null };
    profileResult = { data: { must_change_password: false } };
    uwResult = { data: null };
    rpcResult = { data: null, error: null };
    rpcCalls.length = 0;
  });

  it('returns 401 when no session', async () => {
    const res = await POST(postBody(validBody));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it('returns 400 when body fails Zod validation', async () => {
    userResult = { user: { id: 'admin-1' } };
    uwResult = { data: { role: 'admin' } };

    const res = await POST(postBody({ ...validBody, role: 'superuser' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Datos inválidos');
  });

  it('returns 403 when caller is not admin in workspace', async () => {
    userResult = { user: { id: 'member-1' } };
    uwResult = { data: { role: 'member' } };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(403);
  });

  it('returns 404 when target user is not in the workspace', async () => {
    userResult = { user: { id: 'admin-nope' } };
    uwResult = { data: { role: 'admin' } };
    rpcResult = { data: { ok: false, error: 'not_in_workspace' }, error: null };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(404);
  });

  it('returns 400 when demoting would leave workspace with no admin', async () => {
    userResult = { user: { id: 'admin-last' } };
    uwResult = { data: { role: 'admin' } };
    rpcResult = { data: { ok: false, error: 'last_admin' }, error: null };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('último administrador');
  });

  it('returns 429 when rate-limited (31st request)', async () => {
    // Use a unique user id for rate-limit isolation — the bucket is
    // in-module state shared across tests.
    userResult = { user: { id: 'admin-rl-rol-1' } };
    uwResult = { data: { role: 'admin' } };
    rpcResult = { data: { ok: true }, error: null };

    // Limit is 30 / minute. First 30 should succeed, the 31st must 429.
    for (let i = 0; i < 30; i++) {
      const ok = await POST(postBody(validBody));
      expect(ok.status).not.toBe(429);
    }
    const thirtyFirst = await POST(postBody(validBody));
    expect(thirtyFirst.status).toBe(429);
    expect(thirtyFirst.headers.get('Retry-After')).toBeTruthy();
  });

  it('returns 200 on successful role change and invokes the RPC', async () => {
    userResult = { user: { id: 'admin-success-1' } };
    uwResult = { data: { role: 'admin' } };
    rpcResult = { data: { ok: true }, error: null };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Confirm we delegated to the atomic RPC.
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.fn).toBe('change_workspace_role');
    expect(rpcCalls[0]?.args).toEqual({
      p_target_user_id: 'target-user-1',
      p_workspace_id: 'ws-1',
      p_new_role: 'manager',
    });
  });
});
