'use client';

import { useMemo, useState } from 'react';

export interface SearchableChecklistItem {
  id: string;
  label: string;
}

interface SearchableChecklistProps {
  items: SearchableChecklistItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Placeholder for the search input — should hint what is being searched. */
  searchPlaceholder?: string;
  /** Shown inside the list when `items` is empty. */
  emptyMessage?: string;
  /** Approximate visible-row count; the list scrolls beyond this. */
  visibleRows?: number;
}

/**
 * Checkbox list with a sticky search filter on top. Used by the KPI form
 * (Objetivos vinculados) and the Objective form (KPIs vinculados) so the
 * pickers stay usable as the workspace grows past a handful of items.
 *
 * The search filter is case-insensitive substring matching on the label.
 * The scrollable area is capped at ~`visibleRows` rows of the typical
 * row height; no row is removed from the DOM (so checking a filtered-out
 * item from a previous render keeps that selection alive).
 */
export function SearchableChecklist({
  items,
  selectedIds,
  onToggle,
  searchPlaceholder = 'Buscar…',
  emptyMessage,
  visibleRows = 5,
}: SearchableChecklistProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  // Approx row height — checkbox + label at 1.3rem with 0.4rem vertical
  // gap. Tuned to keep ~5 rows visible at the default visibleRows.
  const ROW_H_REM = 2.2;

  return (
    <div
      style={{
        border: '1px solid #c4cdd5',
        borderRadius: '4px',
        backgroundColor: 'white',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: '0.6rem 0.8rem',
          borderBottom: '1px solid #edeff2',
          backgroundColor: '#fafbfb',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#919eab"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{
            position: 'absolute',
            left: '1.4rem',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          style={{
            width: '100%',
            padding: '0.4rem 0.6rem 0.4rem 2.4rem',
            fontSize: '1.3rem',
            border: '1px solid #dfe3e8',
            borderRadius: '4px',
            backgroundColor: 'white',
            color: '#212b36',
            outline: 'none',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          padding: '0.6rem 0.8rem',
          maxHeight: `${ROW_H_REM * visibleRows}rem`,
          overflowY: 'auto',
        }}
      >
        {items.length === 0 ? (
          <span style={{ color: '#637381', fontSize: '1.2rem' }}>{emptyMessage}</span>
        ) : filtered.length === 0 ? (
          <span style={{ color: '#637381', fontSize: '1.2rem' }}>Sin resultados</span>
        ) : (
          filtered.map((item) => (
            <label
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                fontSize: '1.3rem',
                cursor: 'pointer',
                color: '#212b36',
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => onToggle(item.id)}
              />
              {item.label}
            </label>
          ))
        )}
      </div>
    </div>
  );
}
