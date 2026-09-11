'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { isOverdue } from '@/lib/utils/dates';
import { PARENT_EMBED, decoupleTask, fetchTaskAncestors, type TaskAncestor } from '@/hooks/use-tasks';
import { InlineStatusSelect } from './inline-status-select';
import { InlinePrioritySelect } from './inline-priority-select';
import { InlineUserSelect } from './inline-user-select';
import { InlineTextEdit } from './inline-text-edit';
import { InlineDateSelect } from './inline-date-select';
import { InlineObjectiveSelect } from './inline-objective-select';
import { TaskBoardsBlock } from '@/components/tasks/task-boards-block';
import { SubtasksSection } from '@/components/tasks/subtasks-section';
import { TaskComments } from '@/components/tasks/task-comments';
import {
  AsanaDetailShell,
  AsanaSection,
  type FieldRow,
  type BreadcrumbItem,
} from './asana-detail-shell';
import type { Task, Objective } from '@/types';

interface TaskDetailPanelBodyProps {
  taskId: string;
  /** Gates destructive / structural actions (Eliminar, Convertir en independiente) — every field is inline-editable for all roles. */
  canEdit: boolean;
  onChanged: () => void;
  /**
   * Open another task in place of this one (a subtask row, or an ancestor in
   * the breadcrumb). The hosting panel pushes it on its navigation stack.
   * When omitted, ancestors fall back to plain links.
   */
  onOpenTask?: (id: string) => void;
}

const TASK_SELECT = `*, assigned_user:profiles!tasks_assigned_user_id_fkey(*), objective:objectives!tasks_objective_id_fkey(*), ${PARENT_EMBED}`;

/**
 * Task detail in Asana-style layout. Breadcrumb is the ancestor chain (for
 * subtasks) followed by the parent objective (or "Sin objetivo" for backlog /
 * board-only tasks). There is no edit mode: every field saves inline on click.
 */
export function TaskDetailPanelBody({ taskId, canEdit, onChanged, onOpenTask }: TaskDetailPanelBodyProps) {
  const slug = useWorkspaceStore((s) => s.currentWorkspace?.slug);
  const activePeriodId = useWorkspaceStore((s) => s.activePeriod?.id);
  const [task, setTask] = useState<Task | null>(null);
  const [ancestors, setAncestors] = useState<TaskAncestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [decoupling, setDecoupling] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: t } = await supabase.from('tasks').select(TASK_SELECT).eq('id', taskId).single();
    if (t) {
      const row = t as Task & { objective?: Objective | Objective[] | null };
      // Defensive: some client versions flatten the embedded row into an array.
      const objective = Array.isArray(row.objective) ? row.objective[0] ?? null : row.objective ?? null;
      const chain = await fetchTaskAncestors(row.parent_task_id);
      setTask({ ...row, objective });
      setAncestors(chain);
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

  async function handleDecouple() {
    if (!task || decoupling) return;
    setDecoupling(true);
    const { error } = await decoupleTask(task.id);
    setDecoupling(false);
    if (!error) refresh();
  }

  // Ancestors (root first) › this task › objective. Top-level tasks keep the
  // objective-only breadcrumb.
  const ancestorItems: BreadcrumbItem[] = ancestors.map((a) => ({
    label: a.title,
    href: slug ? `/${slug}/tareas/${a.id}` : undefined,
    onClick: onOpenTask ? () => onOpenTask(a.id) : undefined,
  }));
  const objectiveItem: BreadcrumbItem = objective
    ? { label: `Objetivo: ${objective.title}`, href: slug ? `/${slug}/objetivos/${objective.id}` : undefined }
    : { label: 'Sin objetivo' };
  const breadcrumb: BreadcrumbItem[] =
    ancestorItems.length > 0 ? [...ancestorItems, { label: task.title }, objectiveItem] : [objectiveItem];

  const fields: FieldRow[] = [
    {
      label: 'Asignada a',
      value: (
        <InlineUserSelect
          entity="task"
          id={task.id}
          workspaceId={workspaceId}
          currentUserId={task.assigned_user_id}
          currentUser={task.assigned_user ?? null}
          canEdit
          onChanged={refresh}
        />
      ),
    },
    {
      label: 'Fecha límite',
      value: <InlineDateSelect id={task.id} iso={task.due_date} overdue={overdue} onChanged={refresh} />,
    },
    {
      label: 'Estado',
      value: <InlineStatusSelect entity="task" id={task.id} currentStatus={task.status} canEdit onChanged={refresh} />,
    },
    {
      label: 'Prioridad',
      value: <InlinePrioritySelect id={task.id} currentPriority={task.priority} canEdit onChanged={refresh} />,
    },
    {
      label: 'Objetivo',
      value: (
        <InlineObjectiveSelect
          id={task.id}
          workspaceId={workspaceId}
          periodId={activePeriodId}
          currentObjective={objective}
          slug={slug}
          onChanged={refresh}
        />
      ),
    },
    {
      label: 'Tableros',
      value: <TaskBoardsBlock task={task} canEdit onChanged={onChanged} />,
    },
  ];

  const openHref = slug ? `/${slug}/tareas/${task.id}` : null;

  return (
    <AsanaDetailShell
      breadcrumb={breadcrumb}
      title={<InlineTextEdit id={task.id} mode="title" value={task.title} onChanged={refresh} />}
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
      actions={
        canEdit && task.parent_task_id ? (
          <DecoupleConfirmButton onConfirm={handleDecouple} busy={decoupling} />
        ) : undefined
      }
      onDelete={canEdit ? handleDelete : undefined}
      deleting={deleting}
      fields={fields}
    >
      {task.status === 'blocked' && task.block_reason && (
        <AsanaSection title="Motivo del bloqueo">
          <p style={{ fontSize: '1.3rem', color: '#bf0711', margin: 0, lineHeight: 1.5 }}>{task.block_reason}</p>
        </AsanaSection>
      )}

      <AsanaSection title="Descripción">
        <InlineTextEdit
          id={task.id}
          mode="description"
          value={task.description}
          placeholder="Agrega una descripción…"
          onChanged={refresh}
        />
      </AsanaSection>

      <SubtasksSection parentTask={task} canEdit onChanged={onChanged} onOpen={onOpenTask} />

      <TaskComments taskId={task.id} workspaceId={workspaceId} />
    </AsanaDetailShell>
  );
}

/**
 * Two-step "Convertir en tarea independiente" (arm → confirm within 3 s),
 * secondary style so it reads as structural rather than destructive.
 */
export function DecoupleConfirmButton({ onConfirm, busy }: { onConfirm: () => void; busy?: boolean }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const label = busy ? 'Convirtiendo...' : armed ? 'Confirmar: será independiente' : 'Convertir en tarea independiente';

  return (
    <button
      type="button"
      title="Quita esta tarea de su tarea padre; sus propias subtareas se conservan"
      onClick={() => {
        if (busy) return;
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      disabled={busy}
      style={{
        padding: '0.6rem 1.4rem',
        fontSize: '1.3rem',
        fontWeight: 500,
        color: armed ? 'white' : '#5c6ac4',
        backgroundColor: armed ? '#5c6ac4' : '#f4f5fc',
        border: `1px solid ${armed ? '#5c6ac4' : '#e3e5f1'}`,
        borderRadius: '4px',
        cursor: busy ? 'not-allowed' : 'pointer',
        opacity: busy ? 0.6 : 1,
        transition: 'all 150ms',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
