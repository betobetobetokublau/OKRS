'use client';

import { useState } from 'react';
import { ProgressBar } from '@/components/common/progress-bar';

interface ProgressInlineEditProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

export function ProgressInlineEdit({ value, onChange, label }: ProgressInlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  function handleSave() {
    onChange(tempValue);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div onClick={() => { setEditing(true); setTempValue(value); }} style={{ cursor: 'pointer' }}>
        {label && <span style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.2rem', display: 'block' }}>{label}</span>}
        <ProgressBar value={value} size="medium" />
      </div>
    );
  }

  return (
    <div>
      {label && <span style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.2rem', display: 'block' }}>{label}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <input
          type="range"
          min={0}
          max={100}
          value={tempValue}
          onChange={(e) => setTempValue(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: '1.3rem', fontWeight: 600, minWidth: '36px' }}>{tempValue}%</span>
        <button
          onClick={handleSave}
          style={{ padding: '0.3rem 0.8rem', fontSize: '1.2rem', color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
        >
          OK
        </button>
        <button
          onClick={() => setEditing(false)}
          style={{ padding: '0.3rem 0.8rem', fontSize: '1.2rem', color: '#637381', backgroundColor: '#f4f6f8', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
        >
          &times;
        </button>
      </div>
    </div>
  );
}
