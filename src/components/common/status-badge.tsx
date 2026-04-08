'use client';

import type { ObjectiveStatus, TaskStatus } from '@/types';

const OBJECTIVE_STATUS_CONFIG: Record<ObjectiveStatus, { label: string; color: string; bg: string; icon: string }> = {
  in_progress: { label: 'En progreso', color: '#006fbb', bg: '#ebf5fa', icon: '▶' },
  paused: { label: 'Pausado', color: '#8c6e00', bg: '#fcf1cd', icon: '⏸' },
  deprecated: { label: 'Deprecado', color: '#bf0711', bg: '#fbeae5', icon: '✕' },
  upcoming: { label: 'Próximo', color: '#637381', bg: '#f4f6f8', icon: '◯' },
};

const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Pendiente', color: '#637381', bg: '#f4f6f8', icon: '◯' },
  in_progress: { label: 'En progreso', color: '#006fbb', bg: '#ebf5fa', icon: '▶' },
  completed: { label: 'Completada', color: '#108043', bg: '#e3f1df', icon: '✓' },
  blocked: { label: 'Bloqueada', color: '#bf0711', bg: '#fbeae5', icon: '⚠' },
};

interface StatusBadgeProps {
  status: ObjectiveStatus | TaskStatus;
  type: 'objective' | 'task';
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const config = type === 'objective'
    ? OBJECTIVE_STATUS_CONFIG[status as ObjectiveStatus]
    : TASK_STATUS_CONFIG[status as TaskStatus];

  return (
    <span
      className="Polaris-Badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '1.2rem',
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bg,
      }}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}
