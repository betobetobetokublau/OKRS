'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/common/user-avatar';
import { formatDate, isOverdue } from '@/lib/utils/dates';
import { BlockReasonDialog } from './block-reason-dialog';
import type { Task, TaskStatus } from '@/types';

interface TaskRowProps {
  task: Task;
  onUpdated: () => void;
  showObjective?: boolean;
}

export function TaskRow({ task, onUpdated, showObjective }: TaskRowProps) {
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const overdue = isOverdue(task.due_date) && task.status !== 'completed';

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

        {/* Task info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                fontSize: '1.3rem',
                fontWeight: 500,
                color: task.status === 'completed' ? '#637381' : '#212b36',
                textDecoration: task.status === 'completed' ? 'line-through' : 'none',
              }}
            >
              {task.title}
            </span>
            {overdue && (
              <span style={{ fontSize: '1.1rem', color: '#de3618', fontWeight: 500 }}>Vencida</span>
            )}
          </div>
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
