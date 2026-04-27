'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatShortDate, AsanaEmpty } from './asana-detail-shell';

interface InlineDateRangeProps {
  /**
   * Currently only 'objective' is supported (start_date / end_date on
   * `objectives`). Easy to extend if KPIs grow planning windows later.
   */
  entity: 'objective';
  id: string;
  startIso: string | null;
  endIso: string | null;
  canEdit: boolean;
  onChanged: () => void;
}

type OpenSide = 'start' | 'end' | null;

/**
 * Inline editable date range. Each end is a text link; clicking flips
 * a native `<input type="date">` open underneath that end (positioned
 * absolutely so the surrounding row layout doesn't shift). Picking a
 * date writes through to the row immediately and refreshes the parent.
 *
 * Reading-only mode falls back to the formatted "1 abr – 30 jun 2026"
 * label that AsanaDateRangeValue rendered before.
 */
export function InlineDateRange({
  entity,
  id,
  startIso,
  endIso,
  canEdit,
  onChanged,
}: InlineDateRangeProps) {
  const [open, setOpen] = useState<OpenSide>(null);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + ESC so the inline picker behaves like a
  // popover.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    document.addEventListener('pointerdown', onDocPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function save(side: 'start' | 'end', value: string) {
    setSaving(true);
    const supabase = createClient();
    const column = side === 'start' ? 'start_date' : 'end_date';
    const table = entity === 'objective' ? 'objectives' : 'objectives';
    await supabase
      .from(table)
      .update({ [column]: value || null })
      .eq('id', id);
    setSaving(false);
    setOpen(null);
    onChanged();
  }

  if (!canEdit) {
    if (!startIso && !endIso) return <AsanaEmpty>Sin fechas</AsanaEmpty>;
    if (startIso && !endIso) return <span>{`desde ${formatShortDate(startIso)}`}</span>;
    if (!startIso && endIso) return <span>{`hasta ${formatShortDate(endIso)}`}</span>;
    return <span>{`${formatShortDate(startIso)} – ${formatShortDate(endIso)}`}</span>;
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        flexWrap: 'wrap',
      }}
    >
      <DateLink
        iso={startIso}
        emptyLabel="Agregar inicio"
        active={open === 'start'}
        disabled={saving}
        onClick={() => setOpen((o) => (o === 'start' ? null : 'start'))}
      />
      <span style={{ color: '#919eab' }}>–</span>
      <DateLink
        iso={endIso}
        emptyLabel="Agregar fin"
        active={open === 'end'}
        disabled={saving}
        onClick={() => setOpen((o) => (o === 'end' ? null : 'end'))}
      />

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            // Anchor the popover to the side that was clicked so the
            // calendar appears directly beneath that text link.
            left: open === 'start' ? 0 : 'auto',
            right: open === 'end' ? 0 : 'auto',
            marginTop: '0.4rem',
            zIndex: 20,
            background: 'white',
            border: '1px solid #c4cdd5',
            borderRadius: '6px',
            boxShadow: '0 6px 24px rgba(15,24,48,0.12)',
            padding: '0.6rem',
          }}
        >
          <input
            type="date"
            autoFocus
            value={(open === 'start' ? startIso : endIso) ?? ''}
            disabled={saving}
            onChange={(e) => save(open, e.target.value)}
            style={{
              padding: '0.4rem 0.6rem',
              fontSize: '1.3rem',
              border: '1px solid #dfe3e8',
              borderRadius: '4px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}
    </div>
  );
}

function DateLink({
  iso,
  emptyLabel,
  active,
  disabled,
  onClick,
}: {
  iso: string | null;
  emptyLabel: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const label = formatShortDate(iso) ?? emptyLabel;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        fontSize: '1.4rem',
        color: iso ? '#5c6ac4' : '#919eab',
        textDecoration: 'underline',
        textDecorationStyle: active ? 'solid' : 'dotted',
        textUnderlineOffset: '3px',
        cursor: disabled ? 'progress' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}
