'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/common/user-avatar';
import { formatDate, isOverdue } from '@/lib/utils/dates';
import { InlineStatusSelect } from './inline-status-select';
import type { Task, Objective } from '@/types';

interface TaskDetailPanelBodyProps {
  taskId: string;
  canEdit: boolean;
  onChanged: () => void;
}

/**
 * Single-object detail body for a task. No standalone detail page exists;
 * this consolidates the same information shown inline in TaskRow + a link
 * to the parent objective.
 */
export function TaskDetailPanelBody({ taskId, canEdit, onChanged }: TaskDetailPanelBodyProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [objective, setObjective] = useState<Objective | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: t } = await supabase
      .from('tasks')
      .select('*, assigned_user:profiles!tasks_assigned_user_id_fkey(*)')
      .eq('id', taskId)
      .single();

    if (t) {
      setTask(t as Task);
      const { data: o } = await supabase
        .from('objectives')
        .select('*')
        .eq('id', (t as Task).objective_id)
        .single();
      if (o) setObjective(o as Objective);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !task) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando tarea...</div>;
  }

  const overdue = isOverdue(task.due_date) && task.status !== 'completed';

  function refresh() {
    load();
    onChanged();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 600, color: '#212b36', lineHeight: 1.3, marginBottom: '0.8rem' }}>
          {task.title}
        </h1>
        <InlineStatusSelect
          entity="task"
          id={task.id}
          currentStatus={task.status}
          canEdit={canEdit}
          onChanged={refresh}
        />
        {task.description && (
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.8rem', lineHeight: 1.6 }}>
            {task.description}
          </p>
        )}
      </div>

      {/* Block reason */}
      {task.status === 'blocked' && task.block_reason && (
        <div className="Polaris-Card" style={{ padding: '1.2rem 1.6rem', borderRadius: '8px', border: '1px solid #fde3df', backgroundColor: '#fef3f0' }}>
          <p style={{ fontSize: '1.2rem', color: '#8a2a2a', marginBottom: '0.2rem', fontWeight: 600 }}>Motivo del bloqueo</p>
          <p style={{ fontSize: '1.3rem', color: '#bf0711' }}>{task.block_reason}</p>
        </div>
      )}

      {/* Details */}
      <div className="Polaris-Card" style={{ padding: '1.6rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>Detalles</h3>

        {task.assigned_user && (
          <div style={{ marginBottom: '1.2rem' }}>
            <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Asignada a</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <UserAvatar user={task.assigned_user} size="small" />
              <span style={{ fontSize: '1.3rem', color: '#212b36' }}>{task.assigned_user.full_name}</span>
            </div>
          </div>
        )}

        {task.due_date && (
          <div style={{ marginBottom: '1.2rem' }}>
            <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Fecha límite</p>
            <span style={{ fontSize: '1.3rem', color: overdue ? '#de3618' : '#212b36', fontWeight: overdue ? 600 : 400 }}>
              {formatDate(task.due_date)}
              {overdue && <span style={{ marginLeft: '0.6rem', fontSize: '1.1rem' }}>— Vencida</span>}
            </span>
          </div>
        )}

        {objective && (
          <div>
            <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Objetivo</p>
            <span style={{ fontSize: '1.3rem', color: '#212b36' }}>{objective.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}
