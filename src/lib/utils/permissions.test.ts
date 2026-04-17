import { describe, it, expect } from 'vitest';
import {
  hasMinRole,
  canManageWorkspace,
  canManageTeam,
  canManagePeriods,
  canManageContent,
  canExportPdf,
  getRoleLabel,
} from './permissions';

describe('hasMinRole', () => {
  it('admin satisfies every minimum', () => {
    expect(hasMinRole('admin', 'admin')).toBe(true);
    expect(hasMinRole('admin', 'manager')).toBe(true);
    expect(hasMinRole('admin', 'member')).toBe(true);
  });

  it('manager satisfies manager and member but not admin', () => {
    expect(hasMinRole('manager', 'admin')).toBe(false);
    expect(hasMinRole('manager', 'manager')).toBe(true);
    expect(hasMinRole('manager', 'member')).toBe(true);
  });

  it('member only satisfies member', () => {
    expect(hasMinRole('member', 'admin')).toBe(false);
    expect(hasMinRole('member', 'manager')).toBe(false);
    expect(hasMinRole('member', 'member')).toBe(true);
  });
});

describe('workspace admin gates', () => {
  it('canManageWorkspace, canManageTeam, canManagePeriods are admin-only', () => {
    expect(canManageWorkspace('admin')).toBe(true);
    expect(canManageWorkspace('manager')).toBe(false);
    expect(canManageWorkspace('member')).toBe(false);

    expect(canManageTeam('admin')).toBe(true);
    expect(canManageTeam('manager')).toBe(false);
    expect(canManageTeam('member')).toBe(false);

    expect(canManagePeriods('admin')).toBe(true);
    expect(canManagePeriods('manager')).toBe(false);
    expect(canManagePeriods('member')).toBe(false);
  });
});

describe('content + pdf gates', () => {
  it('canManageContent requires manager+', () => {
    expect(canManageContent('admin')).toBe(true);
    expect(canManageContent('manager')).toBe(true);
    expect(canManageContent('member')).toBe(false);
  });

  it('canExportPdf requires manager+', () => {
    expect(canExportPdf('admin')).toBe(true);
    expect(canExportPdf('manager')).toBe(true);
    expect(canExportPdf('member')).toBe(false);
  });
});

describe('getRoleLabel', () => {
  it('returns Spanish labels for every role', () => {
    expect(getRoleLabel('admin')).toBe('Administrador');
    expect(getRoleLabel('manager')).toBe('Manager');
    expect(getRoleLabel('member')).toBe('Miembro');
  });
});
