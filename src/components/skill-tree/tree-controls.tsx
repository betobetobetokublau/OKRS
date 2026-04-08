'use client';

import { useSkillTreeStore } from '@/stores/skill-tree-store';
import type { Department, KPI } from '@/types';

interface TreeControlsProps {
  departments: Department[];
  kpis: KPI[];
}

export function TreeControls({ departments, kpis }: TreeControlsProps) {
  const {
    filterDepartmentId,
    filterKpiId,
    viewMode,
    setFilterDepartment,
    setFilterKpi,
    setViewMode,
    clearFilters,
  } = useSkillTreeStore();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', padding: '1.2rem 0', flexWrap: 'wrap' }}>
      {/* View toggle */}
      <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #dfe3e8' }}>
        <button
          onClick={() => setViewMode('tree')}
          style={{
            padding: '0.5rem 1.2rem',
            fontSize: '1.2rem',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: viewMode === 'tree' ? '#5c6ac4' : 'white',
            color: viewMode === 'tree' ? 'white' : '#637381',
          }}
        >
          Skill Tree
        </button>
        <button
          onClick={() => setViewMode('table')}
          style={{
            padding: '0.5rem 1.2rem',
            fontSize: '1.2rem',
            fontWeight: 500,
            border: 'none',
            borderLeft: '1px solid #dfe3e8',
            cursor: 'pointer',
            backgroundColor: viewMode === 'table' ? '#5c6ac4' : 'white',
            color: viewMode === 'table' ? 'white' : '#637381',
          }}
        >
          Tabla
        </button>
      </div>

      {/* Department filter */}
      <select
        value={filterDepartmentId || ''}
        onChange={(e) => setFilterDepartment(e.target.value || null)}
        style={{ padding: '0.5rem 0.8rem', fontSize: '1.2rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}
      >
        <option value="">Todos los departamentos</option>
        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>

      {/* KPI filter */}
      <select
        value={filterKpiId || ''}
        onChange={(e) => setFilterKpi(e.target.value || null)}
        style={{ padding: '0.5rem 0.8rem', fontSize: '1.2rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}
      >
        <option value="">Todos los KPIs</option>
        {kpis.map(k => <option key={k.id} value={k.id}>{k.title}</option>)}
      </select>

      {(filterDepartmentId || filterKpiId) && (
        <button
          onClick={clearFilters}
          style={{ padding: '0.5rem 1rem', fontSize: '1.2rem', color: '#de3618', backgroundColor: '#fbeae5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
