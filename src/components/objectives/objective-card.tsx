'use client';

import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import { DepartmentTag } from '@/components/common/department-tag';
import { UserAvatar } from '@/components/common/user-avatar';
import type { Objective } from '@/types';

interface ObjectiveCardProps {
  objective: Objective;
  onClick?: () => void;
}

export function ObjectiveCard({ objective, onClick }: ObjectiveCardProps) {
  const progress = objective.computed_progress ?? objective.manual_progress;
  const taskCount = objective.tasks?.length || 0;
  const completedTasks = objective.tasks?.filter(t => t.status === 'completed').length || 0;

  return (
    <div
      className="Polaris-Card"
      onClick={onClick}
      style={{
        padding: '2rem',
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-surface)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#212b36', flex: 1 }}>{objective.title}</h3>
        <StatusBadge status={objective.status} type="objective" />
      </div>

      {objective.description && (
        <p style={{ fontSize: '1.3rem', color: '#637381', marginBottom: '1rem', lineHeight: '1.5' }}>
          {objective.description.length > 100 ? objective.description.slice(0, 100) + '...' : objective.description}
        </p>
      )}

      <ProgressBar value={progress} size="medium" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          {objective.departments?.map(d => <DepartmentTag key={d.id} department={d} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {taskCount > 0 && (
            <span style={{ fontSize: '1.2rem', color: '#637381' }}>
              {completedTasks}/{taskCount} tareas
            </span>
          )}
          {objective.responsible_user && (
            <UserAvatar user={objective.responsible_user} size="small" />
          )}
        </div>
      </div>
    </div>
  );
}
