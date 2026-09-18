'use client';

import { useEffect, useState } from 'react';
import { StaticChip } from '@/components/okrs/inline-status-select';
import { boardStatusChip, BOARD_STATUS_OPTIONS } from '@/components/okrs/status-chips';
import { setBoardStatus } from '@/hooks/use-board-progress';
import type { BoardStatus } from '@/types';

interface BoardStatusSelectProps {
  boardId: string;
  status: BoardStatus;
  canEdit: boolean;
  /** Called after the write succeeds, with the new value. */
  onChanged?: (status: BoardStatus) => void;
  size?: 'normal' | 'large';
}

const CHEVRON_DOWN = 'M6 9l6 6 6-6';

/**
 * Project status chip. Read-only chip for viewers; for editors a native
 * <select> hidden under the chip so the dropdown is keyboard/touch friendly
 * (same trick as InlineStatusSelect).
 */
export function BoardStatusSelect({ boardId, status, canEdit, onChanged, size = 'normal' }: BoardStatusSelectProps) {
  const [value, setValue] = useState<BoardStatus>(status);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(status), [status]);
  const chip = boardStatusChip(value);

  if (!canEdit) return <StaticChip chip={chip} />;

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as BoardStatus;
    const prev = value;
    setValue(next);
    setSaving(true);
    const { error } = await setBoardStatus(boardId, next);
    setSaving(false);
    if (error) {
      setValue(prev);
      return;
    }
    onChanged?.(next);
  }

  const height = size === 'large' ? '3.2rem' : '2.8rem';
  const font = size === 'large' ? '1.3rem' : '1.2rem';

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: '15rem' }}>
      <div
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0 2.6rem 0 1rem',
          fontSize: font,
          fontWeight: 500,
          color: chip.fg,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: '0.8rem', height: '0.8rem', borderRadius: '50%', backgroundColor: chip.dot, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={chip.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <path d={CHEVRON_DOWN} />
      </svg>
      <select
        aria-label="Estado del proyecto"
        value={value}
        onChange={handleChange}
        disabled={saving}
        style={{
          width: '100%',
          height,
          padding: '0 2.6rem 0 2.4rem',
          border: 'none',
          borderRadius: '10rem',
          backgroundColor: chip.bg,
          fontSize: font,
          color: 'transparent',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          cursor: saving ? 'progress' : 'pointer',
          outline: 'none',
        }}
      >
        {BOARD_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} style={{ color: '#212b36' }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
