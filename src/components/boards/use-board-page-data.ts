'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchBoardMembers, fetchWorkspaceMembers } from '@/hooks/use-boards';
import { useObjectiveOptions } from '@/hooks/use-objective-options';
import type { Department, Profile } from '@/types';

/**
 * Reference data for the board page, loaded once per workspace / board:
 * workspace members (assignee dropdowns, grouping), departments (detail
 * panel), objectives of the active period grouped by department (composer)
 * and board members (header avatars).
 */
export function useBoardPageData(workspaceId: string | undefined, periodId: string | undefined, boardId: string | undefined) {
  const [members, setMembers] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
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

  // Grouped (per department) for the composer's <optgroup>s; the flat list is kept for callers that need it.
  // Without an active period the hook would return every period's objectives, so it is gated on `periodId`.
  const { groups: objectiveGroups, objectives } = useObjectiveOptions(periodId ? workspaceId : undefined, periodId);

  const refetchBoardMembers = useCallback(async () => {
    if (!boardId) return;
    setBoardMembers(await fetchBoardMembers(boardId));
  }, [boardId]);

  useEffect(() => {
    refetchBoardMembers();
  }, [refetchBoardMembers]);

  return { members, departments, objectives, objectiveGroups, boardMembers, refetchBoardMembers };
}
