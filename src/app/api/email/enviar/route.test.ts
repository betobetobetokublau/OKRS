import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Mutable state read by the mocked modules. Reset in `beforeEach`.
let userResult: { user: { id: string } | null } = { user: null };
let profileResult: { data: { must_change_password: boolean } | null } = {
  data: { must_change_password: false },
};
let uwResult: { data: { role: string } | null } = { data: null };
let recipientProfileResult: { data: { id: string; email: string } | null } = {
  data: null,
};
let recipientMembershipResult: { data: { user_id: string } | null } = { data: null };
const inserts: Array<{ table: string; row: unknown }> = [];

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
      // Called by `requireWorkspaceRole`: .select.eq.eq.single
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
};

const mockAdmin: any = {
  from: (table: string) => {
    if (table === 'profiles') {
      // .select('id, email').eq('email', to).maybeSingle()
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => recipientProfileResult }),
        }),
      };
    }
    if (table === 'user_workspaces') {
      // .select('user_id').eq.eq.maybeSingle()
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => recipientMembershipResult }),
          }),
        }),
      };
    }
    return {
      insert: (row: unknown) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    };
  },
};

// Catch the email_logs insert as well — note that mockAdmin.from(...) above
// only returns a select shape for the two lookup tables. The route also
// calls `.from('email_logs').insert(...)`. Patch the unknown-table branch
// to expose an insert spy.
const mockAdminFromOriginal = mockAdmin.from;
mockAdmin.from = (table: string) => {
  const base = mockAdminFromOriginal(table);
  return {
    ...base,
    insert: (row: unknown) => {
      inserts.push({ table, row });
      return Promise.resolve({ error: null });
    },
  };
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => mockSupabase,
  createAdminClient: () => mockAdmin,
}));

vi.mock('@/lib/postmark/client', () => ({
  getPostmarkClient: () => ({
    sendEmailWithTemplate: async () => ({ MessageID: 'pm-msg-123' }),
  }),
}));

import { POST } from './route';

function postBody(body: Record<string, unknown>): Request {
  return new Request('https://example.test/api/email/enviar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    to: 'recipient@kublau.com',
    template_alias: 'monthly-review-reminder',
    template_model: { foo: 'bar' },
    workspace_id: WORKSPACE_ID,
    ...overrides,
  };
}

describe('POST /api/email/enviar', () => {
  beforeEach(() => {
    userResult = { user: null };
    profileResult = { data: { must_change_password: false } };
    uwResult = { data: null };
    recipientProfileResult = { data: null };
    recipientMembershipResult = { data: null };
    inserts.length = 0;
  });

  it('returns 401 when no session', async () => {
    const res = await POST(postBody(validBody()));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid payload', async () => {
    userResult = { user: { id: 'email-user-bad' } };
    uwResult = { data: { role: 'manager' } };

    // Unknown template alias → fails the zod enum check.
    const res = await POST(
      postBody(validBody({ template_alias: 'nonexistent-template' })),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Datos inválidos');
  });

  it('returns 403 when caller not in workspace', async () => {
    userResult = { user: { id: 'email-user-403' } };
    uwResult = { data: null }; // requireWorkspaceRole → "No perteneces a este workspace"

    // Use a fresh recipient to avoid colliding with the per-recipient
    // rate-limit bucket from other tests.
    const res = await POST(
      postBody(validBody({ to: 'no-ws-recipient@kublau.com' })),
    );
    expect(res.status).toBe(403);
  });

  it('per-user rate limit returns 429 on 21st call', async () => {
    userResult = { user: { id: 'email-user-rl-user' } };
    uwResult = { data: { role: 'manager' } };
    recipientProfileResult = { data: { id: 'r-1', email: 'unique-r-1@kublau.com' } };
    recipientMembershipResult = { data: { user_id: 'r-1' } };

    // 20 / minute per user. Vary the recipient each call so we don't hit
    // the per-recipient cap first (5 / hour to a single inbox).
    for (let i = 0; i < 20; i++) {
      const res = await POST(
        postBody(validBody({ to: `rl-user-${i}@kublau.com` })),
      );
      expect(res.status).not.toBe(429);
    }
    const twentyFirst = await POST(
      postBody(validBody({ to: 'rl-user-final@kublau.com' })),
    );
    expect(twentyFirst.status).toBe(429);
    expect(twentyFirst.headers.get('Retry-After')).toBeTruthy();
  });

  it('per-recipient rate limit returns 429 on 6th call to same recipient', async () => {
    // Each call must come from a DIFFERENT user so we don't hit the
    // per-user limit first. The per-recipient bucket is keyed on
    // lowercase + trimmed recipient address.
    uwResult = { data: { role: 'manager' } };
    recipientProfileResult = {
      data: { id: 'r-2', email: 'shared-recipient@kublau.com' },
    };
    recipientMembershipResult = { data: { user_id: 'r-2' } };

    const recipient = 'shared-recipient@kublau.com';
    for (let i = 0; i < 5; i++) {
      userResult = { user: { id: `email-user-rl-recipient-${i}` } };
      const res = await POST(postBody(validBody({ to: recipient })));
      expect(res.status).not.toBe(429);
    }
    userResult = { user: { id: 'email-user-rl-recipient-final' } };
    const sixth = await POST(postBody(validBody({ to: recipient })));
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('Retry-After')).toBeTruthy();
  });
});
