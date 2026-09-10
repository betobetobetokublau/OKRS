'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TASK_STATUS_OPTIONS } from '@/components/okrs/status-chips';
import {
  GROUPING_OPTIONS,
  QUICK_FILTER_LABELS,
  SORT_OPTIONS,
  countActiveFilters,
  type BoardFilters,
  type BoardGrouping,
  type BoardSort,
  type PriorityFilter,
  type QuickFilter,
} from './board-filters';
import type { Profile, TaskStatus } from '@/types';

interface BoardToolbarProps {
  canEdit: boolean;
  members: Profile[];
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  sort: BoardSort;
  onSortChange: (s: BoardSort) => void;
  grouping: BoardGrouping;
  onGroupingChange: (g: BoardGrouping) => void;
  standupActive: boolean;
  onToggleStandup: () => void;
  onAddTask: () => void;
  /** Opens "Configuración del tablero"; the button is disabled when omitted. */
  onOpenSettings?: () => void;
}

const PILL: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  height: '32px',
  padding: '0 1.2rem',
  fontSize: '1.3rem',
  fontWeight: 500,
  color: '#212b36',
  backgroundColor: 'white',
  border: '1px solid #c4cdd5',
  borderRadius: '999px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const SELECT_PILL: CSSProperties = {
  ...PILL,
  appearance: 'none',
  WebkitAppearance: 'none',
  paddingRight: '2.6rem',
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23637381' stroke-width='1.5' fill='none'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 1rem center',
};

const PRIORITY_FILTERS: Array<{ value: PriorityFilter; label: string }> = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
  { value: 'none', label: 'Sin prioridad' },
];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function BoardToolbar({
  canEdit,
  members,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  grouping,
  onGroupingChange,
  standupActive,
  onToggleStandup,
  onAddTask,
  onOpenSettings,
}: BoardToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const activeCount = countActiveFilters(filters);

  useEffect(() => {
    if (!filtersOpen) return;
    function onDocClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setFiltersOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [filtersOpen]);

  const clearFilters = () => onFiltersChange({ ...filters, quick: [], statuses: [], priorities: [] });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '1.6rem' }}>
      {canEdit && (
        <button
          type="button"
          onClick={onAddTask}
          style={{ ...PILL, backgroundColor: '#5c6ac4', color: 'white', border: '1px solid #5c6ac4', fontWeight: 600, borderRadius: '6px' }}
        >
          + Agregar tarea
        </button>
      )}
      <button
        type="button"
        onClick={onToggleStandup}
        aria-pressed={standupActive}
        title="Modo standup (pantalla completa)"
        style={{
          ...PILL,
          borderRadius: '6px',
          border: '1px solid #212b36',
          backgroundColor: standupActive ? '#212b36' : 'white',
          color: standupActive ? 'white' : '#212b36',
          fontWeight: 600,
        }}
      >
        ▶ Standup
      </button>

      <span style={{ flex: 1 }} />

      {/* Asignado */}
      <select
        aria-label="Asignado"
        value={filters.assignee}
        onChange={(e) => onFiltersChange({ ...filters, assignee: e.target.value })}
        style={{ ...SELECT_PILL, color: filters.assignee === 'all' ? '#212b36' : '#5c6ac4' }}
      >
        <option value="all">Asignado: Todos</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>

      {/* Filtros */}
      <div ref={popRef} style={{ position: 'relative' }}>
        <span style={{ display: 'inline-flex' }}>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            style={{
              ...PILL,
              borderRadius: activeCount > 0 ? '999px 0 0 999px' : '999px',
              backgroundColor: activeCount > 0 ? '#eef0fb' : 'white',
              borderColor: activeCount > 0 ? '#5c6ac4' : '#c4cdd5',
              color: activeCount > 0 ? '#5c6ac4' : '#212b36',
            }}
          >
            Filtros{activeCount > 0 ? `: ${activeCount}` : ''}
          </button>
          {activeCount > 0 && (
            <button
              type="button"
              aria-label="Limpiar filtros"
              onClick={clearFilters}
              style={{
                ...PILL,
                padding: '0 1rem',
                borderRadius: '0 999px 999px 0',
                borderLeft: 'none',
                backgroundColor: '#eef0fb',
                borderColor: '#5c6ac4',
                color: '#5c6ac4',
              }}
            >
              ✕
            </button>
          )}
        </span>

        {filtersOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.6rem',
              width: '360px',
              backgroundColor: 'white',
              border: '1px solid #dfe3e8',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(33,43,54,0.14)',
              padding: '1.4rem',
              zIndex: 60,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#919eab', letterSpacing: '0.06em' }}>FILTROS RÁPIDOS</span>
              <span style={{ flex: 1 }} />
              {activeCount > 0 && (
                <button type="button" onClick={clearFilters} style={{ border: 'none', background: 'none', color: '#5c6ac4', fontSize: '1.2rem', cursor: 'pointer', padding: 0 }}>
                  Limpiar
                </button>
              )}
            </div>
            <ChipRow>
              {(Object.keys(QUICK_FILTER_LABELS) as QuickFilter[]).map((q) => (
                <FilterChip key={q} active={filters.quick.includes(q)} onClick={() => onFiltersChange({ ...filters, quick: toggle(filters.quick, q) })}>
                  {QUICK_FILTER_LABELS[q]}
                </FilterChip>
              ))}
            </ChipRow>

            <BuilderLabel>Estado</BuilderLabel>
            <ChipRow>
              {TASK_STATUS_OPTIONS.map((o) => (
                <FilterChip
                  key={o.value}
                  active={filters.statuses.includes(o.value as TaskStatus)}
                  onClick={() => onFiltersChange({ ...filters, statuses: toggle(filters.statuses, o.value as TaskStatus) })}
                >
                  {o.label}
                </FilterChip>
              ))}
            </ChipRow>

            <BuilderLabel>Prioridad</BuilderLabel>
            <ChipRow>
              {PRIORITY_FILTERS.map((o) => (
                <FilterChip key={o.value} active={filters.priorities.includes(o.value)} onClick={() => onFiltersChange({ ...filters, priorities: toggle(filters.priorities, o.value) })}>
                  {o.label}
                </FilterChip>
              ))}
            </ChipRow>
          </div>
        )}
      </div>

      {/* Ordenar */}
      <select aria-label="Ordenar" value={sort} onChange={(e) => onSortChange(e.target.value as BoardSort)} style={SELECT_PILL}>
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            ↕ {o.label}
          </option>
        ))}
      </select>

      {/* Agrupar */}
      <select aria-label="Agrupar" value={grouping} onChange={(e) => onGroupingChange(e.target.value as BoardGrouping)} style={SELECT_PILL}>
        {GROUPING_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            ▦ {o.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onOpenSettings}
        disabled={!onOpenSettings}
        aria-label="Configuración del tablero"
        title={onOpenSettings ? 'Configuración del tablero' : 'Solo administradores'}
        style={{ ...PILL, padding: '0 1rem', color: onOpenSettings ? '#212b36' : '#c4cdd5', cursor: onOpenSettings ? 'pointer' : 'not-allowed' }}
      >
        ⚙
      </button>
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.2rem' }}>{children}</div>;
}

function BuilderLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 0.6rem', fontSize: '1.2rem', fontWeight: 600, color: '#637381' }}>{children}</p>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        padding: '0.35rem 1rem',
        fontSize: '1.2rem',
        fontWeight: 500,
        borderRadius: '999px',
        border: active ? '1px solid #5c6ac4' : '1px solid #dfe3e8',
        backgroundColor: active ? '#eef0fb' : 'white',
        color: active ? '#5c6ac4' : '#454f5b',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
