'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface ObjectiveNodeData {
  label: string;
  progress: number;
  status: string;
  color: string;
}

const STATUS_ICONS: Record<string, string> = {
  in_progress: '\u25B6',
  paused: '\u23F8',
  deprecated: '\u2715',
  upcoming: '\u25CB',
};

export const ObjectiveNode = memo(function ObjectiveNode({ data }: { data: ObjectiveNodeData }) {
  const isComplete = data.progress >= 100;
  const fillHeight = Math.min(data.progress, 100);

  return (
    <div
      className={isComplete ? 'glow-completed' : ''}
      style={{
        width: '80px',
        height: '80px',
        borderRadius: '12px',
        backgroundColor: '#2a2f6e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: 'pointer',
        border: `2px solid ${data.color}`,
        overflow: 'hidden',
      }}
    >
      {/* Fill from bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${fillHeight}%`,
          backgroundColor: data.color + '40',
          transition: 'height 0.5s ease',
        }}
      />

      <div style={{ textAlign: 'center', zIndex: 1, padding: '0 6px' }}>
        <div style={{ fontSize: '1.1rem', marginBottom: '2px' }}>{STATUS_ICONS[data.status] || '\u25CB'}</div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.9)', lineHeight: '1.1', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
          {data.label}
        </div>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'white', marginTop: '2px' }}>{data.progress}%</div>
      </div>

      <Handle type="target" position={Position.Top} style={{ background: data.color, width: '6px', height: '6px', border: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: '6px', height: '6px', border: 'none' }} />
    </div>
  );
});
