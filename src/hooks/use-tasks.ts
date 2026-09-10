'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Task } from '@/types';

export function useTasks(objectiveId?: string, assignedUserId?: string, workspaceId?: string, periodId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase.from('tasks').select(`
      *,
      assigned_user:profiles!tasks_assigned_user_id_fkey(*),
      objective:objectives!tasks_objective_id_fkey(*)
    `);

    // Subtasks are rendered inside their parent's detail panel, never as
    // top-level rows.
    query = query.is('parent_task_id', null);

    if (objectiveId) {
      query = query.eq('objective_id', objectiveId);
    }

    if (assignedUserId && workspaceId) {
      query = query.eq('assigned_user_id', assignedUserId).eq('workspace_id', workspaceId);
    }

    const { data } = await query.order('created_at', { ascending: false });
    // Period filter only applies to tasks that hang off an objective; tasks
    // without one (boards / backlog) are always kept.
    const rows = ((data || []) as Task[]).filter(
      (t) => !periodId || !t.objective || t.objective.period_id === periodId,
    );
    setTasks(rows);
    setLoading(false);
  }, [objectiveId, assignedUserId, workspaceId, periodId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, refetch: fetchTasks };
}
