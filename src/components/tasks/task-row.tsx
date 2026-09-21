'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/common/user-avatar';
import { formatDate, isOverdue } from '@/lib/utils/dates';
import { BlockReasonDialog } from './block-reason-dialog';
import { PRIORITY_CHIPS } from './priority';
import type { Task, TaskStatus } from '@/types';

interface TaskRowProps {
  task: Task;
  onUpdated: () => void;
  showObjective?: boolean;
  /** When provided the title becomes a button (used to open the detail panel). */
  onOpen?: () => void;
}

export function TaskRow({ task, onUpdated, showObjective, onOpen }: TaskRowProps) {
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const overdue = isOverdue(task.due_date) && task.status !== 'completed';
  const priority = task.priority ? PRIORITY_CHIPS[task.priority] : null;
  const titleStyle: React.CSSProperties = {
    fontSize: '1.3rem',
    fontWeight: 500,
    color: task.status === 'completed' ? '#637381' : '#212b36',
    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
  };

  async function handleStatusChange(newStatus: TaskStatus) {
    if (newStatus === 'blocked') {
      setShowBlockDialog(true);
      return;
    }

    const supabase = createClient();
    const updates: Record<string, unknown> = { status: newStatus };
    if ((task.status as string) === 'blocked') {
      updates.block_reason = null;
    }
    await supabase.from('tasks').update(updates).eq('id', task.id);
    onUpdated();
  }

  async function handleBlock(reason: string) {
    const supabase = createClient();
    await supabase.from('tasks').update({ status: 'blocked', block_reason: reason }).eq('id', task.id);
    setShowBlockDialog(false);
    onUpdated();
  }

  return (
    <>
      <div
        className="m-wrap"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.2rem',
          padding: '1rem 1.2rem',
          borderRadius: '6px',
          backgroundColor: task.status === 'blocked' ? '#fef3f0' : task.status === 'completed' ? '#f1f8ee' : '#f9fafb',
          border: overdue ? '1px solid #de3618' : '1px solid transparent',
        }}
      >
        {/* Status selector */}
        <select
          value={task.status}
          onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
          style={{
            padding: '0.3rem 0.4rem',
            fontSize: '1.2rem',
            border: '1px solid #c4cdd5',
            borderRadius: '4px',
            backgroundColor: 'white',
            cursor: 'pointer',
          }}
        >
          <option value="pending">Pendiente</option>
          <option value="in_progress">En progreso</option>
          <option value="completed">Completada</option>
          <option value="blocked">Bloqueada</option>
        </select>

        {/* Task info — on phones it takes the whole first line (.m-row100). */}
        <div className="m-row100" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                style={{
                  ...titleStyle,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  fontSize: '1.3rem',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#5c6ac4'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = titleStyle.color as string; }}
              >
                {task.title}
              </button>
            ) : (
              <span style={titleStyle}>{task.title}</span>
            )}
            {priority && (
              <span
                title={`Prioridad ${priority.label.toLowerCase()}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '2px 8px',
                  borderRadius: '5px',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  backgroundColor: priority.bg,
                  color: priority.fg,
                  whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden style={{ fontSize: '0.9rem' }}>{priority.glyph}</span>
                {priority.label}
              </span>
            )}
            {overdue && (
              <span style={{ fontSize: '1.1rem', color: '#de3618', fontWeight: 500 }}>Vencida</span>
            )}
          </div>
          {task.parent && <ParentHint title={task.parent.title} />}
          {showObjective && task.objective && (
            <span style={{ fontSize: '1.1rem', color: '#637381' }}>
              Objetivo: {task.objective.title}
            </span>
          )}
          {task.status === 'blocked' && task.block_reason && (
            <p style={{ fontSize: '1.2rem', color: '#bf0711', marginTop: '0.2rem' }}>
              Motivo: {task.block_reason}
            </p>
          )}
        </div>

        {/* Due date */}
        {task.due_date && (
          <span style={{ fontSize: '1.2rem', color: overdue ? '#de3618' : '#637381' }}>
            {formatDate(task.due_date)}
          </span>
        )}

        {/* Assigned user */}
        {task.assigned_user && (
          <UserAvatar user={task.assigned_user} size="small" />
        )}
      </div>

      {showBlockDialog && (
        <BlockReasonDialog
          onConfirm={handleBlock}
          onCancel={() => setShowBlockDialog(false)}
        />
      )}
    </>
  );
}

/** Muted one-line "↳ Parent title" shown on subtask rows / cards. */
export function ParentHint({ title, size = '1.1rem' }: { title: string; size?: string }) {
  return (
    <span
      title={`Subtarea de: ${title}`}
      style={{
        display: 'block',
        fontSize: size,
        color: '#919eab',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden>↳ </span>
      {title}
    </span>
  );
}
