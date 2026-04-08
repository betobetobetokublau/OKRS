'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { TaskRow } from '@/components/tasks/task-row';
import type { Task, Objective } from '@/types';

interface GroupedTasks {
  objective: Objective;
  tasks: Task[];
}

export default function MisTareasPage() {
  const { currentWorkspace, activePeriod, profile } = useWorkspaceStore();
  const [groups, setGroups] = useState<GroupedTasks[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTasks() {
    if (!currentWorkspace?.id || !activePeriod?.id || !profile?.id) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('tasks')
      .select('*, assigned_user:profiles!tasks_assigned_user_id_fkey(*), objective:objectives!tasks_objective_id_fkey(*)')
      .eq('assigned_user_id', profile.id)
      .order('created_at', { ascending: true });

    const tasks = ((data || []) as (Task & { objective: Objective })[]).filter(
      t => t.objective?.workspace_id === currentWorkspace.id && t.objective?.period_id === activePeriod.id
    );

    // Group by objective
    const map = new Map<string, GroupedTasks>();
    for (const task of tasks) {
      const objId = task.objective_id;
      if (!map.has(objId)) {
        map.set(objId, { objective: task.objective, tasks: [] });
      }
      map.get(objId)!.tasks.push(task);
    }

    setGroups(Array.from(map.values()));
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, [currentWorkspace?.id, activePeriod?.id, profile?.id]);

  const totalTasks = groups.reduce((s, g) => s + g.tasks.length, 0);
  const completedTasks = groups.reduce((s, g) => s + g.tasks.filter(t => t.status === 'completed').length, 0);
  const blockedTasks = groups.reduce((s, g) => s + g.tasks.filter(t => t.status === 'blocked').length, 0);

  return (
    <div>
      <div style={{ marginBottom: '2.4rem' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Mis Tareas</h1>
        <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
          {totalTasks} tareas — {completedTasks} completadas — {blockedTasks} bloqueadas
        </p>
      </div>

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando tareas...</p>
      ) : groups.length === 0 ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>No tienes tareas asignadas en este periodo.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {groups.map((group) => (
            <div key={group.objective.id} className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div style={{ marginBottom: '1.2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#212b36' }}>{group.objective.title}</h2>
                <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.2rem' }}>
                  Progreso del objetivo: {group.objective.manual_progress}%
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} onUpdated={loadTasks} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
