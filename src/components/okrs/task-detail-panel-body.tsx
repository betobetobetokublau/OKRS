'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/common/user-avatar';
import { isOverdue } from '@/lib/utils/dates';
import { InlineStatusSelect } from './inline-status-select';
import { TaskForm } from '@/components/tasks/task-form';
import {
  AsanaDetailShell,
  AsanaSection,
  AsanaEmpty,
  AsanaDueDateValue,
  type FieldRow,
  type BreadcrumbItem,
} from './asana-detail-shell';
import type { Task, Objective } from '@/types';

interface TaskDetailPanelBodyProps {
  taskId: string;
  canEdit: boolean;
  onChanged: () => void;
}

/**
 * Task detail in Asana-style layout. Breadcrumb is the parent objective.
 */
export function TaskDetailPanelBody({ taskId, canEdit, onChanged }: TaskDetailPanelBodyProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [objective, setObjective] = useState<Objective | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>('');

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
      if (o) {
        setObjective(o as Objective);
        setWorkspaceId((o as Objective).workspace_id);
      }
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

  const breadcrumb: BreadcrumbItem[] = objective
    ? [{ label: `Objetivo: ${objective.title}` }]
    : [{ label: 'Sin objetivo padre' }];

  const fields: FieldRow[] = [
    {
      label: 'Asignada a',
      value: task.assigned_user ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
          <UserAvatar user={task.assigned_user} size="small" />
          <span>{task.assigned_user.full_name}</span>
        </span>
      ) : (
        <AsanaEmpty />
      ),
    },
    {
      label: 'Fecha límite',
      value: <AsanaDueDateValue iso={task.due_date} overdue={overdue} />,
    },
    {
      label: 'Estado',
      value: (
        <InlineStatusSelect
          entity="task"
          id={task.id}
          currentStatus={task.status}
          canEdit={canEdit}
          onChanged={refresh}
        />
      ),
    },
  ];

  if (objective) {
    fields.push({
      label: 'Objetivo',
      value: <span style={{ color: '#5c6ac4', fontWeight: 500 }}>{objective.title}</span>,
    });
  }

  return (
    <>
      <AsanaDetailShell
        breadcrumb={breadcrumb}
        title={task.title}
        onEdit={canEdit && workspaceId ? () => setShowEditForm(true) : undefined}
        fields={fields}
      >
        {/* Block reason (when blocked) */}
        {task.status === 'blocked' && task.block_reason && (
          <AsanaSection title="Motivo del bloqueo">
            <p style={{ fontSize: '1.3rem', color: '#bf0711', margin: 0, lineHeight: 1.5 }}>{task.block_reason}</p>
          </AsanaSection>
        )}

        {/* Description */}
        {task.description && (
          <AsanaSection title="Descripción">
            <p style={{ color: '#212b36', fontSize: '1.4rem', lineHeight: 1.6, margin: 0 }}>{task.description}</p>
          </AsanaSection>
        )}
      </AsanaDetailShell>

      {showEditForm && workspaceId && (
        <TaskForm
          objectiveId={task.objective_id}
          workspaceId={workspaceId}
          onClose={() => setShowEditForm(false)}
          onSaved={() => {
            setShowEditForm(false);
            refresh();
          }}
          initialData={{
            id: task.id,
            title: task.title,
            description: task.description ?? '',
            assigned_user_id: task.assigned_user_id,
            due_date: task.due_date,
          }}
        />
      )}
    </>
  );
}
