'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { canManageContent } from '@/lib/utils/permissions';
import { isOverdue } from '@/lib/utils/dates';
import { TaskRow } from '@/components/tasks/task-row';
import { TaskForm } from '@/components/tasks/task-form';
import { priorityRank } from '@/components/tasks/priority';
import { OkrDetailPanel, type PanelTarget } from '@/components/okrs/okr-detail-panel';
import type { Task, Objective } from '@/types';

interface GroupedTasks {
  /** `null` for the trailing "Sin objetivo" bucket (board / backlog tasks). */
  objective: Objective | null;
  tasks: Task[];
}

type QuickFilter = 'all' | 'pending' | 'in_progress' | 'blocked' | 'overdue';

const QUICK_FILTERS: Array<{ value: QuickFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'blocked', label: 'Bloqueadas' },
  { value: 'overdue', label: 'Vencidas' },
];

function matchesFilter(t: Task, f: QuickFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'overdue':
      return isOverdue(t.due_date) && t.status !== 'completed';
    default:
      return t.status === f;
  }
}

export default function MisTareasPage() {
  const { currentWorkspace, activePeriod, profile, userWorkspace } = useWorkspaceStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [sortByPriority, setSortByPriority] = useState(false);
  const [panelTarget, setPanelTarget] = useState<PanelTarget>(null);
  const [showNewTask, setShowNewTask] = useState(false);

  const role = userWorkspace?.role ?? 'member';
  const canEdit = canManageContent(role);

  const loadTasks = useCallback(async () => {
    if (!currentWorkspace?.id || !profile?.id) return;
    const supabase = createClient();

    // tasks.workspace_id exists since 2026-09-10 — no objective hop needed.
    // Subtasks are excluded; they show up inside their parent's detail panel.
    const { data } = await supabase
      .from('tasks')
      .select('*, assigned_user:profiles!tasks_assigned_user_id_fkey(*), objective:objectives!tasks_objective_id_fkey(*)')
      .eq('assigned_user_id', profile.id)
      .eq('workspace_id', currentWorkspace.id)
      .is('parent_task_id', null)
      .order('created_at', { ascending: true })
      .limit(300);

    // Period filter applies only to tasks that hang off an objective; tasks
    // without one (boards / backlog) are always shown.
    const rows = ((data || []) as Task[]).filter((t) => {
      if (!t.objective) return true;
      return !activePeriod?.id || t.objective.period_id === activePeriod.id;
    });
    setTasks(rows);
    setLoading(false);
  }, [currentWorkspace?.id, activePeriod?.id, profile?.id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const groups = useMemo<GroupedTasks[]>(() => {
    const visible = tasks.filter((t) => matchesFilter(t, filter));
    const sortTasks = (list: Task[]) =>
      sortByPriority ? [...list].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)) : list;

    const byObjective = new Map<string, GroupedTasks>();
    const orphan: Task[] = [];
    for (const task of visible) {
      if (task.objective_id && task.objective) {
        const g = byObjective.get(task.objective_id) ?? { objective: task.objective, tasks: [] };
        g.tasks.push(task);
        byObjective.set(task.objective_id, g);
      } else {
        orphan.push(task);
      }
    }
    const out = Array.from(byObjective.values())
      .sort((a, b) => (a.objective?.title ?? '').localeCompare(b.objective?.title ?? '', 'es'))
      .map((g) => ({ ...g, tasks: sortTasks(g.tasks) }));
    if (orphan.length > 0) out.push({ objective: null, tasks: sortTasks(orphan) });
    return out;
  }, [tasks, filter, sortByPriority]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const blockedTasks = tasks.filter((t) => t.status === 'blocked').length;

  if (!currentWorkspace) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.6rem', marginBottom: '1.6rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Mis Tareas</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            {totalTasks} tareas — {completedTasks} completadas — {blockedTasks} bloqueadas
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowNewTask(true)}
            style={{
              padding: '0.8rem 1.6rem',
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'white',
              backgroundColor: '#5c6ac4',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + Nueva tarea
          </button>
        )}
      </div>

      {/* Toolbar: quick filters + priority sort */}
      <div
        role="toolbar"
        aria-label="Filtros de tareas"
        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '2rem' }}
      >
        {QUICK_FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.value)}
              style={{
                padding: '0.4rem 1.2rem',
                fontSize: '1.3rem',
                fontWeight: active ? 600 : 500,
                color: active ? '#202e78' : '#637381',
                backgroundColor: active ? 'rgba(92, 106, 196, 0.12)' : 'white',
                border: `1px solid ${active ? '#5c6ac4' : '#dfe3e8'}`,
                borderRadius: '999px',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          );
        })}
        <span aria-hidden style={{ width: '1px', height: '2rem', backgroundColor: '#dfe3e8', margin: '0 0.4rem' }} />
        <button
          type="button"
          aria-pressed={sortByPriority}
          onClick={() => setSortByPriority((v) => !v)}
          title="Ordenar por prioridad (alta primero)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 1.2rem',
            fontSize: '1.3rem',
            fontWeight: sortByPriority ? 600 : 500,
            color: sortByPriority ? '#202e78' : '#637381',
            backgroundColor: sortByPriority ? 'rgba(92, 106, 196, 0.12)' : 'white',
            border: `1px solid ${sortByPriority ? '#5c6ac4' : '#dfe3e8'}`,
            borderRadius: '999px',
            cursor: 'pointer',
          }}
        >
          <span aria-hidden>▲</span> Prioridad
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando tareas...</p>
      ) : groups.length === 0 ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>
            {totalTasks === 0 ? 'No tienes tareas asignadas en este periodo.' : 'Ninguna tarea coincide con el filtro.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {groups.map((group) => (
            <div
              key={group.objective?.id ?? 'sin-objetivo'}
              className="Polaris-Card"
              style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
            >
              <div style={{ marginBottom: '1.2rem' }}>
                {group.objective ? (
                  <>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#212b36' }}>{group.objective.title}</h2>
                    <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.2rem' }}>
                      Progreso del objetivo: {group.objective.manual_progress}%
                    </p>
                  </>
                ) : (
                  <>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#637381' }}>Sin objetivo</h2>
                    <p style={{ fontSize: '1.2rem', color: '#919eab', marginTop: '0.2rem' }}>
                      Tareas de tableros o backlog sin OKR
                    </p>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onUpdated={loadTasks}
                    onOpen={() => setPanelTarget({ type: 'task', id: task.id })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <OkrDetailPanel
        target={panelTarget}
        departments={[]}
        canEdit={canEdit}
        onClose={() => setPanelTarget(null)}
        onChanged={loadTasks}
      />

      {showNewTask && (
        <TaskForm
          allowObjectivePicker
          workspaceId={currentWorkspace.id}
          periodId={activePeriod?.id}
          initialData={{ assigned_user_id: profile?.id ?? null }}
          onClose={() => setShowNewTask(false)}
          onSaved={() => {
            setShowNewTask(false);
            loadTasks();
          }}
        />
      )}
    </div>
  );
}
