'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useObjectiveOptions, NO_DEPARTMENT_LABEL } from '@/hooks/use-objective-options';
import type { Objective } from '@/types';

interface InlineObjectiveSelectProps {
  /** Task id — writes `tasks.objective_id` (null allowed). */
  id: string;
  workspaceId: string;
  periodId: string | undefined;
  currentObjective: Objective | null;
  /** Workspace slug for the "open objective" link; omit to hide it. */
  slug?: string;
  onChanged: () => void;
}

const NONE = '';

/**
 * Inline editable parent objective. Read state shows the objective title as
 * an indigo link-styled value (or "Sin objetivo"); clicking swaps in a native
 * `<select>` grouped by department (`<optgroup>`), with a leading
 * "— Sin objetivo —" option. Options load lazily when the select opens.
 */
export function InlineObjectiveSelect({
  id,
  workspaceId,
  periodId,
  currentObjective,
  slug,
  onChanged,
}: InlineObjectiveSelectProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(nextId: string | null) {
    if ((nextId ?? null) === (currentObjective?.id ?? null)) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('tasks').update({ objective_id: nextId }).eq('id', id);
    setSaving(false);
    setOpen(false);
    if (error) return;
    onChanged();
  }

  if (open) {
    return (
      <ObjectivePicker
        workspaceId={workspaceId}
        periodId={periodId}
        currentObjective={currentObjective}
        saving={saving}
        onPick={save}
        onClose={() => setOpen(false)}
      />
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
      <button
        type="button"
        title="Clic para cambiar el objetivo"
        onClick={() => setOpen(true)}
        disabled={saving}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          fontSize: '1.3rem',
          fontWeight: currentObjective ? 500 : 400,
          color: currentObjective ? '#5c6ac4' : '#919eab',
          textAlign: 'left',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: '3px',
          cursor: saving ? 'progress' : 'pointer',
          minWidth: 0,
          overflowWrap: 'anywhere',
        }}
      >
        {currentObjective ? currentObjective.title : 'Sin objetivo'}
      </button>
      {currentObjective && slug && (
        <Link
          href={`/${slug}/objetivos/${currentObjective.id}`}
          title="Abrir objetivo"
          aria-label="Abrir objetivo"
          style={{ color: '#919eab', fontSize: '1.2rem', textDecoration: 'none', flexShrink: 0 }}
        >
          ↗
        </Link>
      )}
    </span>
  );
}

function ObjectivePicker({
  workspaceId,
  periodId,
  currentObjective,
  saving,
  onPick,
  onClose,
}: {
  workspaceId: string;
  periodId: string | undefined;
  currentObjective: Objective | null;
  saving: boolean;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const { groups, objectives, loading } = useObjectiveOptions(workspaceId, periodId);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    selectRef.current?.focus();
  }, [loading]);

  // The current objective may belong to another period; keep it selectable.
  const currentMissing =
    currentObjective !== null && !objectives.some((o) => o.id === currentObjective.id);

  return (
    <select
      ref={selectRef}
      aria-label="Objetivo"
      value={currentObjective?.id ?? NONE}
      disabled={saving || loading}
      onChange={(e) => onPick(e.target.value === NONE ? null : e.target.value)}
      onBlur={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Don't let the side panel's window listener close the panel.
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      style={{
        width: '100%',
        maxWidth: '100%',
        height: '2.8rem',
        padding: '0.2rem 0.8rem',
        border: '1px solid #5c6ac4',
        borderRadius: '4px',
        backgroundColor: 'white',
        fontSize: '1.2rem',
        color: '#212b36',
        fontFamily: 'inherit',
        cursor: saving || loading ? 'progress' : 'pointer',
        outline: 'none',
        boxShadow: '0 0 0 3px rgba(92,106,196,0.15)',
      }}
    >
      <option value={NONE}>— Sin objetivo —</option>
      {loading && <option disabled>Cargando…</option>}
      {currentMissing && currentObjective && (
        <optgroup label="Actual">
          <option value={currentObjective.id}>{currentObjective.title}</option>
        </optgroup>
      )}
      {groups.map((g) => (
        <optgroup key={g.department?.id ?? '__none'} label={g.department?.name ?? NO_DEPARTMENT_LABEL}>
          {g.objectives.map((o) => (
            <option key={`${g.department?.id ?? 'none'}-${o.id}`} value={o.id}>
              {o.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
