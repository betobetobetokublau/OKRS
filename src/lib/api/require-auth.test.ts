import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => mockSupabase,
}));

let userResult: { user: { id: string } | null } = { user: null };
let profileResult: { data: { must_change_password: boolean } | null } = { data: null };
let uwResult: { data: { role: string } | null } = { data: null };

const mockSupabase: any = {
  auth: {
    getUser: async () => ({ data: userResult }),
  },
  from: (table: string) => ({
    select: () => ({
      eq: (...args: unknown[]) =>
        table === 'profiles'
          ? { single: async () => profileResult }
          : {
              eq: () => ({ single: async () => uwResult }),
              single: async () => uwResult,
              _args: args,
            },
    }),
  }),
};

import { requireAuth, requireWorkspaceRole } from './require-auth';

describe('requireAuth', () => {
  beforeEach(() => {
    userResult = { user: null };
    profileResult = { data: null };
  });

  it('returns 401 when no session', async () => {
    const res = await requireAuth();
    expect(res).toBeInstanceOf(NextResponse);
    if (res instanceof NextResponse) {
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('No autorizado');
    }
  });

  it('returns 428 when user has must_change_password = true', async () => {
    userResult = { user: { id: 'user-a' } };
    profileResult = { data: { must_change_password: true } };

    const res = await requireAuth();
    expect(res).toBeInstanceOf(NextResponse);
    if (res instanceof NextResponse) {
      expect(res.status).toBe(428);
    }
  });

  it('passes through must_change_password when allowMustChangePassword is true', async () => {
    userResult = { user: { id: 'user-a' } };
    profileResult = { data: { must_change_password: true } };

    const res = await requireAuth({ allowMustChangePassword: true });
    expect(res).not.toBeInstanceOf(NextResponse);
    if (!(res instanceof NextResponse)) {
      expect(res.user.id).toBe('user-a');
    }
  });

  it('returns user + supabase when password is current', async () => {
    userResult = { user: { id: 'user-a' } };
    profileResult = { data: { must_change_password: false } };

    const res = await requireAuth();
    expect(res).not.toBeInstanceOf(NextResponse);
    if (!(res instanceof NextResponse)) {
      expect(res.user.id).toBe('user-a');
      expect(res.supabase).toBeDefined();
    }
  });
});

describe('requireWorkspaceRole', () => {
  beforeEach(() => {
    uwResult = { data: null };
  });

  it('returns 400 when workspaceId is missing', async () => {
    const res = await requireWorkspaceRole(mockSupabase, 'user-a', '');
    expect(res).toBeInstanceOf(NextResponse);
    if (res instanceof NextResponse) expect(res.status).toBe(400);
  });

  it('returns 403 when user is not a member', async () => {
    uwResult = { data: null };
    const res = await requireWorkspaceRole(mockSupabase, 'user-a', 'ws-1');
    expect(res).toBeInstanceOf(NextResponse);
    if (res instanceof NextResponse) {
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('No perteneces a este workspace');
    }
  });

  it('returns 403 when role is below the minimum', async () => {
    uwResult = { data: { role: 'member' } };
    const res = await requireWorkspaceRole(mockSupabase, 'user-a', 'ws-1', 'admin');
    expect(res).toBeInstanceOf(NextResponse);
    if (res instanceof NextResponse) {
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Permisos insuficientes');
    }
  });

  it('returns role on success when minimum is met', async () => {
    uwResult = { data: { role: 'admin' } };
    const res = await requireWorkspaceRole(mockSupabase, 'user-a', 'ws-1', 'admin');
    expect(res).toBe('admin');
  });

  it('returns role when manager satisfies a manager-min check', async () => {
    uwResult = { data: { role: 'manager' } };
    const res = await requireWorkspaceRole(mockSupabase, 'user-a', 'ws-1', 'manager');
    expect(res).toBe('manager');
  });

  it('returns role when admin satisfies a member-min check', async () => {
    uwResult = { data: { role: 'admin' } };
    const res = await requireWorkspaceRole(mockSupabase, 'user-a', 'ws-1', 'member');
    expect(res).toBe('admin');
  });
});
