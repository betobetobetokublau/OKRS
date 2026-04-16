'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ProgressBar } from '@/components/common/progress-bar';
import { DepartmentTag } from '@/components/common/department-tag';
import { UserAvatar } from '@/components/common/user-avatar';
import { CommentTimeline } from '@/components/timeline/comment-timeline';
import { TaskRow } from '@/components/tasks/task-row';
import { TaskForm } from '@/components/tasks/task-form';
import { ObjectiveForm } from '@/components/objectives/objective-form';
import { InlineTeamSelect } from './inline-team-select';
import { InlineStatusSelect } from './inline-status-select';
import { calculateObjectiveProgress } from '@/lib/utils/progress';
import type { Objective, Task, KPI, Department } from '@/types';

interface ObjectiveDetailPanelBodyProps {
  objectiveId: string;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
}

/**
 * 1-column adaptation of src/components/objectives/objective-detail.tsx.
 * Status and Team are editable inline via InlineStatusSelect / InlineTeamSelect.
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
    setLinkedKpis((kpiRes.data || []).map((r: any) => r.kpi).filter(Boolean) as KPI[]);
    setLinkedDepartments((deptRes.data || []).map((r: any) => r.department).filter(Boolean) as Department[]);
    setLoading(false);
  }, [objectiveId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !objective) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando objetivo...</div>;
  }

  // Always compute client-side so the meter reacts to mode changes and task
  // edits without relying on a persisted `computed_progress` column.
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

  const showManualControl = objective.progress_mode === 'manual' || objective.progress_mode === 'hybrid';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.8rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 600, color: '#212b36', lineHeight: 1.3, margin: 0 }}>{objective.title}</h1>
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
        <InlineStatusSelect
          entity="objective"
          id={objective.id}
          currentStatus={objective.status}
          canEdit={canEdit}
          onChanged={refresh}
        />
        {objective.description && (
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.8rem', lineHeight: 1.6 }}>{objective.description}</p>
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
          Modo: {objective.progress_mode === 'manual' ? 'Manual' : objective.progress_mode === 'auto' ? 'Automático' : 'Híbrido'}
          {tasks.length > 0 && ` — ${tasks.filter(t => t.status === 'completed').length}/${tasks.length} tareas completadas`}
        </p>

        {showManualControl && (
          <div style={{ marginTop: '1.6rem', paddingTop: '1.2rem', borderTop: '1px solid #f1f2f4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '1.2rem', color: '#637381' }}>
                Progreso manual {objective.progress_mode === 'hybrid' && '(se promedia con las tareas)'}
              </label>
              <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36' }}>
                {objective.manual_progress}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={objective.manual_progress}
              disabled={savingManual || !canEdit}
              onChange={(e) => {
                const v = Number(e.target.value);
                // Local echo while dragging
                setObjective({ ...objective, manual_progress: v });
              }}
              onMouseUp={(e) => saveManualProgress(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => saveManualProgress(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                  saveManualProgress(Number((e.target as HTMLInputElement).value));
                }
              }}
              style={{ width: '100%', accentColor: '#5c6ac4' }}
            />
          </div>
        )}
      </div>

      {/* Tasks */}
      <div className="Polaris-Card" style={{ padding: '1.6rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36' }}>Tareas ({tasks.length})</h2>
          {canEdit && (
            <button
              onClick={() => setShowTaskForm(true)}
              style={{ padding: '0.4rem 1.2rem', fontSize: '1.3rem', fontWeight: 500, color: '#5c6ac4', backgroundColor: '#f4f5fc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              + Agregar tarea
            </button>
          )}
        </div>
        {tasks.length === 0 ? (
          <p style={{ color: '#637381', fontSize: '1.3rem' }}>No hay tareas para este objetivo</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} onUpdated={refresh} />
            ))}
          </div>
        )}
      </div>

      {/* KPIs linked */}
      {linkedKpis.length > 0 && (
        <div className="Polaris-Card" style={{ padding: '1.6rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>KPIs vinculados</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {linkedKpis.map((kpi) => (
              <li key={kpi.id} style={{ padding: '0.8rem 0', borderBottom: '1px solid #f4f6f8' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36' }}>{kpi.title}</div>
                <div style={{ marginTop: '0.4rem' }}>
                  <ProgressBar value={kpi.manual_progress} size="small" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detalles */}
      <div className="Polaris-Card" style={{ padding: '1.6rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>Detalles</h3>

        <div style={{ marginBottom: '1.2rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Depto. responsable</p>
          <InlineTeamSelect
            entity="objective"
            id={objective.id}
            currentDepartmentId={objective.responsible_department_id}
            currentDepartment={objective.responsible_department}
            departments={departments}
            canEdit={canEdit}
            onChanged={refresh}
          />
        </div>

        {objective.responsible_user && (
          <div style={{ marginBottom: '1.2rem' }}>
            <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Responsable</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <UserAvatar user={objective.responsible_user} size="small" />
              <span style={{ fontSize: '1.3rem', color: '#212b36' }}>{objective.responsible_user.full_name}</span>
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
      <CommentTimeline objectiveId={objectiveId} />

      {showTaskForm && (
        <TaskForm
          objectiveId={objectiveId}
          workspaceId={objective.workspace_id}
          onClose={() => setShowTaskForm(false)}
          onSaved={() => { setShowTaskForm(false); refresh(); }}
        />
      )}

      {showEditForm && (
        <ObjectiveForm
          workspaceId={objective.workspace_id}
          periodId={objective.period_id}
          onClose={() => setShowEditForm(false)}
          onSaved={() => { setShowEditForm(false); refresh(); }}
          initialData={{
            id: objective.id,
            title: objective.title,
            description: objective.description ?? '',
            status: objective.status,
            progress_mode: objective.progress_mode,
            manual_progress: objective.manual_progress,
            responsible_user_id: objective.responsible_user_id,
            responsible_department_id: objective.responsible_department_id,
          }}
        />
      )}
    </div>
  );
}
