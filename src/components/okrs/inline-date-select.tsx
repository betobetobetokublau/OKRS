'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatShortDate } from './asana-detail-shell';

interface InlineDateSelectProps {
  /** Task id — writes `tasks.due_date`. */
  id: string;
  iso: string | null;
  overdue?: boolean;
  onChanged: () => void;
}

/**
 * Inline editable due date. The formatted date (or "Sin fecha") is a text
 * link; clicking opens a native `<input type="date">` popover with a
 * "Quitar fecha" action. Mirrors InlineDateRange's popover styling.
 */
export function InlineDateSelect({ id, iso, overdue, onChanged }: InlineDateSelectProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function save(value: string | null) {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('tasks').update({ due_date: value }).eq('id', id);
    setSaving(false);
    setOpen(false);
    if (error) return;
    onChanged();
  }

  const formatted = formatShortDate(iso);
  const color = !formatted ? '#919eab' : overdue ? '#de3618' : '#5c6ac4';

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        title="Clic para cambiar la fecha límite"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          fontSize: '1.3rem',
          color,
          fontWeight: overdue ? 600 : 400,
          textDecoration: 'underline',
          textDecorationStyle: open ? 'solid' : 'dotted',
          textUnderlineOffset: '3px',
          cursor: saving ? 'progress' : 'pointer',
        }}
      >
        {formatted ?? 'Sin fecha'}
        {formatted && overdue && <span style={{ marginLeft: '0.6rem', fontSize: '1.1rem' }}>— Vencida</span>}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '0.4rem',
            zIndex: 20,
            background: 'white',
            border: '1px solid #c4cdd5',
            borderRadius: '6px',
            boxShadow: '0 6px 24px rgba(15,24,48,0.12)',
            padding: '0.6rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
          }}
        >
          <input
            type="date"
            autoFocus
            aria-label="Fecha límite"
            value={iso ?? ''}
            disabled={saving}
            onChange={(e) => {
              if (e.target.value) save(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                // Close only the popover, not the surrounding side panel.
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }}
            style={{
              padding: '0.4rem 0.6rem',
              fontSize: '1.3rem',
              border: '1px solid #dfe3e8',
              borderRadius: '4px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {iso && (
            <button
              type="button"
              onClick={() => save(null)}
              disabled={saving}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                fontSize: '1.2rem',
                color: '#637381',
                textAlign: 'left',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                cursor: saving ? 'progress' : 'pointer',
              }}
            >
              Quitar fecha
            </button>
          )}
        </div>
      )}
    </div>
  );
}
