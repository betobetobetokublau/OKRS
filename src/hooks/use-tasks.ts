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

    if (objectiveId) {
      query = query.eq('objective_id', objectiveId);
    }

    if (assignedUserId && workspaceId && periodId) {
      query = query
        .eq('assigned_user_id', assignedUserId)
        .eq('objective.workspace_id', workspaceId)
        .eq('objective.period_id', periodId);
    }

    const { data } = await query.order('created_at', { ascending: false });
    if (data) setTasks(data as Task[]);
    setLoading(false);
  }, [objectiveId, assignedUserId, workspaceId, periodId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, refetch: fetchTasks };
}
