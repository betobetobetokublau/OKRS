'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Department } from '@/types';

interface InlineTeamSelectProps {
  entity: 'kpi' | 'objective';
  id: string;
  currentDepartmentId: string | null;
  currentDepartment?: Department | null;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
}

const CHEVRON_DOWN = 'M6 9l6 6 6-6';

/**
 * Inline select for the Equipo column. Native <select> styled as a pill
 * with neutral border, white background, chevron-down icon.
 * Clicks/changes stop propagation so the parent row's expand handler does not fire.
 */
export function InlineTeamSelect({
  entity,
  id,
  currentDepartmentId,
  currentDepartment,
  departments,
  canEdit,
  onChanged,
}: InlineTeamSelectProps) {
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<string>(currentDepartmentId ?? '');

  if (!canEdit) {
    // Read-only chip fallback
    const dept = currentDepartment ?? departments.find((d) => d.id === currentDepartmentId);
    if (!dept) return <span style={{ color: '#919eab' }}>—</span>;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.2rem 0.8rem',
          borderRadius: '10rem',
          backgroundColor: '#f4f6f8',
          color: '#212b36',
          fontSize: '1.2rem',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          border: '1px solid #dfe3e8',
        }}
      >
        <span
          style={{
            width: '0.8rem',
            height: '0.8rem',
            borderRadius: '50%',
            backgroundColor: dept.color || '#919eab',
          }}
        />
        {dept.name}
      </span>
    );
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const next = e.target.value;
    setValue(next);
    setSaving(true);
    const supabase = createClient();
    const table = entity === 'kpi' ? 'kpis' : 'objectives';
    await supabase
      .from(table)
      .update({ responsible_department_id: next || null })
      .eq('id', id);
    setSaving(false);
    onChanged();
  }

  const selected = departments.find((d) => d.id === value);
  const dotColor = selected?.color || '#c4cdd5';
  const labelText = selected ? selected.name : 'Sin asignar';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: '14rem',
      }}
    >
      {/* Visual overlay — shows the current department with color dot */}
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
          color: selected ? '#212b36' : '#919eab',
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
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelText}</span>
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
        <option value="" style={{ color: '#212b36' }}>— Sin asignar —</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id} style={{ color: '#212b36' }}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}
