'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BlockReasonDialog } from '@/components/tasks/block-reason-dialog';
import {
  type StatusChip,
  kpiStatusFromProgress,
  objectiveStatusChip,
  taskStatusChip,
  OBJECTIVE_STATUS_OPTIONS,
  TASK_STATUS_OPTIONS,
} from './status-chips';

type Entity = 'kpi' | 'objective' | 'task';

interface InlineStatusSelectProps {
  entity: Entity;
  id: string;
  currentStatus: string; // ignored for kpi
  progress?: number; // required for kpi derived status
  canEdit: boolean;
  onChanged: () => void;
}

const CHEVRON_DOWN = 'M6 9l6 6 6-6';

function StaticChip({ chip }: { chip: StatusChip }) {
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
      <span
        style={{
          width: '0.8rem',
          height: '0.8rem',
          borderRadius: '50%',
          backgroundColor: chip.dot,
        }}
      />
      {chip.label}
    </span>
  );
}

/**
 * Inline select for the Estado column.
 * - KPI rows render a non-interactive derived chip (no DB status column).
 * - Objective rows render a dropdown of objective statuses.
 * - Task rows render a dropdown that mirrors TaskRow's mutation flow, including
 *   BlockReasonDialog when transitioning TO 'blocked'.
 * - When canEdit is false, renders a read-only chip.
 */
export function InlineStatusSelect({
  entity,
  id,
  currentStatus,
  progress,
  canEdit,
  onChanged,
}: InlineStatusSelectProps) {
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(currentStatus);
  const [showBlockDialog, setShowBlockDialog] = useState(false);

  // KPI: always a static derived chip
  if (entity === 'kpi') {
    const chip = kpiStatusFromProgress(progress ?? 0);
    return <StaticChip chip={chip} />;
  }

  const chip =
    entity === 'objective' ? objectiveStatusChip(value) : taskStatusChip(value);

  if (!canEdit) {
    return <StaticChip chip={chip} />;
  }

  const options = entity === 'objective' ? OBJECTIVE_STATUS_OPTIONS : TASK_STATUS_OPTIONS;

  async function applyChange(newStatus: string, clearBlockReason: boolean) {
    setSaving(true);
    const supabase = createClient();
    const table = entity === 'objective' ? 'objectives' : 'tasks';
    const updates: Record<string, unknown> = { status: newStatus };
    if (clearBlockReason) updates.block_reason = null;
    await supabase.from(table).update(updates).eq('id', id);
    setSaving(false);
    setValue(newStatus);
    onChanged();
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const next = e.target.value;

    // Task moving TO blocked → open block-reason dialog first.
    if (entity === 'task' && next === 'blocked') {
      setShowBlockDialog(true);
      return;
    }

    const clearBlockReason = entity === 'task' && value === 'blocked';
    await applyChange(next, clearBlockReason);
  }

  async function handleBlockConfirm(reason: string) {
    setSaving(true);
    const supabase = createClient();
    await supabase.from('tasks').update({ status: 'blocked', block_reason: reason }).eq('id', id);
    setSaving(false);
    setValue('blocked');
    setShowBlockDialog(false);
    onChanged();
  }

  return (
    <>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          minWidth: '14rem',
        }}
      >
        {/* Overlay showing current chip style */}
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
            color: '#212b36',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span
            style={{
              width: '0.8rem',
              height: '0.8rem',
              borderRadius: '50%',
              backgroundColor: chip.dot,
              flexShrink: 0,
            }}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
        </div>

        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#637381"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <path d={CHEVRON_DOWN} />
        </svg>

        <select
          value={value}
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
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ color: '#212b36' }}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {showBlockDialog && (
        <BlockReasonDialog
          onConfirm={handleBlockConfirm}
          onCancel={() => setShowBlockDialog(false)}
        />
      )}
    </>
  );
}
