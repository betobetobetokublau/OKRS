'use client';

import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { createClient } from '@/lib/supabase/client';
import { readImpersonationTarget, writeImpersonationTarget } from '@/lib/impersonation';
import type { Workspace, UserWorkspace, Period, Profile } from '@/types';

/**
 * Loads the real authenticated user's identity + workspace context, then
 * — if an admin has an active impersonation flag in sessionStorage —
 * swaps the store's profile/userWorkspace with the target user's data.
 *
 * The admin gate is critical: we only apply the impersonation swap if
 * the real user's role in this workspace is 'admin'. A non-admin who
 * manually wrote to sessionStorage gets the flag silently cleared and
 * their own view loaded. Nothing is mutated in the DB during all of
 * this; impersonation is purely a client-side UX overlay on top of the
 * admin's authenticated Supabase session.
 */
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
    enterImpersonation,
  } = useWorkspaceStore();

  useEffect(() => {
    const supabase = createClient();

    async function loadWorkspaceData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // ── Load the real authenticated user's profile + workspace ────
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const { data: workspaceData } = await supabase
        .from('workspaces')
        .select('*')
        .eq('slug', workspaceSlug)
        .single();

      if (workspaceData) setCurrentWorkspace(workspaceData as Workspace);
      if (!workspaceData) return;

      const { data: uwData } = await supabase
        .from('user_workspaces')
        .select('*')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceData.id)
        .single();

      // ── Check for an active impersonation target ──────────────────
      const impersonateTarget = readImpersonationTarget();
      const realRole = (uwData as UserWorkspace | null)?.role;
      const canImpersonate = realRole === 'admin' && !!impersonateTarget && impersonateTarget !== user.id;

      if (canImpersonate && profileData && uwData) {
        // Fetch the target user's profile + user_workspace for THIS
        // workspace. If either is missing (member was removed, wrong
        // workspace), silently clear the flag and fall back to the real
        // admin identity — no point getting stuck in a broken state.
        const [targetProfileRes, targetUwRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', impersonateTarget).single(),
          supabase
            .from('user_workspaces')
            .select('*')
            .eq('user_id', impersonateTarget)
            .eq('workspace_id', workspaceData.id)
            .single(),
        ]);

        if (targetProfileRes.data && targetUwRes.data) {
          enterImpersonation(
            {
              profile: profileData as Profile,
              userWorkspace: uwData as UserWorkspace,
            },
            {
              profile: targetProfileRes.data as Profile,
              userWorkspace: targetUwRes.data as UserWorkspace,
            },
          );
        } else {
          // Target is no longer valid in this workspace; clean up and
          // fall through to the normal identity-load path.
          writeImpersonationTarget(null);
          if (profileData) setProfile(profileData as Profile);
          if (uwData) setUserWorkspace(uwData as UserWorkspace);
        }
      } else {
        // No impersonation (or the flag wasn't authorized) — load real
        // identity and make sure any stale session flag is cleared so
        // we don't thrash on the next navigation.
        if (impersonateTarget && !canImpersonate) writeImpersonationTarget(null);
        if (profileData) setProfile(profileData as Profile);
        if (uwData) setUserWorkspace(uwData as UserWorkspace);
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  return { currentWorkspace, userWorkspace, activePeriod, profile };
}
