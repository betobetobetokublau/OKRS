'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface TaskNodeData {
  label: string;
  status: string;
  color: string;
}

const STATUS_CONFIG: Record<string, { icon: string; bg: string }> = {
  pending: { icon: '\u25CB', bg: '#637381' },
  in_progress: { icon: '\u25B6', bg: '#006fbb' },
  completed: { icon: '\u2713', bg: '#50b83c' },
  blocked: { icon: '\u26A0', bg: '#de3618' },
};

export const TaskNode = memo(function TaskNode({ data }: { data: TaskNodeData }) {
  const config = STATUS_CONFIG[data.status] || STATUS_CONFIG.pending;
  const isComplete = data.status === 'completed';

  return (
    <div
      className={isComplete ? 'glow-completed' : ''}
      style={{
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        backgroundColor: isComplete ? config.bg + '30' : '#353b7a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: 'pointer',
        border: `2px solid ${config.bg}`,
      }}
    >
      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <div style={{ fontSize: '1.2rem' }}>{config.icon}</div>
        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.8)', lineHeight: '1.1', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, maxWidth: '50px' }}>
          {data.label}
        </div>
      </div>

      <Handle type="target" position={Position.Top} style={{ background: config.bg, width: '5px', height: '5px', border: 'none' }} />
    </div>
  );
});
