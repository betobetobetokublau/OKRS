'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface KPINodeData {
  label: string;
  progress: number;
  color: string;
}

export const KPINode = memo(function KPINode({ data }: { data: KPINodeData }) {
  const isComplete = data.progress >= 100;
  const circumference = 2 * Math.PI * 38;
  const strokeDashoffset = circumference - (data.progress / 100) * circumference;

  return (
    <div
      className={isComplete ? 'glow-completed' : ''}
      style={{
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        backgroundColor: '#1c2260',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: 'pointer',
        border: `3px solid ${data.color}`,
      }}
    >
      {/* Progress ring */}
      <svg width="100" height="100" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
        <circle
          cx="50" cy="50" r="38" fill="none"
          stroke={data.color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>

      <div style={{ textAlign: 'center', zIndex: 1, padding: '0 8px' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{data.progress}%</div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
          {data.label}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: '8px', height: '8px', border: 'none' }} />
    </div>
  );
});
