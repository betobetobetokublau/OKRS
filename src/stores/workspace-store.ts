import { create } from 'zustand';
import type { Workspace, UserWorkspace, Period, Profile } from '@/types';

interface WorkspaceState {
  currentWorkspace: Workspace | null;
  userWorkspace: UserWorkspace | null;
  activePeriod: Period | null;
  profile: Profile | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setUserWorkspace: (uw: UserWorkspace | null) => void;
  setActivePeriod: (period: Period | null) => void;
  setProfile: (profile: Profile | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  currentWorkspace: null,
  userWorkspace: null,
  activePeriod: null,
  profile: null,
  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
  setUserWorkspace: (uw) => set({ userWorkspace: uw }),
  setActivePeriod: (period) => set({ activePeriod: period }),
  setProfile: (profile) => set({ profile }),
}));
