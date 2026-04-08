import type { WorkspaceRole } from '@/types';

const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  admin: 3,
  manager: 2,
  member: 1,
};

export function hasMinRole(userRole: WorkspaceRole, requiredRole: WorkspaceRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === 'admin';
}

export function canManageTeam(role: WorkspaceRole): boolean {
  return role === 'admin';
}

export function canManagePeriods(role: WorkspaceRole): boolean {
  return role === 'admin';
}

export function canManageContent(role: WorkspaceRole): boolean {
  return hasMinRole(role, 'manager');
}

export function canExportPdf(role: WorkspaceRole): boolean {
  return hasMinRole(role, 'manager');
}

export function getRoleLabel(role: WorkspaceRole): string {
  const labels: Record<WorkspaceRole, string> = {
    admin: 'Administrador',
    manager: 'Manager',
    member: 'Miembro',
  };
  return labels[role];
}
