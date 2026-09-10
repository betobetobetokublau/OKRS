'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { createClient } from '@/lib/supabase/client';
import { useBoard, createSection, deleteSection, moveTask, renameSection, reorderCards, reorderSections } from '@/hooks/use-boards';
import { OkrDetailPanel, type PanelTarget } from '@/components/okrs/okr-detail-panel';
import { TaskForm } from '@/components/tasks/task-form';
import { BlockReasonDialog } from '@/components/tasks/block-reason-dialog';
import { BoardKanban, type DropPayload } from '@/components/boards/board-kanban';
import { BoardToolbar } from '@/components/boards/board-toolbar';
import { StandupMode } from '@/components/boards/standup-mode';
import {
  DEFAULT_VIEW,
  applyFilters,
  groupItems,
  isTaskOverdue,
  loadView,
  saveView,
  sortItems,
  type BoardColumn,
  type BoardView,
} from '@/components/boards/board-filters';
import { canManageContent } from '@/lib/utils/permissions';
import type { BoardTask, Department, Profile, TaskStatus } from '@/types';

export default function TableroPage() {
  const params = useParams<{ 'workspace-slug': string; id: string }>();
  const slug = params?.['workspace-slug'] ?? '';
  const boardId = params?.id;
  const { currentWorkspace, activePeriod, userWorkspace, profile } = useWorkspaceStore();
  const { data, loading, error, refetch } = useBoard(boardId);
  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));

  const [members, setMembers] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [view, setView] = useState<BoardView>(DEFAULT_VIEW);
  const [viewLoaded, setViewLoaded] = useState(false);
  /** Optimistic status per task id while the write + refetch are in flight. */
  const [statusOverrides, setStatusOverrides] = useState<Record<string, TaskStatus>>({});
  const [panelTarget, setPanelTarget] = useState<PanelTarget>(null);
  const [taskFormSection, setTaskFormSection] = useState<{ sectionId: string | null } | null>(null);
  const [standup, setStandup] = useState(false);
  const [blockPending, setBlockPending] = useState<{ taskId: string; wasBlocked: boolean } | null>(null);

  // Workspace members (for the "Asignado" pill + grouping by assignee) and departments (for the detail panel).
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [uwRes, deptRes] = await Promise.all([
        supabase.from('user_workspaces').select('profile:profiles(*)').eq('workspace_id', currentWorkspace.id),
        supabase.from('departments').select('*').eq('workspace_id', currentWorkspace.id).order('name', { ascending: true }),
      ]);
      if (cancelled) return;
      const profiles = ((uwRes.data || []) as unknown as Array<{ profile: Profile | null }>)
        .map((r) => r.profile)
        .filter((p): p is Profile => Boolean(p))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));
      setMembers(profiles);
      setDepartments((deptRes.data || []) as Department[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id]);

  // Per-board view persistence.
  useEffect(() => {
    if (!boardId) return;
    setView(loadView(boardId));
    setViewLoaded(true);
  }, [boardId]);
  useEffect(() => {
    if (boardId && viewLoaded) saveView(boardId, view);
  }, [boardId, view, viewLoaded]);

  const refresh = useCallback(async () => {
    await refetch();
    setStatusOverrides({});
  }, [refetch]);

  // ---------- Derived data ----------
  const allItems = useMemo<BoardTask[]>(() => {
    const items = data?.items ?? [];
    return items.map((it) => {
      const override = statusOverrides[it.task_id];
      return override && it.task ? { ...it, task: { ...it.task, status: override } } : it;
    });
  }, [data?.items, statusOverrides]);

  const visibleItems = useMemo(
    () => sortItems(applyFilters(allItems, view.filters, profile?.id), view.sort),
    [allItems, view.filters, view.sort, profile?.id],
  );

  const sections = useMemo(() => data?.sections ?? [], [data?.sections]);
  const columns = useMemo(
    () => groupItems(visibleItems, view.grouping, sections, members),
    [visibleItems, view.grouping, sections, members],
  );

  const overdueCount = allItems.filter(isTaskOverdue).length;

  // ---------- Handlers ----------
  async function handleToggleComplete(item: BoardTask) {
    if (!item.task || !canEdit) return;
    const wasBlocked = item.task.status === 'blocked';
    const next: TaskStatus = item.task.status === 'completed' ? 'pending' : 'completed';
    setStatusOverrides((prev) => ({ ...prev, [item.task_id]: next }));
    const supabase = createClient();
    await supabase
      .from('tasks')
      .update(wasBlocked ? { status: next, block_reason: null } : { status: next })
      .eq('id', item.task_id);
    await refresh();
  }

  async function persistOrder(orderedTaskIds: string[]) {
    if (!boardId) return;
    await reorderCards(boardId, orderedTaskIds.map((task_id, position) => ({ task_id, position })));
  }

  async function handleDrop({ taskId, to, orderedTaskIds }: DropPayload) {
    if (!boardId || !data) return;
    const item = allItems.find((it) => it.task_id === taskId);
    const task = item?.task;
    if (!task) return;
    const supabase = createClient();

    if (to.kind === 'section') {
      const sectionId = to.sectionId ?? null;
      await moveTask(boardId, taskId, sectionId, orderedTaskIds.indexOf(taskId));
      await persistOrder(orderedTaskIds);
      await refresh();
      return;
    }

    if (to.kind === 'status' && to.status) {
      await persistOrder(orderedTaskIds);
      if (to.status !== task.status) {
        if (to.status === 'blocked') {
          // Ask for a reason before writing; the dialog completes the move.
          setBlockPending({ taskId, wasBlocked: false });
          return;
        }
        setStatusOverrides((prev) => ({ ...prev, [taskId]: to.status! }));
        await supabase
          .from('tasks')
          .update(task.status === 'blocked' ? { status: to.status, block_reason: null } : { status: to.status })
          .eq('id', taskId);
      }
      await refresh();
      return;
    }

    if (to.kind === 'assignee') {
      await persistOrder(orderedTaskIds);
      const assigneeId = to.assigneeId ?? null;
      if (assigneeId !== task.assigned_user_id) {
        await supabase.from('tasks').update({ assigned_user_id: assigneeId }).eq('id', taskId);
      }
      await refresh();
    }
  }

  async function confirmBlock(reason: string) {
    if (!blockPending) return;
    const supabase = createClient();
    await supabase.from('tasks').update({ status: 'blocked', block_reason: reason }).eq('id', blockPending.taskId);
    setBlockPending(null);
    await refresh();
  }

  async function handleAddSection(name: string, index: number) {
    if (!boardId) return;
    const ordered = [...sections].sort((a, b) => a.position - b.position);
    // Shift everything at/after the insertion point to keep positions dense.
    const shifted = ordered.filter((s) => s.position >= index).map((s) => ({ id: s.id, position: s.position + 1 }));
    if (shifted.length > 0) await reorderSections(shifted);
    await createSection(boardId, name, index);
    await refresh();
  }

  async function handleRenameSection(sectionId: string, name: string) {
    await renameSection(sectionId, name);
    await refresh();
  }

  async function handleDeleteSection(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    const count = allItems.filter((it) => it.section_id === sectionId).length;
    const msg =
      count > 0
        ? `¿Eliminar la sección "${section?.name ?? ''}"? Sus ${count} ${count === 1 ? 'tarea pasará' : 'tareas pasarán'} a "Sin sección".`
        : `¿Eliminar la sección "${section?.name ?? ''}"?`;
    if (!window.confirm(msg)) return;
    await deleteSection(sectionId);
    await refresh();
  }

  function openTaskForm(column?: BoardColumn) {
    const firstSection = [...sections].sort((a, b) => a.position - b.position)[0];
    const sectionId = column && column.kind === 'section' ? column.sectionId ?? null : firstSection?.id ?? null;
    setTaskFormSection({ sectionId });
  }

  const openTask = (item: BoardTask) => setPanelTarget({ type: 'task', id: item.task_id });

  // ---------- Render ----------
  if (loading) {
    return <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando tablero...</p>;
  }
  if (error || !data) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div role="alert" style={{ padding: '1.2rem 1.6rem', borderRadius: '6px', border: '1px solid #fadbd0', backgroundColor: '#fff4ef', color: '#8a3c1a', fontSize: '1.3rem' }}>
          No pudimos cargar el tablero.
        </div>
        <Link href={`/${slug}/tableros`} style={{ display: 'inline-block', marginTop: '1.6rem', color: '#5c6ac4', fontSize: '1.3rem' }}>
          ← Volver a Tableros
        </Link>
      </div>
    );
  }

  const { board } = data;

  const renderKanban = (cols: BoardColumn[], scale: 'normal' | 'large', sectionTools: boolean) => (
    <BoardKanban
      columns={cols}
      grouping={view.grouping}
      scale={scale}
      canEdit={canEdit}
      onToggleComplete={handleToggleComplete}
      onOpen={openTask}
      onDrop={handleDrop}
      onAddTask={openTaskForm}
      onAddSection={sectionTools ? handleAddSection : undefined}
      onRenameSection={sectionTools ? handleRenameSection : undefined}
      onDeleteSection={sectionTools ? handleDeleteSection : undefined}
    />
  );

  return (
    <div>
      <Link href={`/${slug}/tableros`} style={{ color: '#637381', fontSize: '1.2rem', textDecoration: 'none' }}>
        ← Tableros
      </Link>

      {/* Header */}
      <div style={{ margin: '0.8rem 0 1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: board.color, display: 'inline-block' }} />
          <h1 style={{ fontSize: '2.2rem', fontWeight: 600, color: '#212b36', margin: 0 }}>{board.name}</h1>
          <span style={{ fontSize: '1.3rem', color: '#637381' }}>
            · {allItems.length} {allItems.length === 1 ? 'tarea' : 'tareas'} ·{' '}
            <span style={{ color: overdueCount > 0 ? '#bf0711' : '#637381' }}>
              {overdueCount} {overdueCount === 1 ? 'vencida' : 'vencidas'}
            </span>
          </span>
        </div>
        <p style={{ margin: '0.4rem 0 0', fontSize: '1.3rem', color: '#637381' }}>
          {board.visibility === 'private' ? 'Tablero privado' : 'Tablero del equipo · visible para todo el workspace'}
          {board.description ? ` · ${board.description}` : ''}
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid #dfe3e8', marginBottom: '1.6rem' }}>
        <TabButton active>Tablero</TabButton>
        <TabButton disabled>Lista</TabButton>
        <TabButton disabled>Calendario</TabButton>
      </div>

      <BoardToolbar
        canEdit={canEdit}
        members={members}
        filters={view.filters}
        onFiltersChange={(filters) => setView((v) => ({ ...v, filters }))}
        sort={view.sort}
        onSortChange={(sort) => setView((v) => ({ ...v, sort }))}
        grouping={view.grouping}
        onGroupingChange={(grouping) => setView((v) => ({ ...v, grouping }))}
        standupActive={standup}
        onToggleStandup={() => setStandup((s) => !s)}
        onAddTask={() => openTaskForm()}
      />

      {renderKanban(columns, 'normal', view.grouping === 'section')}

      {standup && (
        <StandupMode
          board={board}
          items={visibleItems}
          escEnabled={!panelTarget && !taskFormSection && !blockPending}
          onClose={() => setStandup(false)}
          renderKanban={(stageItems, personSelected) => {
            const cols = groupItems(stageItems, view.grouping, sections, members).filter((c) => !personSelected || c.items.length > 0);
            return renderKanban(cols, 'large', false);
          }}
        />
      )}

      {taskFormSection && currentWorkspace && (
        <TaskForm
          workspaceId={currentWorkspace.id}
          periodId={activePeriod?.id}
          allowObjectivePicker
          boardPlacement={{ boardId: board.id, sectionId: taskFormSection.sectionId }}
          onClose={() => setTaskFormSection(null)}
          onSaved={() => {
            setTaskFormSection(null);
            refresh();
          }}
        />
      )}

      {blockPending && (
        <BlockReasonDialog
          onConfirm={confirmBlock}
          onCancel={() => {
            setBlockPending(null);
            refresh();
          }}
        />
      )}

      <OkrDetailPanel target={panelTarget} departments={departments} canEdit={canEdit} onClose={() => setPanelTarget(null)} onChanged={refresh} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function TabButton({ active, disabled, children }: { active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={Boolean(active)}
      disabled={disabled}
      title={disabled ? 'Próximamente' : undefined}
      style={{
        padding: '0.8rem 1.6rem',
        fontSize: '1.4rem',
        fontWeight: active ? 600 : 500,
        color: active ? '#5c6ac4' : disabled ? '#c4cdd5' : '#637381',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #5c6ac4' : '2px solid transparent',
        marginBottom: '-1px',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
