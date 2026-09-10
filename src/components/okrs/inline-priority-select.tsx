'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PRIORITY_CHIPS, PRIORITY_OPTIONS, type PriorityChip } from '@/components/tasks/priority';
import type { TaskPriority } from '@/types';

interface InlinePrioritySelectProps {
  id: string;
  currentPriority: TaskPriority | null;
  canEdit: boolean;
  onChanged: () => void;
}

const CHEVRON_DOWN = 'M6 9l6 6 6-6';

const NONE_CHIP: PriorityChip = { label: 'Sin prioridad', bg: '#f4f6f8', fg: '#637381', glyph: '·' };

export function priorityChip(p: TaskPriority | null): PriorityChip {
  return p ? PRIORITY_CHIPS[p] : NONE_CHIP;
}

function StaticChip({ chip }: { chip: PriorityChip }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.2rem 0.8rem',
        borderRadius: '10rem',
        backgroundColor: chip.bg,
        color: chip.fg,
        fontSize: '1.2rem',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ fontSize: '0.9rem', lineHeight: 1 }}>{chip.glyph}</span>
      {chip.label}
    </span>
  );
}

/**
 * Inline select for the Prioridad field. Visual twin of InlineStatusSelect:
 * a native <select> under a pill-styled overlay. Writes `tasks.priority`
 * (null when "Sin prioridad"). Read-only chip when `canEdit` is false.
 */
export function InlinePrioritySelect({ id, currentPriority, canEdit, onChanged }: InlinePrioritySelectProps) {
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<TaskPriority | null>(currentPriority);

  const chip = priorityChip(value);

  if (!canEdit) {
    return <StaticChip chip={chip} />;
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const raw = e.target.value;
    const next: TaskPriority | null = raw === 'high' || raw === 'medium' || raw === 'low' ? raw : null;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('tasks').update({ priority: next }).eq('id', id);
    setSaving(false);
    if (error) return;
    setValue(next);
    onChanged();
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: '14rem' }}
    >
      <div
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0 2.4rem 0 0.8rem',
          fontSize: '1.2rem',
          color: value ? '#212b36' : '#919eab',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '1.6rem',
            height: '1.6rem',
            borderRadius: '4px',
            backgroundColor: chip.bg,
            color: chip.fg,
            fontSize: '0.9rem',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {chip.glyph}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
      </div>

      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#637381"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      >
        <path d={CHEVRON_DOWN} />
      </svg>

      <select
        aria-label="Prioridad"
        value={value ?? ''}
        onClick={(e) => e.stopPropagation()}
        onChange={handleChange}
        disabled={saving}
        style={{
          width: '100%',
          height: '2.8rem',
          padding: '0.2rem 2.4rem 0.2rem 2.4rem',
          border: '1px solid #c4cdd5',
          borderRadius: '4px',
          backgroundColor: 'white',
          fontSize: '1.2rem',
          color: 'transparent',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          cursor: saving ? 'progress' : 'pointer',
          outline: 'none',
        }}
      >
        {PRIORITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ color: '#212b36' }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
