import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// State that the mocked server module reads from. Tests mutate these
// between cases to swap in different auth/role responses without
// re-wiring the mocks.
let userResult: { user: { id: string } | null } = { user: null };
let profileResult: { data: { must_change_password: boolean } | null } = {
  data: { must_change_password: false },
};
let uwResult: { data: { role: string } | null } = { data: null };
let createdUserResult: {
  data: { user: { id: string } | null };
  error: { message: string } | null;
} = { data: { user: null }, error: null };
const inserts: Array<{ table: string; row: unknown }> = [];

const mockSupabase: any = {
  auth: {
    getUser: async () => ({ data: userResult }),
  },
  from: (table: string) => ({
    select: () => ({
      eq: () =>
        table === 'profiles'
          ? { single: async () => profileResult }
          : {
              eq: () => ({ single: async () => uwResult }),
              single: async () => uwResult,
            },
    }),
    insert: (row: unknown) => {
      inserts.push({ table, row });
      return Promise.resolve({ error: null });
    },
  }),
};

const mockAdmin: any = {
  auth: {
    admin: {
      createUser: async () => createdUserResult,
    },
  },
  from: (table: string) => ({
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
  return new Request('https://example.test/api/auth/crear-usuario', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: 'new@kublau.com',
  full_name: 'New User',
  password: 'longenough123',
  role: 'member' as const,
  workspace_id: '00000000-0000-0000-0000-000000000001',
  must_change_password: true,
};

describe('POST /api/auth/crear-usuario', () => {
  beforeEach(() => {
    userResult = { user: null };
    profileResult = { data: { must_change_password: false } };
    uwResult = { data: null };
    createdUserResult = { data: { user: null }, error: null };
    inserts.length = 0;
  });

  it('returns 401 when no session', async () => {
    const res = await POST(postBody(validBody));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it('returns 400 when JSON body fails validation', async () => {
    userResult = { user: { id: 'admin-1' } };
    uwResult = { data: { role: 'admin' } };

    const res = await POST(
      postBody({ ...validBody, email: 'not-an-email' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Datos inválidos');
  });

  it('returns 403 when caller is not an admin in the workspace', async () => {
    userResult = { user: { id: 'member-1' } };
    uwResult = { data: { role: 'member' } };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(403);
  });

  it('returns generic error (not Supabase message) when createUser fails', async () => {
    userResult = { user: { id: 'admin-1' } };
    uwResult = { data: { role: 'admin' } };
    createdUserResult = {
      data: { user: null },
      error: { message: 'User already registered: secret@internal.com' },
    };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Error al crear usuario');
    expect(body.error).not.toContain('secret@internal.com');
  });

  it('inserts profile + user_workspaces on success', async () => {
    userResult = { user: { id: 'admin-1' } };
    uwResult = { data: { role: 'admin' } };
    createdUserResult = {
      data: { user: { id: 'new-user-uuid' } },
      error: null,
    };

    const res = await POST(postBody(validBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user_id: string };
    expect(body.user_id).toBe('new-user-uuid');

    const tables = inserts.map((i) => i.table);
    expect(tables).toContain('profiles');
    expect(tables).toContain('user_workspaces');
  });
});
