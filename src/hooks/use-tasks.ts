'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Task } from '@/types';

/**
 * PostgREST embed of the parent task. Self-referencing FKs must be embedded
 * through the FK *column* — the `tasks!tasks_parent_task_id_fkey` hint is
 * rejected as ambiguous for self-joins and `tasks!parent_task_id` resolves to
 * the children (one-to-many) instead.
 */
export const PARENT_EMBED = 'parent:parent_task_id(id, title)';

export type TaskAncestor = Pick<Task, 'id' | 'title'>;

/**
 * Ancestor chain of a task, root first, walking `parent_task_id` one query
 * per level. Capped at `maxDepth` levels (the DB forbids cycles, the cap
 * only bounds the round-trips).
 */
export async function fetchTaskAncestors(parentId: string | null, maxDepth = 5): Promise<TaskAncestor[]> {
  const supabase = createClient();
  const chain: TaskAncestor[] = [];
  const seen = new Set<string>();
  let cursor = parentId;
  while (cursor && chain.length < maxDepth && !seen.has(cursor)) {
    seen.add(cursor);
    const { data } = await supabase.from('tasks').select('id, title, parent_task_id').eq('id', cursor).maybeSingle();
    const row = data as Pick<Task, 'id' | 'title' | 'parent_task_id'> | null;
    if (!row) break;
    chain.unshift({ id: row.id, title: row.title });
    cursor = row.parent_task_id;
  }
  return chain;
}

/** Detach a subtask from its parent; its own subtasks stay attached to it. */
export async function decoupleTask(taskId: string) {
  const supabase = createClient();
  return supabase.from('tasks').update({ parent_task_id: null }).eq('id', taskId);
}

/** `{ total, done }` of direct subtasks for each id in `parentIds`, in one query. */
export async function fetchSubtaskCounts(parentIds: string[]): Promise<Map<string, { total: number; done: number }>> {
  const counts = new Map<string, { total: number; done: number }>();
  if (parentIds.length === 0) return counts;
  const supabase = createClient();
  const { data } = await supabase.from('tasks').select('parent_task_id, status').in('parent_task_id', parentIds);
  for (const row of (data || []) as Array<Pick<Task, 'parent_task_id' | 'status'>>) {
    if (!row.parent_task_id) continue;
    const c = counts.get(row.parent_task_id) ?? { total: 0, done: 0 };
    c.total += 1;
    if (row.status === 'completed') c.done += 1;
    counts.set(row.parent_task_id, c);
  }
  return counts;
}

export function useTasks(objectiveId?: string, assignedUserId?: string, workspaceId?: string, periodId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase.from('tasks').select(`
      *,
      assigned_user:profiles!tasks_assigned_user_id_fkey(*),
      objective:objectives!tasks_objective_id_fkey(*),
      ${PARENT_EMBED}
    `);

    // Objective task lists feed progress roll-ups, so they stay top-level
    // only. Personal lists (`assignedUserId`) include subtasks: they are
    // first-class tasks and their assignee must see them.
    if (!assignedUserId) {
      query = query.is('parent_task_id', null);
    }

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
