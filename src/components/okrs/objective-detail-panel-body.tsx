'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DepartmentTag } from '@/components/common/department-tag';
import { CommentTimeline } from '@/components/timeline/comment-timeline';
import { TaskRow } from '@/components/tasks/task-row';
import { TaskForm } from '@/components/tasks/task-form';
import { ObjectiveForm } from '@/components/objectives/objective-form';
import { InlineTeamSelect } from './inline-team-select';
import { InlineStatusSelect } from './inline-status-select';
import { InlineUserSelect } from './inline-user-select';
import {
  AsanaDetailShell,
  AsanaSection,
  AsanaEmpty,
  AsanaDateRangeValue,
  type FieldRow,
  type BreadcrumbItem,
} from './asana-detail-shell';
import { calculateObjectiveProgress } from '@/lib/utils/progress';
import type { Objective, Task, KPI, Department } from '@/types';

interface ObjectiveDetailPanelBodyProps {
  objectiveId: string;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
}

/**
 * Objective detail in Asana-style layout. Used verbatim by the slide-in panel
 * AND by `/objetivos/[id]` (wrapped in page chrome).
 */
export function ObjectiveDetailPanelBody({
  objectiveId,
  departments,
  canEdit,
  onChanged,
}: ObjectiveDetailPanelBodyProps) {
  const [objective, setObjective] = useState<Objective | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [linkedKpis, setLinkedKpis] = useState<KPI[]>([]);
  const [linkedDepartments, setLinkedDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [objRes, tasksRes, kpiRes, deptRes] = await Promise.all([
      supabase.from('objectives').select('*, responsible_user:profiles!objectives_responsible_user_id_fkey(*), responsible_department:departments!objectives_responsible_department_id_fkey(*)').eq('id', objectiveId).single(),
      supabase.from('tasks').select('*, assigned_user:profiles!tasks_assigned_user_id_fkey(*)').eq('objective_id', objectiveId).order('created_at', { ascending: true }),
      supabase.from('kpi_objectives').select('kpi:kpis(*)').eq('objective_id', objectiveId),
      supabase.from('objective_departments').select('department:departments(*)').eq('objective_id', objectiveId),
    ]);
    if (objRes.data) setObjective(objRes.data as Objective);
    setTasks((tasksRes.data || []) as Task[]);
    setLinkedKpis(
      (kpiRes.data || [])
        .map((r: any) => (Array.isArray(r.kpi) ? r.kpi[0] : r.kpi))
        .filter(Boolean) as KPI[],
    );
    setLinkedDepartments(
      (deptRes.data || [])
        .map((r: any) => (Array.isArray(r.department) ? r.department[0] : r.department))
        .filter(Boolean) as Department[],
    );
    setLoading(false);
  }, [objectiveId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !objective) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando objetivo...</div>;
  }

  const progress = calculateObjectiveProgress(objective, tasks);

  function refresh() {
    load();
    onChanged();
  }

  async function saveManualProgress(value: number) {
    setSavingManual(true);
    const supabase = createClient();
    await supabase.from('objectives').update({ manual_progress: value }).eq('id', objective!.id);
    setSavingManual(false);
    refresh();
  }

  // Editable when mode is manual or hybrid AND the user has edit
  // permissions. Auto mode is always read-only.
  const canEditProgress =
    canEdit &&
    (objective.progress_mode === 'manual' || objective.progress_mode === 'hybrid');
  const progressErrorMessage = !canEdit
    ? 'No tienes permisos para cambiar este progreso.'
    : objective.progress_mode === 'auto'
      ? 'El progreso se calcula automáticamente a partir de las tareas vinculadas.'
      : null;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  // Breadcrumb: the parent KPI(s). If multiple, show the first as primary with
  // a small "+N más" hint; if none, show "Sin KPI" so the user knows it's an orphan.
  const breadcrumb: BreadcrumbItem[] =
    linkedKpis.length > 0
      ? [
          {
            label:
              linkedKpis.length === 1
                ? `KPI: ${linkedKpis[0].title}`
                : `KPI: ${linkedKpis[0].title} (+${linkedKpis.length - 1} más)`,
          },
        ]
      : [{ label: 'Sin KPI padre' }];

  const fields: FieldRow[] = [
    {
      label: 'Responsable',
      // Inline-editable for every role — the assignee is the highest-
      // friction field the panel exposes and gating it behind the
      // "Editar" modal slowed the operational flow. The `canEdit`
      // flag is intentionally hardcoded to `true` here; structural
      // edits to the rest of the objective stay in the form modal.
      value: (
        <InlineUserSelect
          entity="objective"
          id={objective.id}
          workspaceId={objective.workspace_id}
          currentUserId={objective.responsible_user_id}
          currentUser={objective.responsible_user}
          canEdit
          onChanged={refresh}
        />
      ),
    },
    {
      label: 'Fechas',
      value: <AsanaDateRangeValue startIso={objective.start_date} endIso={objective.end_date} />,
    },
    {
      label: 'KPI(s) vinculado(s)',
      value:
        linkedKpis.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {linkedKpis.map((k) => (
              <span
                key={k.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.2rem 0.8rem',
                  fontSize: '1.2rem',
                  color: '#5c6ac4',
                  backgroundColor: '#f4f5fc',
                  border: '1px solid #e3e5f1',
                  borderRadius: '999px',
                }}
              >
                {k.title}
              </span>
            ))}
          </div>
        ) : (
          <AsanaEmpty>Ninguno</AsanaEmpty>
        ),
    },
    {
      label: 'Depto. responsable',
      // Always inline-editable, like the Responsable above —
      // assignment shouldn't require entering edit mode regardless of
      // role.
      value: (
        <InlineTeamSelect
          entity="objective"
          id={objective.id}
          currentDepartmentId={objective.responsible_department_id}
          currentDepartment={objective.responsible_department}
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
          entity="objective"
          id={objective.id}
          currentStatus={objective.status}
          canEdit={canEdit}
          onChanged={refresh}
        />
      ),
    },
    {
      label: 'Modo de progreso',
      value: (
        <span>
          {objective.progress_mode === 'manual' ? 'Manual' : objective.progress_mode === 'auto' ? 'Automático' : 'Híbrido'}
        </span>
      ),
    },
  ];

  return (
    <>
      <AsanaDetailShell
        breadcrumb={breadcrumb}
        title={objective.title}
        onEdit={canEdit ? () => setShowEditForm(true) : undefined}
        fields={fields}
      >
        {/* Progress — single unified slider. When editable it writes
            through to manual_progress on mouse-up / touch-end. When
            not editable, a red message explains why (auto mode, or
            missing permissions). */}
        <AsanaSection title="Progreso">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
            <span style={{ fontSize: '1.2rem', color: '#637381' }}>
              {tasks.length > 0
                ? `${completedCount}/${tasks.length} tareas completadas`
                : 'Sin tareas'}
            </span>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: '#5c6ac4' }}>{progress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={canEditProgress ? objective.manual_progress : progress}
            disabled={savingManual || !canEditProgress}
            onChange={(e) => {
              if (!canEditProgress) return;
              const v = Number(e.target.value);
              setObjective({ ...objective, manual_progress: v });
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
        {objective.description && (
          <AsanaSection title="Descripción">
            <p style={{ color: '#212b36', fontSize: '1.4rem', lineHeight: 1.6, margin: 0 }}>{objective.description}</p>
          </AsanaSection>
        )}

        {/* Subtasks = Tasks */}
        <AsanaSection
          title="Tareas"
          count={tasks.length > 0 ? `${completedCount}/${tasks.length}` : 0}
          action={
            canEdit ? (
              <button
                type="button"
                onClick={() => setShowTaskForm(true)}
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
                + Agregar tarea
              </button>
            ) : null
          }
        >
          {tasks.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem', margin: 0 }}>No hay tareas para este objetivo</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} onUpdated={refresh} />
              ))}
            </div>
          )}
        </AsanaSection>

        {/* Comment timeline */}
        <CommentTimeline objectiveId={objectiveId} />
      </AsanaDetailShell>

      {showTaskForm && (
        <TaskForm
          objectiveId={objectiveId}
          workspaceId={objective.workspace_id}
          onClose={() => setShowTaskForm(false)}
          onSaved={() => {
            setShowTaskForm(false);
            refresh();
          }}
        />
      )}

      {showEditForm && (
        <ObjectiveForm
          workspaceId={objective.workspace_id}
          periodId={objective.period_id}
          onClose={() => setShowEditForm(false)}
          onSaved={() => {
            setShowEditForm(false);
            refresh();
          }}
          initialData={{
            id: objective.id,
            title: objective.title,
            description: objective.description ?? '',
            status: objective.status,
            progress_mode: objective.progress_mode,
            manual_progress: objective.manual_progress,
            responsible_user_id: objective.responsible_user_id,
            responsible_department_id: objective.responsible_department_id,
            start_date: objective.start_date,
            end_date: objective.end_date,
          }}
        />
      )}
    </>
  );
}
