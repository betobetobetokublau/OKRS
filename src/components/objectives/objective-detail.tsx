'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import { DepartmentTag } from '@/components/common/department-tag';
import { UserAvatar } from '@/components/common/user-avatar';
import { CommentTimeline } from '@/components/timeline/comment-timeline';
import { TaskRow } from '@/components/tasks/task-row';
import { TaskForm } from '@/components/tasks/task-form';
import { canManageContent } from '@/lib/utils/permissions';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Objective, Task, KPI, Department } from '@/types';

interface ObjectiveDetailProps {
  objectiveId: string;
}

export function ObjectiveDetail({ objectiveId }: ObjectiveDetailProps) {
  const { userWorkspace } = useWorkspaceStore();
  const [objective, setObjective] = useState<Objective | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [linkedKpis, setLinkedKpis] = useState<KPI[]>([]);
  const [linkedDepartments, setLinkedDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);

  const canEdit = userWorkspace && canManageContent(userWorkspace.role);

  async function loadData() {
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
  }

  useEffect(() => {
    loadData();
  }, [objectiveId]);

  if (loading || !objective) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando objetivo...</div>;
  }

  const progress = objective.computed_progress ?? objective.manual_progress;

  return (
    <div>
      <div style={{ marginBottom: '2.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '0.4rem' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>{objective.title}</h1>
          <StatusBadge status={objective.status} type="objective" />
        </div>
        {objective.description && (
          <p style={{ color: '#637381', fontSize: '1.4rem', lineHeight: '1.6' }}>{objective.description}</p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Progress card */}
          <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>Progreso</h2>
              <span style={{ fontSize: '2.4rem', fontWeight: 700, color: '#5c6ac4' }}>{progress}%</span>
            </div>
            <ProgressBar value={progress} size="large" showLabel={false} />
            <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.8rem' }}>
              Modo: {objective.progress_mode === 'manual' ? 'Manual' : objective.progress_mode === 'auto' ? 'Automático' : 'Híbrido'}
              {tasks.length > 0 && ` — ${tasks.filter(t => t.status === 'completed').length}/${tasks.length} tareas completadas`}
            </p>
          </div>

          {/* Tasks */}
          <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.6rem' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>Tareas ({tasks.length})</h2>
              {canEdit && (
                <button onClick={() => setShowTaskForm(true)} style={{ padding: '0.4rem 1.2rem', fontSize: '1.3rem', fontWeight: 500, color: '#5c6ac4', backgroundColor: '#f4f5fc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  + Agregar tarea
                </button>
              )}
            </div>
            {tasks.length === 0 ? (
              <p style={{ color: '#637381', fontSize: '1.3rem' }}>No hay tareas para este objetivo</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} onUpdated={loadData} />
                ))}
              </div>
            )}
          </div>

          {/* KPIs linked */}
          {linkedKpis.length > 0 && (
            <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>KPIs vinculados</h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {linkedKpis.map(kpi => (
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

          {/* Timeline */}
          <CommentTimeline objectiveId={objectiveId} />
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>Detalles</h3>

            {objective.responsible_user && (
              <div style={{ marginBottom: '1.2rem' }}>
                <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Responsable</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <UserAvatar user={objective.responsible_user} size="small" />
                  <span style={{ fontSize: '1.3rem', color: '#212b36' }}>{objective.responsible_user.full_name}</span>
                </div>
              </div>
            )}

            {objective.responsible_department && (
              <div style={{ marginBottom: '1.2rem' }}>
                <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Depto. responsable</p>
                <DepartmentTag department={objective.responsible_department} />
              </div>
            )}

            <div>
              <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Departamentos</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {linkedDepartments.length > 0
                  ? linkedDepartments.map(d => <DepartmentTag key={d.id} department={d} />)
                  : <span style={{ fontSize: '1.2rem', color: '#919eab' }}>Ninguno</span>
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTaskForm && (
        <TaskForm
          objectiveId={objectiveId}
          workspaceId={objective.workspace_id}
          onClose={() => setShowTaskForm(false)}
          onSaved={() => { setShowTaskForm(false); loadData(); }}
        />
      )}
    </div>
  );
}
