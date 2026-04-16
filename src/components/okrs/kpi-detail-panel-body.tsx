'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import { DepartmentTag } from '@/components/common/department-tag';
import { UserAvatar } from '@/components/common/user-avatar';
import { CommentTimeline } from '@/components/timeline/comment-timeline';
import { KPIForm } from '@/components/kpis/kpi-form';
import { InlineTeamSelect } from './inline-team-select';
import type { KPI, Objective, Department } from '@/types';

interface KpiDetailPanelBodyProps {
  kpiId: string;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
}

/**
 * 1-column adaptation of src/components/kpis/kpi-detail.tsx for the slide-in panel.
 * Adds inline team editing at the top of Detalles; otherwise visually identical.
 */
export function KpiDetailPanelBody({ kpiId, departments, canEdit, onChanged }: KpiDetailPanelBodyProps) {
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [linkedObjectives, setLinkedObjectives] = useState<Objective[]>([]);
  const [linkedDepartments, setLinkedDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [kpiRes, objRes, deptRes] = await Promise.all([
      supabase.from('kpis').select('*, responsible_user:profiles!kpis_responsible_user_id_fkey(*), responsible_department:departments!kpis_responsible_department_id_fkey(*)').eq('id', kpiId).single(),
      supabase.from('kpi_objectives').select('objective:objectives(*, tasks(*))').eq('kpi_id', kpiId),
      supabase.from('kpi_departments').select('department:departments(*)').eq('kpi_id', kpiId),
    ]);
    if (kpiRes.data) setKpi(kpiRes.data as KPI);
    setLinkedObjectives((objRes.data || []).map((r: any) => r.objective).filter(Boolean) as Objective[]);
    setLinkedDepartments((deptRes.data || []).map((r: any) => r.department).filter(Boolean) as Department[]);
    setLoading(false);
  }, [kpiId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !kpi) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando KPI...</div>;
  }

  const progress = kpi.computed_progress ?? kpi.manual_progress;

  function handleTeamChanged() {
    load();
    onChanged();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 600, color: '#212b36', lineHeight: 1.3, margin: 0 }}>{kpi.title}</h1>
          <button
            type="button"
            onClick={() => setShowEditForm(true)}
            style={{
              padding: '0.4rem 1.2rem',
              fontSize: '1.3rem',
              fontWeight: 500,
              color: '#5c6ac4',
              backgroundColor: '#f4f5fc',
              border: '1px solid #e3e5f1',
              borderRadius: '4px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Editar
          </button>
        </div>
        {kpi.description && (
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.8rem', lineHeight: 1.6 }}>{kpi.description}</p>
        )}
      </div>

      {/* Progress card */}
      <div className="Polaris-Card" style={{ padding: '1.6rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36' }}>Progreso</h2>
          <span style={{ fontSize: '2rem', fontWeight: 700, color: '#5c6ac4' }}>{progress}%</span>
        </div>
        <ProgressBar value={progress} size="large" showLabel={false} />
        <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.8rem' }}>
          Modo: {kpi.progress_mode === 'manual' ? 'Manual' : kpi.progress_mode === 'auto' ? 'Automático' : 'Híbrido'}
        </p>
      </div>

      {/* Linked objectives */}
      <div className="Polaris-Card" style={{ padding: '1.6rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>
          Objetivos vinculados ({linkedObjectives.length})
        </h2>
        {linkedObjectives.length === 0 ? (
          <p style={{ color: '#637381', fontSize: '1.3rem' }}>No hay objetivos vinculados a este KPI</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {linkedObjectives.map((obj) => (
              <li key={obj.id} style={{ padding: '1rem 0', borderBottom: '1px solid #f4f6f8' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', gap: '0.8rem' }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36' }}>{obj.title}</span>
                  <StatusBadge status={obj.status} type="objective" />
                </div>
                <ProgressBar value={obj.manual_progress} size="small" />
                {obj.tasks && obj.tasks.length > 0 && (
                  <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.4rem' }}>
                    {obj.tasks.filter(t => t.status === 'completed').length}/{obj.tasks.length} tareas completadas
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Detalles */}
      <div className="Polaris-Card" style={{ padding: '1.6rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>Detalles</h3>

        <div style={{ marginBottom: '1.2rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Depto. responsable</p>
          <InlineTeamSelect
            entity="kpi"
            id={kpi.id}
            currentDepartmentId={kpi.responsible_department_id}
            currentDepartment={kpi.responsible_department}
            departments={departments}
            canEdit={canEdit}
            onChanged={handleTeamChanged}
          />
        </div>

        {kpi.responsible_user && (
          <div style={{ marginBottom: '1.2rem' }}>
            <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Responsable</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <UserAvatar user={kpi.responsible_user} size="small" />
              <span style={{ fontSize: '1.3rem', color: '#212b36' }}>{kpi.responsible_user.full_name}</span>
            </div>
          </div>
        )}

        <div>
          <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Departamentos</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {linkedDepartments.length > 0
              ? linkedDepartments.map((d) => <DepartmentTag key={d.id} department={d} />)
              : <span style={{ fontSize: '1.2rem', color: '#919eab' }}>Ninguno</span>}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <CommentTimeline kpiId={kpiId} />

      {showEditForm && (
        <KPIForm
          workspaceId={kpi.workspace_id}
          periodId={kpi.period_id}
          onClose={() => setShowEditForm(false)}
          onSaved={() => { setShowEditForm(false); handleTeamChanged(); }}
          initialData={{
            id: kpi.id,
            title: kpi.title,
            description: kpi.description ?? '',
            progress_mode: kpi.progress_mode,
            manual_progress: kpi.manual_progress,
            responsible_user_id: kpi.responsible_user_id,
            responsible_department_id: kpi.responsible_department_id,
          }}
        />
      )}
    </div>
  );
}
