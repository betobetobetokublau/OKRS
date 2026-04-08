'use client';

import { getProgressColor } from '@/lib/utils/progress';

interface ProgressBarProps {
  value: number;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export function ProgressBar({ value, showLabel = true, size = 'medium' }: ProgressBarProps) {
  const color = getProgressColor(value);
  const heights = { small: '4px', medium: '8px', large: '12px' };

  return (
    <div className="Polaris-ProgressBar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          flex: 1,
          height: heights[size],
          backgroundColor: '#dfe3e8',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(value, 100)}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: '4px',
            transition: 'width 0.4s ease',
            animation: 'progressFill 0.6s ease-out',
          }}
        />
      </div>
      {showLabel && (
        <span style={{ fontSize: '1.2rem', color: '#637381', minWidth: '36px', textAlign: 'right' }}>
          {value}%
        </span>
      )}
    </div>
  );
}
