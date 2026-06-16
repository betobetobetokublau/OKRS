import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// State shared between the test cases and the mocked module. Reset
// in `beforeEach`.
let userResult: { user: { id: string } | null } = { user: null };
let profileResult: { data: { must_change_password: boolean } | null } = {
  data: { must_change_password: false },
};
let uwResult: { data: { role: string } | null } = { data: null };
let targetUwResult: { data: { user_id: string } | null } = { data: null };
let updateUserResult: { error: { message: string } | null } = { error: null };
const inserts: Array<{ table: string; row: unknown }> = [];

// `user_workspaces` is queried twice per call: first by `requireWorkspaceRole`
// (returns the caller's role) and then by the route (returns the target row).
// We use a tiny stateful counter to switch which response the same `.single()`
// chain returns on the 1st vs 2nd call.
const _selectCounter = {
  i: 0,
  next<T>(first: T, second: T): T {
    const v = this.i === 0 ? first : second;
    this.i += 1;
    return v;
  },
  reset() {
    this.i = 0;
  },
};

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
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => _selectCounter.next<unknown>(uwResult, targetUwResult),
            }),
            single: async () => _selectCounter.next<unknown>(uwResult, targetUwResult),
          }),
        }),
      };
    }
    return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
  },
};

const mockAdmin: any = {
  auth: {
    admin: {
      updateUserById: async () => updateUserResult,
    },
  },
  from: (table: string) => ({
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
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

function postBody(body: Record<string, unknown>): Request {
  return new Request('https://example.test/api/auth/cambiar-password-usuario', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Valid UUIDs — the admin password-change schema enforces strict z.uuid().
const TARGET_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

const validBody = {
  target_user_id: TARGET_ID,
  workspace_id: WORKSPACE_ID,
  password: 'longenough123',
  must_change_password: true,
};

describe('POST /api/auth/cambiar-password-usuario', () => {
  beforeEach(() => {
    userResult = { user: null };
    profileResult = { data: { must_change_password: false } };
    uwResult = { data: null };
    targetUwResult = { data: null };
    updateUserResult = { error: null };
    inserts.length = 0;
    _selectCounter.reset();
  });

  it('returns 401 when no session', async () => {
    const res = await POST(postBody(validBody));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    userResult = { user: { id: 'member-pw-1' } };
    uwResult = { data: { role: 'member' } };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(403);
  });

  it('returns 404 when target_user_id is not in workspace', async () => {
    userResult = { user: { id: 'admin-pw-1' } };
    uwResult = { data: { role: 'admin' } };
    targetUwResult = { data: null };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('El usuario no pertenece a este workspace');
  });

  it('returns 400 with generic error (not leaking Supabase error) when updateUserById fails', async () => {
    userResult = { user: { id: 'admin-pw-2' } };
    uwResult = { data: { role: 'admin' } };
    targetUwResult = { data: { user_id: TARGET_ID } };
    updateUserResult = { error: { message: 'User not found: secret@internal.com' } };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('No se pudo actualizar la contraseña');
    expect(body.error).not.toContain('secret@internal.com');
  });

  it('writes a password_reset_audits row on success', async () => {
    userResult = { user: { id: 'admin-pw-3' } };
    uwResult = { data: { role: 'admin' } };
    targetUwResult = { data: { user_id: TARGET_ID } };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(200);

    const audit = inserts.find((i) => i.table === 'password_reset_audits');
    expect(audit).toBeTruthy();
    expect(audit!.row).toEqual({
      actor_user_id: 'admin-pw-3',
      target_user_id: TARGET_ID,
      workspace_id: WORKSPACE_ID,
      must_change_password: true,
    });
  });

  it('returns 200 on success', async () => {
    userResult = { user: { id: 'admin-pw-4' } };
    uwResult = { data: { role: 'admin' } };
    targetUwResult = { data: { user_id: TARGET_ID } };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
