import { describe, it, expect } from 'vitest';
import { kpiSchema } from './kpi';
import { objectiveSchema } from './objective';
import { taskSchema } from './task';
import {
  createUserSchema,
  createUserApiSchema,
  changePasswordSchema,
  changePasswordAdminApiSchema,
} from './user';
import { sendEmailApiSchema } from './email';
import { exportQuarterlyApiSchema } from './export';

// RFC 4122 UUID v4 (version=4, variant=8). Zod v4 `.uuid()` enforces variant bits.
const UUID = '11111111-1111-4111-8111-111111111111';

describe('kpiSchema', () => {
  it('accepts minimal valid input', () => {
    const r = kpiSchema.safeParse({
      title: 'Ventas Q2',
      period_id: UUID,
      workspace_id: UUID,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.progress_mode).toBe('hybrid');
      expect(r.data.manual_progress).toBe(0);
    }
  });

  it('rejects empty title', () => {
    const r = kpiSchema.safeParse({ title: '', period_id: UUID, workspace_id: UUID });
    expect(r.success).toBe(false);
  });

  it('rejects title over 200 chars', () => {
    const r = kpiSchema.safeParse({
      title: 'x'.repeat(201),
      period_id: UUID,
      workspace_id: UUID,
    });
    expect(r.success).toBe(false);
  });

  it('rejects manual_progress outside 0..100', () => {
    const over = kpiSchema.safeParse({
      title: 'k', period_id: UUID, workspace_id: UUID, manual_progress: 101,
    });
    const under = kpiSchema.safeParse({
      title: 'k', period_id: UUID, workspace_id: UUID, manual_progress: -1,
    });
    expect(over.success).toBe(false);
    expect(under.success).toBe(false);
  });

  it('rejects non-uuid ids', () => {
    const r = kpiSchema.safeParse({ title: 'k', period_id: 'not-a-uuid', workspace_id: UUID });
    expect(r.success).toBe(false);
  });
});

describe('objectiveSchema', () => {
  it('defaults status to upcoming and progress_mode to hybrid', () => {
    const r = objectiveSchema.safeParse({
      title: 'Lanzar app',
      period_id: UUID,
      workspace_id: UUID,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('upcoming');
      expect(r.data.progress_mode).toBe('hybrid');
    }
  });

  it('rejects invalid status', () => {
    const r = objectiveSchema.safeParse({
      title: 'x', period_id: UUID, workspace_id: UUID, status: 'frozen',
    });
    expect(r.success).toBe(false);
  });
});

describe('taskSchema', () => {
  it('accepts pending task without optional fields', () => {
    const r = taskSchema.safeParse({ title: 'Do X', objective_id: UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe('pending');
  });

  it('rejects block_reason over 500 chars', () => {
    const r = taskSchema.safeParse({
      title: 't',
      objective_id: UUID,
      status: 'blocked',
      block_reason: 'x'.repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('accepts valid admin creation', () => {
    const r = createUserSchema.safeParse({
      email: 'a@b.com',
      full_name: 'Ada Lovelace',
      role: 'admin',
      workspace_id: UUID,
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const r = createUserSchema.safeParse({
      email: 'not-an-email',
      full_name: 'X',
      workspace_id: UUID,
    });
    expect(r.success).toBe(false);
  });

  it('defaults role to member', () => {
    const r = createUserSchema.safeParse({
      email: 'a@b.com',
      full_name: 'Ada',
      workspace_id: UUID,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe('member');
  });
});

describe('changePasswordSchema', () => {
  it('accepts matching passwords >= 8 chars', () => {
    const r = changePasswordSchema.safeParse({ password: 'longenough', confirmPassword: 'longenough' });
    expect(r.success).toBe(true);
  });

  it('rejects mismatched passwords at confirmPassword path', () => {
    const r = changePasswordSchema.safeParse({ password: 'longenough', confirmPassword: 'different0' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find((i) => i.path[0] === 'confirmPassword')?.message;
      expect(msg).toBe('Las contraseñas no coinciden');
    }
  });

  it('rejects passwords under 8 chars', () => {
    const r = changePasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' });
    expect(r.success).toBe(false);
  });
});

describe('createUserApiSchema', () => {
  it('accepts a full admin-provisioning body and defaults must_change_password=true', () => {
    const r = createUserApiSchema.safeParse({
      email: 'a@b.com',
      full_name: 'Ada',
      role: 'admin',
      workspace_id: UUID,
      password: 'pass12',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.must_change_password).toBe(true);
      expect(r.data.role).toBe('admin');
    }
  });

  it('rejects password under 6 chars', () => {
    const r = createUserApiSchema.safeParse({
      email: 'a@b.com',
      full_name: 'Ada',
      workspace_id: UUID,
      password: 'short',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('password'))).toBe(true);
    }
  });

  it('rejects missing password field', () => {
    const r = createUserApiSchema.safeParse({
      email: 'a@b.com',
      full_name: 'Ada',
      workspace_id: UUID,
    });
    expect(r.success).toBe(false);
  });
});

describe('changePasswordAdminApiSchema', () => {
  it('accepts a minimal valid body', () => {
    const r = changePasswordAdminApiSchema.safeParse({
      target_user_id: UUID,
      workspace_id: UUID,
      password: 'pass12',
    });
    expect(r.success).toBe(true);
  });

  it('accepts the optional must_change_password toggle', () => {
    const r = changePasswordAdminApiSchema.safeParse({
      target_user_id: UUID,
      workspace_id: UUID,
      password: 'pass12',
      must_change_password: false,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.must_change_password).toBe(false);
  });

  it('rejects a non-uuid target_user_id', () => {
    const r = changePasswordAdminApiSchema.safeParse({
      target_user_id: 'nope',
      workspace_id: UUID,
      password: 'pass12',
    });
    expect(r.success).toBe(false);
  });
});

describe('sendEmailApiSchema', () => {
  it('accepts an allow-listed template', () => {
    const r = sendEmailApiSchema.safeParse({
      to: 'user@example.com',
      template_alias: 'monthly-review-reminder',
      template_model: { foo: 'bar' },
      workspace_id: UUID,
    });
    expect(r.success).toBe(true);
  });

  it('defaults template_model to an empty object', () => {
    const r = sendEmailApiSchema.safeParse({
      to: 'user@example.com',
      template_alias: 'welcome-new-user',
      workspace_id: UUID,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.template_model).toEqual({});
  });

  it('rejects an unknown template alias', () => {
    const r = sendEmailApiSchema.safeParse({
      to: 'user@example.com',
      template_alias: 'evil-payload',
      workspace_id: UUID,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-email `to` field', () => {
    const r = sendEmailApiSchema.safeParse({
      to: 'not-email',
      template_alias: 'welcome-new-user',
      workspace_id: UUID,
    });
    expect(r.success).toBe(false);
  });
});

describe('exportQuarterlyApiSchema', () => {
  it('accepts two uuids', () => {
    const r = exportQuarterlyApiSchema.safeParse({ workspace_id: UUID, period_id: UUID });
    expect(r.success).toBe(true);
  });

  it('rejects missing period_id', () => {
    const r = exportQuarterlyApiSchema.safeParse({ workspace_id: UUID });
    expect(r.success).toBe(false);
  });

  it('rejects non-uuid', () => {
    const r = exportQuarterlyApiSchema.safeParse({ workspace_id: UUID, period_id: '123' });
    expect(r.success).toBe(false);
  });
});
