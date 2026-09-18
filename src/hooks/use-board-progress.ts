'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchWorkspaceMembers } from '@/hooks/use-boards';
import { formatActivityBody } from '@/components/tasks/task-activity-format';
import { taskStats, type TaskStats } from '@/components/boards/board-progress';
import type { Board, BoardMilestone, BoardStatus, BoardUpdate, Profile, Task, TaskActivity } from '@/types';

// ---------------------------------------------------------------------------
// Updates (timeline)
// ---------------------------------------------------------------------------

export function useBoardUpdates(boardId: string | undefined) {
  const [updates, setUpdates] = useState<BoardUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!boardId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('board_updates')
      .select('*, author:profiles(*)')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false });
    setUpdates((data || []) as BoardUpdate[]);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { updates, loading, refetch };
}

/**
 * Posts an update. When it carries a status the board's own status follows,
 * so "publicar avance: En riesgo" is the one-step way to re-colour the project.
 */
export async function createBoardUpdate(input: {
  boardId: string;
  workspaceId: string;
  authorId: string;
  content: string;
  status: BoardStatus | null;
}): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from('board_updates').insert({
    board_id: input.boardId,
    workspace_id: input.workspaceId,
    author_id: input.authorId,
    content: input.content,
    status: input.status,
  });
  if (error) return { error: error.message };
  if (input.status) {
    const { error: statusErr } = await supabase.from('boards').update({ status: input.status }).eq('id', input.boardId);
    if (statusErr) return { error: statusErr.message };
  }
  return { error: null };
}

export async function deleteBoardUpdate(id: string) {
  const supabase = createClient();
  return supabase.from('board_updates').delete().eq('id', id);
}

export async function setBoardStatus(boardId: string, status: BoardStatus) {
  const supabase = createClient();
  return supabase.from('boards').update({ status }).eq('id', boardId);
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export function useBoardMilestones(boardId: string | undefined) {
  const [milestones, setMilestones] = useState<BoardMilestone[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!boardId) return;
    const supabase = createClient();
    const { data } = await supabase.from('board_milestones').select('*').eq('board_id', boardId).order('due_date', { ascending: true });
    setMilestones((data || []) as BoardMilestone[]);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { milestones, loading, refetch };
}

export async function createMilestone(input: { boardId: string; workspaceId: string; title: string; dueDate: string; createdBy: string }) {
  const supabase = createClient();
  return supabase.from('board_milestones').insert({
    board_id: input.boardId,
    workspace_id: input.workspaceId,
    title: input.title,
    due_date: input.dueDate,
    created_by: input.createdBy,
  });
}

export async function setMilestoneDone(id: string, done: boolean) {
  const supabase = createClient();
  return supabase.from('board_milestones').update({ done }).eq('id', id);
}

export async function deleteMilestone(id: string) {
  const supabase = createClient();
  return supabase.from('board_milestones').delete().eq('id', id);
}

// ---------------------------------------------------------------------------
// Overview for the /tableros project cards (and the Avances tab's activity)
// ---------------------------------------------------------------------------

export interface BoardActivityEvent {
  id: string;
  created_at: string;
  actor: Profile | null;
  /** Sentence without the actor, e.g. `cambió el estado Pendiente → Completada`. */
  body: string;
  taskId: string;
  taskTitle: string;
  kind: 'activity' | 'comment';
}

export interface BoardOverview {
  latestUpdate: BoardUpdate | null;
  milestones: BoardMilestone[];
  tasks: TaskStats;
  activity: BoardActivityEvent[];
}

const EMPTY_STATS: TaskStats = { total: 0, completed: 0, overdue: 0, blocked: 0, pct: 0 };
const ACTIVITY_PER_BOARD = 5;

type PlacedTask = Pick<Task, 'id' | 'title' | 'status' | 'due_date'>;
type ActivityRow = TaskActivity & { actor?: Profile | null };
type CommentRow = { id: string; task_id: string | null; content: string; created_at: string; user?: Profile | null };

/**
 * One fetch for N monitored boards: latest update, milestones, task roll-up and
 * the last few task events (status changes, assignments, comments…) drawn from
 * `task_activity` + `comments` of the tasks placed on each board.
 */
export function useMonitoredOverview(boards: Board[], workspaceId: string | undefined) {
  const [overview, setOverview] = useState<Record<string, BoardOverview>>({});
  const [loading, setLoading] = useState(true);
  const boardIdsKey = boards.map((b) => b.id).sort().join(',');

  const refetch = useCallback(async () => {
    const ids = boardIdsKey ? boardIdsKey.split(',') : [];
    if (!workspaceId || ids.length === 0) {
      setOverview({});
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const [updatesRes, milestonesRes, placementsRes, members] = await Promise.all([
      supabase.from('board_updates').select('*, author:profiles(*)').in('board_id', ids).order('created_at', { ascending: false }),
      supabase.from('board_milestones').select('*').in('board_id', ids).order('due_date', { ascending: true }),
      supabase.from('board_tasks').select('board_id, task_id, task:tasks!board_tasks_task_id_fkey(id, title, status, due_date)').in('board_id', ids),
      fetchWorkspaceMembers(workspaceId),
    ]);

    const placements = ((placementsRes.data || []) as Array<{ board_id: string; task_id: string; task: PlacedTask | PlacedTask[] | null }>).map((p) => ({
      board_id: p.board_id,
      task_id: p.task_id,
      task: Array.isArray(p.task) ? p.task[0] ?? null : p.task,
    }));
    const taskIds = Array.from(new Set(placements.map((p) => p.task_id)));
    const [activityRes, commentsRes] = taskIds.length
      ? await Promise.all([
          supabase.from('task_activity').select('*, actor:profiles(*)').in('task_id', taskIds).order('created_at', { ascending: false }).limit(150),
          supabase.from('comments').select('id, task_id, content, created_at, user:profiles(*)').in('task_id', taskIds).order('created_at', { ascending: false }).limit(60),
        ])
      : [{ data: [] as ActivityRow[] }, { data: [] as CommentRow[] }];

    const nameById = new Map(members.map((m) => [m.id, m.full_name]));
    const lookupName = (id: string) => nameById.get(id) ?? null;
    const titleById = new Map<string, string>();
    for (const p of placements) if (p.task) titleById.set(p.task_id, p.task.title);

    const events: Array<BoardActivityEvent & { boardIds: string[] }> = [];
    const boardsOfTask = new Map<string, string[]>();
    for (const p of placements) boardsOfTask.set(p.task_id, [...(boardsOfTask.get(p.task_id) ?? []), p.board_id]);

    for (const a of (activityRes.data || []) as ActivityRow[]) {
      // Skip the "created" + "board_added" pair a fresh card produces; the created row alone tells the story.
      if (a.kind === 'board_added') continue;
      events.push({
        id: `a-${a.id}`,
        created_at: a.created_at,
        actor: a.actor ?? null,
        body: formatActivityBody(a, lookupName, (id) => titleById.get(id) ?? null),
        taskId: a.task_id,
        taskTitle: titleById.get(a.task_id) ?? '',
        kind: 'activity',
        boardIds: boardsOfTask.get(a.task_id) ?? [],
      });
    }
    for (const c of (commentsRes.data || []) as CommentRow[]) {
      if (!c.task_id) continue;
      events.push({
        id: `c-${c.id}`,
        created_at: c.created_at,
        actor: c.user ?? null,
        body: `comentó: “${c.content.length > 90 ? `${c.content.slice(0, 90)}…` : c.content}”`,
        taskId: c.task_id,
        taskTitle: titleById.get(c.task_id) ?? '',
        kind: 'comment',
        boardIds: boardsOfTask.get(c.task_id) ?? [],
      });
    }
    events.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const next: Record<string, BoardOverview> = {};
    for (const id of ids) {
      const tasks = placements.filter((p) => p.board_id === id && p.task).map((p) => p.task as PlacedTask);
      next[id] = {
        latestUpdate: ((updatesRes.data || []) as BoardUpdate[]).find((u) => u.board_id === id) ?? null,
        milestones: ((milestonesRes.data || []) as BoardMilestone[]).filter((m) => m.board_id === id),
        tasks: tasks.length ? taskStats(tasks) : EMPTY_STATS,
        activity: events.filter((e) => e.boardIds.includes(id)).slice(0, ACTIVITY_PER_BOARD),
      };
    }
    setOverview(next);
    setLoading(false);
  }, [boardIdsKey, workspaceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return useMemo(() => ({ overview, loading, refetch }), [overview, loading, refetch]);
}
