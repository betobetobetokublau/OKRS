'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { canManageContent } from '@/lib/utils/permissions';
import { fetchTaskBoards } from '@/hooks/use-boards';
import { formatRelative } from '@/lib/utils/dates';
import { isOverdue } from '@/lib/utils/dates';
import { UserAvatar } from '@/components/common/user-avatar';
import { InlineStatusSelect } from '@/components/okrs/inline-status-select';
import { InlinePrioritySelect } from '@/components/okrs/inline-priority-select';
import { InlineUserSelect } from '@/components/okrs/inline-user-select';
import { AsanaDueDateValue, AsanaEmpty } from '@/components/okrs/asana-detail-shell';
import { TaskBoardsBlock } from '@/components/tasks/task-boards-block';
import { SubtasksSection } from '@/components/tasks/subtasks-section';
import { TaskComments } from '@/components/tasks/task-comments';
import { TaskForm } from '@/components/tasks/task-form';
import type { BoardTask, Objective, Profile, Task } from '@/types';

const TASK_SELECT =
  '*, assigned_user:profiles!tasks_assigned_user_id_fkey(*), objective:objectives!tasks_objective_id_fkey(*)';

type LoadedTask = Task & { creator?: Profile | null };

/**
 * Full-page task view (`/{workspace}/tareas/[id]`). Two columns: content on
 * the left (title, description, subtasks, comments/activity) and a sticky
 * properties card on the right with quick actions.
 */
export default function TaskPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const { currentWorkspace, userWorkspace } = useWorkspaceStore();
  const slug = currentWorkspace?.slug ?? (params['workspace-slug'] as string | undefined) ?? '';
  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));

  const [task, setTask] = useState<LoadedTask | null>(null);
  const [placements, setPlacements] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<'duplicate' | 'delete' | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, boards] = await Promise.all([
      supabase.from('tasks').select(TASK_SELECT).eq('id', taskId).single(),
      fetchTaskBoards(taskId),
    ]);
    if (!t) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const row = t as Task & { objective?: Objective | Objective[] | null };
    const objective = Array.isArray(row.objective) ? row.objective[0] ?? null : row.objective ?? null;
    let creator: Profile | null = null;
    if (row.created_by) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', row.created_by).maybeSingle();
      creator = (p as Profile | null) ?? null;
    }
    setTask({ ...row, objective, creator });
    setPlacements(boards);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!deleteArmed) return;
    const t = setTimeout(() => setDeleteArmed(false), 3000);
    return () => clearTimeout(t);
  }, [deleteArmed]);

  function refresh() {
    load();
    setRefreshKey((k) => k + 1);
  }

  async function handleDuplicate() {
    if (!task || actionBusy) return;
    setActionBusy('duplicate');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: `Copia de ${task.title}`,
        description: task.description,
        status: task.status === 'completed' ? 'pending' : task.status,
        priority: task.priority,
        assigned_user_id: task.assigned_user_id,
        due_date: task.due_date,
        objective_id: task.objective_id,
        workspace_id: task.workspace_id,
        parent_task_id: task.parent_task_id,
        block_reason: task.status === 'blocked' ? task.block_reason : null,
      })
      .select('id')
      .single();
    setActionBusy(null);
    if (error || !data) {
      setToast('No se pudo duplicar la tarea.');
      return;
    }
    router.push(`/${slug}/tareas/${(data as { id: string }).id}`);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast('Enlace copiado');
    } catch {
      setToast('No se pudo copiar el enlace');
    }
  }

  async function handleDelete() {
    if (!task || actionBusy) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setActionBusy('delete');
    const supabase = createClient();
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      setActionBusy(null);
      setDeleteArmed(false);
      setToast('No se pudo eliminar la tarea.');
      return;
    }
    router.push(`/${slug}/mis-tareas`);
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#637381', fontSize: '1.4rem' }}>Cargando tarea...</div>;
  }
  if (notFound || !task) {
    return (
      <div style={{ padding: '2rem', color: '#637381', fontSize: '1.4rem' }}>
        Tarea no encontrada.{' '}
        <Link href={`/${slug}/mis-tareas`} style={{ color: '#5c6ac4' }}>Volver a Mis tareas</Link>
      </div>
    );
  }

  const objective = task.objective ?? null;
  const firstPlacement = placements[0];
  const overdue = isOverdue(task.due_date) && task.status !== 'completed';
  const shortId = `#T-${task.id.slice(0, 6).toUpperCase()}`;

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white',
    border: '1px solid #dfe3e8',
    borderRadius: '8px',
    padding: '2rem',
  };

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <nav aria-label="Ubicación" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.8rem', fontSize: '1.3rem', color: '#637381', marginBottom: '1.6rem' }}>
        {firstPlacement?.board ? (
          <>
            <Link href={`/${slug}/tableros`} style={{ color: '#637381', textDecoration: 'none' }}>Tableros</Link>
            <span style={{ color: '#c4cdd5' }}>›</span>
            <Link href={`/${slug}/tableros/${firstPlacement.board_id}`} style={{ color: '#637381', textDecoration: 'none' }}>
              {firstPlacement.board.name}
            </Link>
            {firstPlacement.section && (
              <>
                <span style={{ color: '#c4cdd5' }}>›</span>
                <span>{firstPlacement.section.name}</span>
              </>
            )}
          </>
        ) : objective ? (
          <Link href={`/${slug}/objetivos/${objective.id}`} style={{ color: '#637381', textDecoration: 'none' }}>
            Objetivo: {objective.title}
          </Link>
        ) : (
          <span>Sin objetivo</span>
        )}
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '2rem', alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minWidth: 0 }}>
          <div style={cardStyle}>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36', lineHeight: 1.25, margin: 0, letterSpacing: '-0.01em' }}>
              {task.title}
            </h1>
            <p style={{ fontSize: '1.2rem', color: '#919eab', margin: '0.8rem 0 0', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{shortId}</span>
              <span>·</span>
              <span>
                creada{task.creator ? ` por ${task.creator.full_name}` : ''} {formatRelative(task.created_at)}
              </span>
              {task.updated_at !== task.created_at && (
                <>
                  <span>·</span>
                  <span>actualizada {formatRelative(task.updated_at)}</span>
                </>
              )}
            </p>

            {task.status === 'blocked' && task.block_reason && (
              <div style={{ marginTop: '1.6rem', padding: '1rem 1.2rem', backgroundColor: '#fbeae5', borderRadius: '6px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#bf0711', marginBottom: '0.2rem' }}>Motivo del bloqueo</div>
                <p style={{ fontSize: '1.3rem', color: '#bf0711', margin: 0, lineHeight: 1.5 }}>{task.block_reason}</p>
              </div>
            )}

            <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36', margin: '2rem 0 0.8rem' }}>Descripción</h2>
            {task.description ? (
              <p style={{ color: '#212b36', fontSize: '1.4rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{task.description}</p>
            ) : (
              <p style={{ color: '#919eab', fontSize: '1.3rem', margin: 0 }}>Sin descripción.</p>
            )}
          </div>

          <SubtasksSection key={`sub-${refreshKey}`} parentTask={task} canEdit={canEdit} onChanged={() => load()} />

          <TaskComments key={`com-${refreshKey}`} taskId={task.id} workspaceId={task.workspace_id} />
        </div>

        {/* Right column (sticky) */}
        <aside style={{ position: 'sticky', top: '2rem', display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          <div style={{ ...cardStyle, padding: '1.6rem' }}>
            <PropertyRow label="Estado">
              <InlineStatusSelect entity="task" id={task.id} currentStatus={task.status} canEdit={canEdit} onChanged={refresh} />
            </PropertyRow>
            <PropertyRow label="Prioridad">
              <InlinePrioritySelect id={task.id} currentPriority={task.priority} canEdit={canEdit} onChanged={refresh} />
            </PropertyRow>
            <PropertyRow label="Asignada a">
              {canEdit ? (
                <InlineUserSelect
                  entity="task"
                  id={task.id}
                  workspaceId={task.workspace_id}
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
              )}
            </PropertyRow>
            <PropertyRow label="Fecha límite">
              <AsanaDueDateValue iso={task.due_date} overdue={overdue} />
            </PropertyRow>
            <PropertyRow label="Objetivo">
              {objective ? (
                <Link href={`/${slug}/objetivos/${objective.id}`} style={{ color: '#5c6ac4', fontWeight: 500, textDecoration: 'none' }}>
                  {objective.title}
                </Link>
              ) : (
                <AsanaEmpty>Sin objetivo</AsanaEmpty>
              )}
            </PropertyRow>
            <PropertyRow label="Tableros" last>
              <TaskBoardsBlock key={`boards-${refreshKey}`} task={task} canEdit={canEdit} onChanged={() => load()} />
            </PropertyRow>
          </div>

          {canEdit && (
            <div style={{ ...cardStyle, padding: '1.2rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <ActionButton onClick={() => setShowEditForm(true)}>Editar</ActionButton>
              <ActionButton onClick={handleDuplicate} disabled={actionBusy !== null}>
                {actionBusy === 'duplicate' ? 'Duplicando...' : 'Duplicar'}
              </ActionButton>
              <ActionButton onClick={handleCopyLink}>Copiar enlace</ActionButton>
              <ActionButton onClick={handleDelete} disabled={actionBusy !== null} danger={deleteArmed}>
                {actionBusy === 'delete' ? 'Eliminando...' : deleteArmed ? 'Confirmar eliminación' : 'Eliminar'}
              </ActionButton>
            </div>
          )}
          {!canEdit && (
            <div style={{ ...cardStyle, padding: '1.2rem 1.6rem' }}>
              <ActionButton onClick={handleCopyLink}>Copiar enlace</ActionButton>
            </div>
          )}
        </aside>
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '2.4rem',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.8rem 1.6rem',
            backgroundColor: '#212b36',
            color: 'white',
            fontSize: '1.3rem',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(33,43,54,0.2)',
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}

      {showEditForm && (
        <TaskForm
          objectiveId={task.objective_id ?? undefined}
          workspaceId={task.workspace_id}
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
    </div>
  );
}

function PropertyRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ padding: '1rem 0', borderBottom: last ? 'none' : '1px solid #f4f6f8' }}>
      <div style={{ fontSize: '1.2rem', color: '#637381', fontWeight: 500, marginBottom: '0.6rem' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', color: '#212b36', minWidth: 0 }}>{children}</div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: 'left',
        padding: '0.7rem 0.8rem',
        fontSize: '1.3rem',
        fontWeight: 500,
        color: danger ? 'white' : '#212b36',
        backgroundColor: danger ? '#bf0711' : 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background-color 120ms',
      }}
      onMouseEnter={(e) => {
        if (!danger) e.currentTarget.style.backgroundColor = '#f4f6f8';
      }}
      onMouseLeave={(e) => {
        if (!danger) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {children}
    </button>
  );
}
