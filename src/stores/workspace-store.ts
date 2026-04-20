import { create } from 'zustand';
import type { Workspace, UserWorkspace, Period, Profile } from '@/types';

/**
 * The "effective identity" stored in `profile` + `userWorkspace` is what
 * every page reads to decide what to show. When an admin impersonates a
 * member, `enterImpersonation` swaps those two with the target's data and
 * stashes the real values under `originalProfile` / `originalUserWorkspace`
 * so `exitImpersonation` can restore them without a refetch.
 *
 * `isImpersonating` is a derived boolean kept on the store purely so
 * components (topbar, guards) don't have to compare profile ids.
 */
interface WorkspaceState {
  currentWorkspace: Workspace | null;
  userWorkspace: UserWorkspace | null;
  activePeriod: Period | null;
  profile: Profile | null;

  // Impersonation
  isImpersonating: boolean;
  originalProfile: Profile | null;
  originalUserWorkspace: UserWorkspace | null;

  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setUserWorkspace: (uw: UserWorkspace | null) => void;
  setActivePeriod: (period: Period | null) => void;
  setProfile: (profile: Profile | null) => void;

  /**
   * Enter "view as user" mode. `original*` should be the admin's real
   * identity — the caller is responsible for verifying that the admin
   * truly has role === 'admin' in this workspace before invoking this.
   */
  enterImpersonation: (
    original: { profile: Profile; userWorkspace: UserWorkspace },
    target: { profile: Profile; userWorkspace: UserWorkspace },
  ) => void;

  /** Restore the admin identity from the stashed original values. */
  exitImpersonation: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentWorkspace: null,
  userWorkspace: null,
  activePeriod: null,
  profile: null,

  isImpersonating: false,
  originalProfile: null,
  originalUserWorkspace: null,

  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
  setUserWorkspace: (uw) => set({ userWorkspace: uw }),
  setActivePeriod: (period) => set({ activePeriod: period }),
  setProfile: (profile) => set({ profile }),

  enterImpersonation: (original, target) =>
    set({
      profile: target.profile,
      userWorkspace: target.userWorkspace,
      originalProfile: original.profile,
      originalUserWorkspace: original.userWorkspace,
      isImpersonating: true,
    }),

  exitImpersonation: () => {
    const { originalProfile, originalUserWorkspace } = get();
    // If the original isn't available (e.g. store was freshly hydrated on
    // a refresh mid-impersonation before the re-fetch completed), fall
    // back to clearing the flag only — use-workspace will re-seed on the
    // next tick.
    set({
      profile: originalProfile ?? null,
      userWorkspace: originalUserWorkspace ?? null,
      originalProfile: null,
      originalUserWorkspace: null,
      isImpersonating: false,
    });
  },
}));
