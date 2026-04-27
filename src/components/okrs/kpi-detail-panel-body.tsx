'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import { DepartmentTag } from '@/components/common/department-tag';
import { CommentTimeline } from '@/components/timeline/comment-timeline';
import { KPIForm } from '@/components/kpis/kpi-form';
import { ObjectiveForm } from '@/components/objectives/objective-form';
import { InlineTeamSelect } from './inline-team-select';
import { InlineStatusSelect } from './inline-status-select';
import { InlineUserSelect } from './inline-user-select';
import {
  AsanaDetailShell,
  AsanaSection,
  AsanaEmpty,
  formatShortDate,
  type FieldRow,
  type BreadcrumbItem,
} from './asana-detail-shell';
import { calculateKpiProgress, calculateObjectiveProgress } from '@/lib/utils/progress';
import type { KPI, Objective, Department, Period } from '@/types';

interface KpiDetailPanelBodyProps {
  kpiId: string;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
}

/**
 * KPI detail in Asana-style layout: breadcrumb + title + fields table + sections.
 * Used verbatim by the slide-in panel AND by the `/kpis/[id]` page (wrapped in
 * page chrome).
 */
export function KpiDetailPanelBody({ kpiId, departments, canEdit, onChanged }: KpiDetailPanelBodyProps) {
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [linkedObjectives, setLinkedObjectives] = useState<Objective[]>([]);
  const [linkedDepartments, setLinkedDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showObjectiveForm, setShowObjectiveForm] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [kpiRes, objRes, deptRes] = await Promise.all([
      supabase.from('kpis').select('*, responsible_user:profiles!kpis_responsible_user_id_fkey(*), responsible_department:departments!kpis_responsible_department_id_fkey(*)').eq('id', kpiId).single(),
      supabase.from('kpi_objectives').select('objective:objectives(*, tasks(*))').eq('kpi_id', kpiId),
      supabase.from('kpi_departments').select('department:departments(*)').eq('kpi_id', kpiId),
    ]);
    if (kpiRes.data) {
      const k = kpiRes.data as KPI;
      setKpi(k);
      const { data: p } = await supabase.from('periods').select('*').eq('id', k.period_id).single();
      if (p) setPeriod(p as Period);
    }
    // Supabase flattens the joined record to either an object or a 1-item array
    // depending on version; tolerate either shape.
    setLinkedObjectives(
      (objRes.data || [])
        .map((r: any) => (Array.isArray(r.objective) ? r.objective[0] : r.objective))
        .filter(Boolean) as Objective[],
    );
    setLinkedDepartments(
      (deptRes.data || [])
        .map((r: any) => (Array.isArray(r.department) ? r.department[0] : r.department))
        .filter(Boolean) as Department[],
    );
    setLoading(false);
  }, [kpiId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !kpi) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando KPI...</div>;
  }

  const progress = calculateKpiProgress(
    kpi,
    linkedObjectives.map((obj) => ({
      objective: { ...obj, computed_progress: calculateObjectiveProgress(obj, obj.tasks || []) },
      tasks: obj.tasks || [],
    })),
  );

  function refresh() {
    load();
    onChanged();
  }

  async function saveManualProgress(value: number) {
    setSavingManual(true);
    const supabase = createClient();
    await supabase.from('kpis').update({ manual_progress: value }).eq('id', kpi!.id);
    setSavingManual(false);
    refresh();
  }

  // "Editable via the current-progress slider" is only true for the
  // two modes where the manual knob actually writes through to the
  // computed progress meaningfully. For auto mode the slider is
  // read-only with a red explanation message underneath (per the
  // design update that removed the separate "Progreso manual" section
  // and unified the slider into one).
  const canEditProgress = canEdit && (kpi.progress_mode === 'manual' || kpi.progress_mode === 'hybrid');
  const progressErrorMessage = !canEdit
    ? 'No tienes permisos para cambiar este progreso.'
    : kpi.progress_mode === 'auto'
      ? 'El progreso se calcula automáticamente a partir de los objetivos vinculados.'
      : null;
  const breadcrumb: BreadcrumbItem[] = period ? [{ label: `Periodo: ${period.name}` }] : [];

  const fields: FieldRow[] = [
    {
      label: 'Responsable',
      // Inline-editable for every role — same treatment as the
      // objective panel. Structural KPI edits stay gated behind the
      // Editar form modal; assignment is the operational field that
      // shouldn't require entering edit mode.
      value: (
        <InlineUserSelect
          entity="kpi"
          id={kpi.id}
          workspaceId={kpi.workspace_id}
          currentUserId={kpi.responsible_user_id}
          currentUser={kpi.responsible_user}
          canEdit
          onChanged={refresh}
        />
      ),
    },
    {
      label: 'Depto. responsable',
      // Hardcoded canEdit so members (who can't manage KPI structure)
      // can still reassign the responsible department without going
      // through the edit modal.
      value: (
        <InlineTeamSelect
          entity="kpi"
          id={kpi.id}
          currentDepartmentId={kpi.responsible_department_id}
          currentDepartment={kpi.responsible_department}
          departments={departments}
          canEdit
          onChanged={refresh}
        />
      ),
    },
    {
      label: 'Departamentos',
      value:
        linkedDepartments.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {linkedDepartments.map((d) => (
              <DepartmentTag key={d.id} department={d} />
            ))}
          </div>
        ) : (
          <AsanaEmpty>Ninguno</AsanaEmpty>
        ),
    },
    {
      label: 'Estado',
      value: (
        <InlineStatusSelect
          entity="kpi"
          id={kpi.id}
          currentStatus={kpi.status}
          canEdit={canEdit}
          onChanged={refresh}
        />
      ),
    },
    {
      label: 'Modo de progreso',
      value: (
        <span>
          {kpi.progress_mode === 'manual' ? 'Manual' : kpi.progress_mode === 'auto' ? 'Automático' : 'Híbrido'}
        </span>
      ),
    },
  ];

  if (period) {
    fields.push({
      label: 'Periodo',
      value: (
        <span>
          {period.name}
          <span style={{ color: '#919eab', marginLeft: '0.6rem' }}>
            ({formatShortDate(period.start_date)} – {formatShortDate(period.end_date)})
          </span>
        </span>
      ),
    });
  }

  return (
    <>
      <AsanaDetailShell
        breadcrumb={breadcrumb}
        title={kpi.title}
        onEdit={canEdit ? () => setShowEditForm(true) : undefined}
        fields={fields}
      >
        {/* Progress — single unified slider. When editable it writes
            directly to manual_progress on mouse-up / touch-end. When
            not editable (auto mode, or lacking permissions), a red
            message below explains why. */}
        <AsanaSection title="Progreso">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
            <span style={{ fontSize: '1.2rem', color: '#637381' }}>
              Modo {kpi.progress_mode === 'manual' ? 'manual' : kpi.progress_mode === 'auto' ? 'automático' : 'híbrido'}
            </span>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: '#5c6ac4' }}>{progress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={canEditProgress ? kpi.manual_progress : progress}
            disabled={savingManual || !canEditProgress}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!canEditProgress) return;
              setKpi({ ...kpi, manual_progress: v });
            }}
            onMouseUp={(e) => {
              if (!canEditProgress) return;
              saveManualProgress(Number((e.target as HTMLInputElement).value));
            }}
            onTouchEnd={(e) => {
              if (!canEditProgress) return;
              saveManualProgress(Number((e.target as HTMLInputElement).value));
            }}
            onKeyUp={(e) => {
              if (!canEditProgress) return;
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                saveManualProgress(Number((e.target as HTMLInputElement).value));
              }
            }}
            style={{
              width: '100%',
              accentColor: '#5c6ac4',
              cursor: canEditProgress ? 'grab' : 'not-allowed',
            }}
          />
          {progressErrorMessage && (
            <p
              role="note"
              style={{
                marginTop: '0.8rem',
                fontSize: '1.2rem',
                color: '#bf0711',
                lineHeight: 1.45,
              }}
            >
              {progressErrorMessage}
            </p>
          )}
        </AsanaSection>

        {/* Description */}
        {kpi.description && (
          <AsanaSection title="Descripción">
            <p style={{ color: '#212b36', fontSize: '1.4rem', lineHeight: 1.6, margin: 0 }}>{kpi.description}</p>
          </AsanaSection>
        )}

        {/* Linked objectives (Asana's "Subtasks") */}
        <AsanaSection
          title="Objetivos vinculados"
          count={linkedObjectives.length}
          action={
            canEdit ? (
              <button
                type="button"
                onClick={() => setShowObjectiveForm(true)}
                style={{
                  padding: '0.4rem 1.2rem',
                  fontSize: '1.3rem',
                  fontWeight: 500,
                  color: '#5c6ac4',
                  backgroundColor: '#f4f5fc',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                + Agregar objetivo
              </button>
            ) : null
          }
        >
          {linkedObjectives.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem', margin: 0 }}>No hay objetivos vinculados a este KPI</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {linkedObjectives.map((obj, i) => (
                <li
                  key={obj.id}
                  style={{
                    padding: '1rem 0',
                    borderBottom: i < linkedObjectives.length - 1 ? '1px solid #f4f6f8' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', gap: '0.8rem' }}>
                    <span style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36' }}>{obj.title}</span>
                    <StatusBadge status={obj.status} type="objective" />
                  </div>
                  <ProgressBar value={obj.manual_progress} size="small" />
                  {obj.tasks && obj.tasks.length > 0 && (
                    <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.4rem' }}>
                      {obj.tasks.filter((t) => t.status === 'completed').length}/{obj.tasks.length} tareas completadas
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </AsanaSection>

        {/* Comments timeline */}
        <CommentTimeline kpiId={kpiId} />
      </AsanaDetailShell>

      {showObjectiveForm && (
        <ObjectiveForm
          workspaceId={kpi.workspace_id}
          periodId={kpi.period_id}
          onClose={() => setShowObjectiveForm(false)}
          onSaved={() => {
            setShowObjectiveForm(false);
            refresh();
          }}
          initialData={{ kpi_ids: [kpi.id] }}
        />
      )}

      {showEditForm && (
        <KPIForm
          workspaceId={kpi.workspace_id}
          periodId={kpi.period_id}
          onClose={() => setShowEditForm(false)}
          onSaved={() => {
            setShowEditForm(false);
            refresh();
          }}
          initialData={{
            id: kpi.id,
            title: kpi.title,
            description: kpi.description ?? '',
            progress_mode: kpi.progress_mode,
            manual_progress: kpi.manual_progress,
            status: kpi.status,
            responsible_user_id: kpi.responsible_user_id,
            responsible_department_id: kpi.responsible_department_id,
          }}
        />
      )}
    </>
  );
}
