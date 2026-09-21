'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { createClient } from '@/lib/supabase/client';
import {
  useBoard,
  createSection,
  deleteSection,
  loadBoardView,
  loadColumnOrder,
  saveBoardView,
  moveTask,
  renameSection,
  reorderCards,
  reorderSections,
  saveColumnOrder,
} from '@/hooks/use-boards';
import { OkrDetailPanel, type PanelTarget } from '@/components/okrs/okr-detail-panel';
import { BlockReasonDialog } from '@/components/tasks/block-reason-dialog';
import { BoardKanban, type DropPayload } from '@/components/boards/board-kanban';
import { BoardList } from '@/components/boards/board-list';
import { BoardToolbar } from '@/components/boards/board-toolbar';
import { BoardHeader } from '@/components/boards/board-header';
import { BoardFormModal } from '@/components/boards/board-form-modal';
import { TaskComposer } from '@/components/boards/task-composer';
import { StandupMode } from '@/components/boards/standup-mode';
import { BoardProgressTab } from '@/components/boards/board-progress-tab';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useBoardPageData } from '@/components/boards/use-board-page-data';
import {
  DEFAULT_VIEW,
  applyColumnOrder,
  applyFilters,
  groupItems,
  isTaskOverdue,
  loadView,
  viewsEqual,
  sortItems,
  type BoardColumn,
  type BoardView,
} from '@/components/boards/board-filters';
import { canManageContent } from '@/lib/utils/permissions';
import type { BoardTask, TaskStatus } from '@/types';

export default function TableroPage() {
  const params = useParams<{ 'workspace-slug': string; id: string }>();
  const slug = params?.['workspace-slug'] ?? '';
  const boardId = params?.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace, activePeriod, userWorkspace, profile, setProfile } = useWorkspaceStore();
  const { data, loading, error, refetch } = useBoard(boardId);
  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));
  const { members, departments, objectiveGroups, boardMembers, refetchBoardMembers } = useBoardPageData(currentWorkspace?.id, activePeriod?.id, boardId);
  const { isMobile } = useIsMobile();

  const [view, setView] = useState<BoardView>(DEFAULT_VIEW);
  const [viewLoaded, setViewLoaded] = useState(false);
  /** Per-user left-to-right section order (profiles.preferences). undefined = DB position order. */
  const [columnOrder, setColumnOrder] = useState<string[] | undefined>(undefined);
  /** Optimistic status per task id while the write + refetch are in flight. */
  const [statusOverrides, setStatusOverrides] = useState<Record<string, TaskStatus>>({});
  const [panelTarget, setPanelTarget] = useState<PanelTarget>(null);
  const [composerKey, setComposerKey] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [standup, setStandup] = useState(false);
  const [blockPending, setBlockPending] = useState<{ taskId: string; wasBlocked: boolean } | null>(null);

  // Per-user default view (profile prefs; legacy localStorage as fallback) +
  // per-user column order. Changes are NOT auto-saved: the toolbar shows
  // "Guardar filtros" while the current view differs from the saved default.
  const [savedView, setSavedView] = useState<BoardView>(DEFAULT_VIEW);
  const [savingView, setSavingView] = useState(false);
  useEffect(() => {
    if (!boardId || viewLoaded) return;
    const initial = loadBoardView(profile, boardId) ?? loadView(boardId);
    setSavedView(initial);
    // `?tab=avances` (links from the project cards) opens the Avances tab without touching the saved default.
    const requested = searchParams?.get('tab');
    setView(requested === 'avances' ? { ...initial, tab: 'progress' } : initial);
    setViewLoaded(true);
  }, [boardId, profile, viewLoaded, searchParams]);
  const viewDirty = viewLoaded && !viewsEqual(view, savedView);
  async function handleSaveView() {
    if (!boardId || !profile?.id) return;
    setSavingView(true);
    const preferences = await saveBoardView(profile.id, boardId, view);
    if (preferences) {
      setSavedView(view);
      setProfile({ ...profile, preferences });
    }
    setSavingView(false);
  }
  useEffect(() => {
    if (boardId) setColumnOrder(loadColumnOrder(profile, boardId));
  }, [boardId, profile]);

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

  const sections = useMemo(() => applyColumnOrder(data?.sections ?? [], columnOrder), [data?.sections, columnOrder]);
  const columns = useMemo(() => groupItems(visibleItems, view.grouping, sections, members), [visibleItems, view.grouping, sections, members]);
  const firstSectionId = sections[0]?.id ?? null;
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

  async function persistColumnOrder(ids: string[]) {
    if (!boardId) return;
    setColumnOrder(ids);
    if (!profile) return;
    const preferences = await saveColumnOrder(profile.id, boardId, ids);
    if (preferences) setProfile({ ...profile, preferences });
  }

  async function handleAddSection(name: string, index: number) {
    if (!boardId) return;
    // `index` is a position in the user's order; in the DB we insert at the same index and shift the rest.
    const shifted = sections.filter((_, i) => i >= index).map((s, i) => ({ id: s.id, position: index + i + 1 }));
    if (shifted.length > 0) await reorderSections(shifted);
    const { data: created } = await createSection(boardId, name, index);
    const newId = (created as { id: string } | null)?.id;
    if (newId && columnOrder) {
      const next = sections.map((s) => s.id);
      next.splice(index, 0, newId);
      await persistColumnOrder(next);
    }
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

  // Phones have no room for the side panel: the task opens as its own page (design B1).
  const openTask = (item: BoardTask) => (isMobile ? router.push(`/${slug}/tareas/${item.task_id}`) : setPanelTarget({ type: 'task', id: item.task_id }));

  const renderComposer = (column: BoardColumn) =>
    currentWorkspace && boardId ? (
      <TaskComposer
        key={column.key}
        workspaceId={currentWorkspace.id}
        boardId={boardId}
        sectionId={column.kind === 'section' ? column.sectionId ?? null : firstSectionId}
        presetStatus={column.kind === 'status' ? column.status : undefined}
        presetAssigneeId={column.kind === 'assignee' ? column.assigneeId ?? null : null}
        members={members}
        objectiveGroups={objectiveGroups}
        compact={view.tab === 'list'}
        onSaved={refresh}
        onCancel={() => setComposerKey(null)}
      />
    ) : null;

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
  const composerProps = canEdit ? { composerColumnKey: composerKey, renderComposer, onAddTask: (c: BoardColumn) => setComposerKey(c.key) } : {};

  const renderKanban = (cols: BoardColumn[], scale: 'normal' | 'large', sectionTools: boolean) => (
    <BoardKanban
      columns={cols}
      grouping={view.grouping}
      scale={scale}
      canEdit={canEdit}
      members={members}
      onToggleComplete={handleToggleComplete}
      onOpen={openTask}
      onDrop={handleDrop}
      onChanged={refresh}
      {...composerProps}
      onAddSection={sectionTools ? handleAddSection : undefined}
      onRenameSection={sectionTools ? handleRenameSection : undefined}
      onDeleteSection={sectionTools ? handleDeleteSection : undefined}
      onReorderColumns={view.grouping === 'section' ? persistColumnOrder : undefined}
    />
  );

  return (
    <div>
      <BoardHeader
        slug={slug}
        board={board}
        taskCount={allItems.length}
        overdueCount={overdueCount}
        boardMembers={boardMembers}
        onOpenSettings={canEdit ? () => setShowSettings(true) : undefined}
        tab={view.tab}
        onTabChange={(tab) => setView((v) => ({ ...v, tab }))}
      />

      {view.tab === 'progress' ? (
        <BoardProgressTab slug={slug} board={board} items={allItems} canEdit={canEdit} onBoardChanged={refresh} />
      ) : (
      <>
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
        onAddTask={() => columns[0] && setComposerKey(columns[0].key)}
        onOpenSettings={canEdit ? () => setShowSettings(true) : undefined}
        viewDirty={viewDirty}
        savingView={savingView}
        onSaveView={handleSaveView}
        onResetView={() => setView(savedView)}
      />

      {view.tab === 'list' ? (
        <BoardList columns={columns} canEdit={canEdit} members={members} onOpen={openTask} onChanged={refresh} {...composerProps} />
      ) : (
        renderKanban(columns, 'normal', view.grouping === 'section')
      )}
      </>
      )}

      {standup && (
        <StandupMode
          board={board}
          items={visibleItems}
          escEnabled={!panelTarget && !composerKey && !blockPending && !showSettings}
          onClose={() => setStandup(false)}
          renderKanban={(stageItems, personSelected) => {
            const cols = groupItems(stageItems, view.grouping, sections, members).filter((c) => !personSelected || c.items.length > 0);
            return renderKanban(cols, 'large', false);
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

      {currentWorkspace && (
        <BoardFormModal
          open={showSettings}
          workspaceId={currentWorkspace.id}
          members={members}
          board={board}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            refresh();
            refetchBoardMembers();
          }}
          onArchived={() => {
            setShowSettings(false);
            router.push(`/${slug}/tableros`);
          }}
        />
      )}

      <OkrDetailPanel target={panelTarget} departments={departments} canEdit={canEdit} onClose={() => setPanelTarget(null)} onChanged={refresh} />
    </div>
  );
}
