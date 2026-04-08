'use client';

import { ProgressBar } from '@/components/common/progress-bar';
import { DepartmentTag } from '@/components/common/department-tag';
import { UserAvatar } from '@/components/common/user-avatar';
import type { KPI } from '@/types';

interface KPICardProps {
  kpi: KPI;
  onClick?: () => void;
}

export function KPICard({ kpi, onClick }: KPICardProps) {
  const progress = kpi.computed_progress ?? kpi.manual_progress;

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
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#212b36', flex: 1 }}>{kpi.title}</h3>
        <span style={{ fontSize: '2rem', fontWeight: 700, color: '#5c6ac4', marginLeft: '1rem' }}>{progress}%</span>
      </div>

      {kpi.description && (
        <p style={{ fontSize: '1.3rem', color: '#637381', marginBottom: '1.2rem', lineHeight: '1.5' }}>
          {kpi.description.length > 100 ? kpi.description.slice(0, 100) + '...' : kpi.description}
        </p>
      )}

      <ProgressBar value={progress} size="medium" showLabel={false} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.2rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {kpi.departments?.map(d => <DepartmentTag key={d.id} department={d} />)}
        </div>
        {kpi.responsible_user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <UserAvatar user={kpi.responsible_user} size="small" />
            <span style={{ fontSize: '1.2rem', color: '#637381' }}>{kpi.responsible_user.full_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
