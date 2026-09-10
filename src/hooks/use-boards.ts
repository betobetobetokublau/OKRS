'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Board, BoardSection, BoardTask, Task } from '@/types';

/**
 * Data layer for Tableros. Boards are a lens over tasks: a task lives in N
 * boards, in exactly one section per board (PK board_tasks(board_id, task_id)).
 * RLS (`board_is_visible`) already hides private boards the caller can't see,
 * so these hooks never filter on visibility client-side.
 */

const TASK_SELECT =
  '*, assigned_user:profiles!tasks_assigned_user_id_fkey(*), objective:objectives!tasks_objective_id_fkey(id, title, workspace_id, period_id)';

// ---------------------------------------------------------------------------
// List of boards for the sidebar / index page
// ---------------------------------------------------------------------------
export function useBoards(workspaceId: string | undefined) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!workspaceId) {
      setBoards([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from('boards')
      .select('*, board_tasks(count)')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .order('is_favorite', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    const rows = (data || []) as Array<Board & { board_tasks?: Array<{ count: number }> }>;
    setBoards(
      rows.map((b) => ({
        ...b,
        task_count: b.board_tasks?.[0]?.count ?? 0,
      })),
    );
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { boards, loading, refetch };
}

// ---------------------------------------------------------------------------
// One board: sections + placed tasks
// ---------------------------------------------------------------------------
export interface BoardData {
  board: Board;
  sections: BoardSection[];
  /** Placement rows with the task embedded; ordered by section position then card position. */
  items: BoardTask[];
}

export function useBoard(boardId: string | undefined) {
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!boardId) return;
    const supabase = createClient();
    const [boardRes, sectionsRes, itemsRes] = await Promise.all([
      supabase.from('boards').select('*').eq('id', boardId).single(),
      supabase.from('board_sections').select('*').eq('board_id', boardId).order('position', { ascending: true }),
      supabase
        .from('board_tasks')
        .select(`*, task:tasks!board_tasks_task_id_fkey(${TASK_SELECT})`)
        .eq('board_id', boardId)
        .order('position', { ascending: true }),
    ]);
    if (boardRes.error || !boardRes.data) {
      setError(boardRes.error?.message ?? 'Tablero no encontrado');
      setData(null);
      setLoading(false);
      return;
    }
    const items = ((itemsRes.data || []) as BoardTask[]).filter((it) => it.task);
    // Subtask counters: one query for all placed tasks.
    const taskIds = items.map((it) => it.task_id);
    if (taskIds.length > 0) {
      const { data: subs } = await supabase
        .from('tasks')
        .select('id, parent_task_id, status')
        .in('parent_task_id', taskIds);
      const byParent = new Map<string, Task[]>();
      for (const s of (subs || []) as Task[]) {
        if (!s.parent_task_id) continue;
        const arr = byParent.get(s.parent_task_id) ?? [];
        arr.push(s);
        byParent.set(s.parent_task_id, arr);
      }
      for (const it of items) {
        if (it.task) it.task.subtasks = byParent.get(it.task_id) ?? [];
      }
    }
    setData({
      board: boardRes.data as Board,
      sections: (sectionsRes.data || []) as BoardSection[],
      items,
    });
    setError(null);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ---------------------------------------------------------------------------
// Mutations (thin wrappers; callers refetch)
// ---------------------------------------------------------------------------
export async function createBoard(input: {
  workspace_id: string;
  name: string;
  color?: string;
  visibility?: 'workspace' | 'private';
  description?: string | null;
  owner_id?: string | null;
}): Promise<Board | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('boards')
    .insert({
      workspace_id: input.workspace_id,
      name: input.name,
      color: input.color ?? '#5c6ac4',
      visibility: input.visibility ?? 'workspace',
      description: input.description ?? null,
      owner_id: input.owner_id ?? null,
    })
    .select('*')
    .single();
  if (error || !data) return null;
  const board = data as Board;
  // Default columns so a fresh board is usable immediately.
  await supabase.from('board_sections').insert([
    { board_id: board.id, name: 'Por hacer', position: 0 },
    { board_id: board.id, name: 'En curso', position: 1 },
    { board_id: board.id, name: 'Hecho', position: 2 },
  ]);
  return board;
}

export async function updateBoard(id: string, patch: Partial<Pick<Board, 'name' | 'description' | 'color' | 'visibility' | 'is_favorite' | 'archived_at'>>) {
  const supabase = createClient();
  return supabase.from('boards').update(patch).eq('id', id);
}

export async function createSection(boardId: string, name: string, position: number) {
  const supabase = createClient();
  return supabase.from('board_sections').insert({ board_id: boardId, name, position }).select('*').single();
}

export async function renameSection(sectionId: string, name: string) {
  const supabase = createClient();
  return supabase.from('board_sections').update({ name }).eq('id', sectionId);
}

export async function deleteSection(sectionId: string) {
  // Placements fall back to section_id = null ("Sin sección") via ON DELETE SET NULL.
  const supabase = createClient();
  return supabase.from('board_sections').delete().eq('id', sectionId);
}

export async function reorderSections(sections: Array<{ id: string; position: number }>) {
  const supabase = createClient();
  await Promise.all(sections.map((s) => supabase.from('board_sections').update({ position: s.position }).eq('id', s.id)));
}

/** Add an existing task to a board (idempotent thanks to the composite PK). */
export async function addTaskToBoard(boardId: string, taskId: string, sectionId: string | null) {
  const supabase = createClient();
  return supabase
    .from('board_tasks')
    .upsert({ board_id: boardId, task_id: taskId, section_id: sectionId }, { onConflict: 'board_id,task_id' });
}

export async function removeTaskFromBoard(boardId: string, taskId: string) {
  const supabase = createClient();
  return supabase.from('board_tasks').delete().eq('board_id', boardId).eq('task_id', taskId);
}

/** Move a card to a section (and position). Never touches tasks.status. */
export async function moveTask(boardId: string, taskId: string, sectionId: string | null, position: number) {
  const supabase = createClient();
  return supabase
    .from('board_tasks')
    .update({ section_id: sectionId, position })
    .eq('board_id', boardId)
    .eq('task_id', taskId);
}

/** Persist card order inside one section after a drag. */
export async function reorderCards(boardId: string, ordered: Array<{ task_id: string; position: number }>) {
  const supabase = createClient();
  await Promise.all(
    ordered.map((o) =>
      supabase.from('board_tasks').update({ position: o.position }).eq('board_id', boardId).eq('task_id', o.task_id),
    ),
  );
}

/** Boards (with the section the task sits in) for the task detail "Tableros" block. */
export async function fetchTaskBoards(taskId: string): Promise<BoardTask[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('board_tasks')
    .select('*, board:boards!board_tasks_board_id_fkey(*), section:board_sections!board_tasks_section_id_fkey(*)')
    .eq('task_id', taskId);
  return (data || []) as BoardTask[];
}
