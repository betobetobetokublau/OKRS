import { create } from 'zustand';

interface SkillTreeState {
  filterDepartmentId: string | null;
  filterKpiId: string | null;
  filterObjectiveId: string | null;
  selectedNodeId: string | null;
  viewMode: 'tree' | 'table';
  setFilterDepartment: (id: string | null) => void;
  setFilterKpi: (id: string | null) => void;
  setFilterObjective: (id: string | null) => void;
  setSelectedNode: (id: string | null) => void;
  setViewMode: (mode: 'tree' | 'table') => void;
  clearFilters: () => void;
}

export const useSkillTreeStore = create<SkillTreeState>((set) => ({
  filterDepartmentId: null,
  filterKpiId: null,
  filterObjectiveId: null,
  selectedNodeId: null,
  viewMode: 'tree',
  setFilterDepartment: (id) => set({ filterDepartmentId: id, filterKpiId: null, filterObjectiveId: null }),
  setFilterKpi: (id) => set({ filterKpiId: id, filterDepartmentId: null, filterObjectiveId: null }),
  setFilterObjective: (id) => set({ filterObjectiveId: id, filterDepartmentId: null, filterKpiId: null }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  clearFilters: () => set({ filterDepartmentId: null, filterKpiId: null, filterObjectiveId: null }),
}));
