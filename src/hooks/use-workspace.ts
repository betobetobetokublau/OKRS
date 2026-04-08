'use client';

import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { createClient } from '@/lib/supabase/client';
import type { Workspace, UserWorkspace, Period, Profile } from '@/types';

export function useWorkspace(workspaceSlug: string) {
  const {
    currentWorkspace,
    userWorkspace,
    activePeriod,
    profile,
    setCurrentWorkspace,
    setUserWorkspace,
    setActivePeriod,
    setProfile,
  } = useWorkspaceStore();

  useEffect(() => {
    const supabase = createClient();

    async function loadWorkspaceData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (profileData) setProfile(profileData as Profile);

      // Load workspace
      const { data: workspaceData } = await supabase
        .from('workspaces')
        .select('*')
        .eq('slug', workspaceSlug)
        .single();
      if (workspaceData) setCurrentWorkspace(workspaceData as Workspace);

      if (!workspaceData) return;

      // Load user workspace role
      const { data: uwData } = await supabase
        .from('user_workspaces')
        .select('*')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceData.id)
        .single();
      if (uwData) setUserWorkspace(uwData as UserWorkspace);

      // Load active period
      const { data: periodData } = await supabase
        .from('periods')
        .select('*')
        .eq('workspace_id', workspaceData.id)
        .eq('status', 'active')
        .single();
      if (periodData) setActivePeriod(periodData as Period);
    }

    loadWorkspaceData();
  }, [workspaceSlug]);

  return { currentWorkspace, userWorkspace, activePeriod, profile };
}
