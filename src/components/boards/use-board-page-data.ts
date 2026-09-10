'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchBoardMembers, fetchWorkspaceMembers } from '@/hooks/use-boards';
import type { ComposerObjective } from './task-composer';
import type { Department, Profile } from '@/types';

/**
 * Reference data for the board page, loaded once per workspace / board:
 * workspace members (assignee dropdowns, grouping), departments (detail
 * panel), objectives of the active period (composer) and board members
 * (header avatars).
 */
export function useBoardPageData(workspaceId: string | undefined, periodId: string | undefined, boardId: string | undefined) {
  const [members, setMembers] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [objectives, setObjectives] = useState<ComposerObjective[]>([]);
  const [boardMembers, setBoardMembers] = useState<Profile[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [profiles, deptRes] = await Promise.all([
        fetchWorkspaceMembers(workspaceId),
        supabase.from('departments').select('*').eq('workspace_id', workspaceId).order('name', { ascending: true }),
      ]);
      if (cancelled) return;
      setMembers(profiles);
      setDepartments((deptRes.data || []) as Department[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !periodId) {
      setObjectives([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('objectives').select('id, title').eq('workspace_id', workspaceId).eq('period_id', periodId).order('title', { ascending: true });
      if (!cancelled) setObjectives((data || []) as ComposerObjective[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, periodId]);

  const refetchBoardMembers = useCallback(async () => {
    if (!boardId) return;
    setBoardMembers(await fetchBoardMembers(boardId));
  }, [boardId]);

  useEffect(() => {
    refetchBoardMembers();
  }, [refetchBoardMembers]);

  return { members, departments, objectives, boardMembers, refetchBoardMembers };
}
