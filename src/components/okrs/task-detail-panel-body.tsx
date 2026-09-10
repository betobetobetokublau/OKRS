'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { UserAvatar } from '@/components/common/user-avatar';
import { isOverdue } from '@/lib/utils/dates';
import { InlineStatusSelect } from './inline-status-select';
import { InlinePrioritySelect } from './inline-priority-select';
import { InlineUserSelect } from './inline-user-select';
import { TaskForm } from '@/components/tasks/task-form';
import { TaskBoardsBlock } from '@/components/tasks/task-boards-block';
import { SubtasksSection } from '@/components/tasks/subtasks-section';
import { TaskComments } from '@/components/tasks/task-comments';
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

const TASK_SELECT =
  '*, assigned_user:profiles!tasks_assigned_user_id_fkey(*), objective:objectives!tasks_objective_id_fkey(*)';

/**
 * Task detail in Asana-style layout. Breadcrumb is the parent objective (or
 * "Sin objetivo" for backlog / board-only tasks).
 */
export function TaskDetailPanelBody({ taskId, canEdit, onChanged }: TaskDetailPanelBodyProps) {
  const slug = useWorkspaceStore((s) => s.currentWorkspace?.slug);
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: t } = await supabase.from('tasks').select(TASK_SELECT).eq('id', taskId).single();
    if (t) {
      const row = t as Task & { objective?: Objective | Objective[] | null };
      // Defensive: some client versions flatten the embedded row into an array.
      const objective = Array.isArray(row.objective) ? row.objective[0] ?? null : row.objective ?? null;
      setTask({ ...row, objective });
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !task) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando tarea...</div>;
  }

  const objective = task.objective ?? null;
  const workspaceId = task.workspace_id;
  const overdue = isOverdue(task.due_date) && task.status !== 'completed';

  async function handleDelete() {
    if (!task) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from('tasks').delete().eq('id', task.id);
    onChanged();
  }

  function refresh() {
    load();
    onChanged();
  }

  const breadcrumb: BreadcrumbItem[] = objective
    ? [{ label: `Objetivo: ${objective.title}`, href: slug ? `/${slug}/objetivos/${objective.id}` : undefined }]
    : [{ label: 'Sin objetivo' }];

  const fields: FieldRow[] = [
    {
      label: 'Asignada a',
      value: canEdit ? (
        <InlineUserSelect
          entity="task"
          id={task.id}
          workspaceId={workspaceId}
          currentUserId={task.assigned_user_id}
          currentUser={task.assigned_user ?? null}
          canEdit
          onChanged={refresh}
        />
      ) : task.assigned_user ? (
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
        <InlineStatusSelect entity="task" id={task.id} currentStatus={task.status} canEdit={canEdit} onChanged={refresh} />
      ),
    },
    {
      label: 'Prioridad',
      value: <InlinePrioritySelect id={task.id} currentPriority={task.priority} canEdit={canEdit} onChanged={refresh} />,
    },
  ];

  if (objective) {
    fields.push({
      label: 'Objetivo',
      value: slug ? (
        <Link href={`/${slug}/objetivos/${objective.id}`} style={{ color: '#5c6ac4', fontWeight: 500, textDecoration: 'none' }}>
          {objective.title}
        </Link>
      ) : (
        <span style={{ color: '#5c6ac4', fontWeight: 500 }}>{objective.title}</span>
      ),
    });
  }

  fields.push({
    label: 'Tableros',
    value: <TaskBoardsBlock task={task} canEdit={canEdit} onChanged={onChanged} />,
  });

  const openHref = slug ? `/${slug}/tareas/${task.id}` : null;

  return (
    <>
      <AsanaDetailShell
        breadcrumb={breadcrumb}
        title={task.title}
        titleAfter={
          openHref ? (
            <div>
              <Link
                href={openHref}
                title="Abrir en página completa"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 1rem',
                  fontSize: '1.2rem',
                  fontWeight: 500,
                  color: '#5c6ac4',
                  backgroundColor: '#f4f5fc',
                  border: '1px solid #e3e5f1',
                  borderRadius: '4px',
                  textDecoration: 'none',
                }}
              >
                <span aria-hidden>⤢</span> Abrir
              </Link>
            </div>
          ) : undefined
        }
        onEdit={canEdit ? () => setShowEditForm(true) : undefined}
        onDelete={canEdit ? handleDelete : undefined}
        deleting={deleting}
        fields={fields}
      >
        {task.status === 'blocked' && task.block_reason && (
          <AsanaSection title="Motivo del bloqueo">
            <p style={{ fontSize: '1.3rem', color: '#bf0711', margin: 0, lineHeight: 1.5 }}>{task.block_reason}</p>
          </AsanaSection>
        )}

        {task.description && (
          <AsanaSection title="Descripción">
            <p style={{ color: '#212b36', fontSize: '1.4rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{task.description}</p>
          </AsanaSection>
        )}

        <SubtasksSection parentTask={task} canEdit={canEdit} onChanged={onChanged} />

        <TaskComments taskId={task.id} workspaceId={workspaceId} />
      </AsanaDetailShell>

      {showEditForm && (
        <TaskForm
          objectiveId={task.objective_id ?? undefined}
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
            priority: task.priority,
          }}
        />
      )}
    </>
  );
}
