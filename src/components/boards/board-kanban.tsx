'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { BoardCard, SCALE, type KanbanScale } from './board-card';
import { Column, NewSectionColumn, columnKeyFromSortableId, columnSortableId, isColumnSortableId } from './board-column';
import type { BoardColumn, BoardGrouping } from './board-filters';
import type { BoardTask, Profile } from '@/types';

export interface DropPayload {
  taskId: string;
  fromKey: string;
  to: BoardColumn;
  /** Final task ids of the destination column, top to bottom. */
  orderedTaskIds: string[];
}

interface BoardKanbanProps {
  columns: BoardColumn[];
  grouping: BoardGrouping;
  scale?: KanbanScale;
  canEdit: boolean;
  members: Profile[];
  onToggleComplete: (item: BoardTask) => void;
  onOpen: (item: BoardTask) => void;
  onDrop: (payload: DropPayload) => void;
  /** Card-level writes (assignee popover) that need a refetch. */
  onChanged?: () => void;
  /** Column whose inline composer is open (by `BoardColumn.key`). */
  composerColumnKey?: string | null;
  renderComposer?: (column: BoardColumn) => ReactNode;
  onAddTask?: (column: BoardColumn) => void;
  /** Section tools are only rendered when grouping === 'section' and these are provided. */
  onAddSection?: (name: string, index: number) => void;
  onRenameSection?: (sectionId: string, name: string) => void;
  onDeleteSection?: (sectionId: string) => void;
  /** New left-to-right order of section ids after a header drag. */
  onReorderColumns?: (sectionIds: string[]) => void;
}

/**
 * Horizontal Kanban with dnd-kit. Keeps a local mirror of `columns` so cards
 * can move between containers while dragging; on drop it reports the final
 * destination + order and lets the page persist (and refetch). Column headers
 * are a second, horizontal sortable (ids prefixed `col:`) driven by a grip.
 */
export function BoardKanban({
  columns,
  grouping,
  scale = 'normal',
  canEdit,
  members,
  onToggleComplete,
  onOpen,
  onDrop,
  onChanged,
  composerColumnKey = null,
  renderComposer,
  onAddTask,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onReorderColumns,
}: BoardKanbanProps) {
  const [cols, setCols] = useState<BoardColumn[]>(columns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const originKey = useRef<string | null>(null);
  const dragging = useRef(false);
  const [newSectionAt, setNewSectionAt] = useState<number | null>(null);
  const dims = SCALE[scale];

  // Mirror props whenever they change, unless a drag is in flight. After a
  // drop the optimistic local order stays until the parent refetches.
  useEffect(() => {
    if (!dragging.current) setCols(columns);
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Column key for a droppable/sortable id: a column key, its `col:` twin, or a card id. */
  const findColumnKey = useCallback((rawId: string, list: BoardColumn[]): string | null => {
    const id = columnKeyFromSortableId(rawId);
    if (list.some((c) => c.key === id)) return id;
    return list.find((c) => c.items.some((it) => it.task_id === id))?.key ?? null;
  }, []);

  function resetDrag() {
    setActiveId(null);
    dragging.current = false;
    originKey.current = null;
  }

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    dragging.current = true;
    originKey.current = isColumnSortableId(id) ? null : findColumnKey(id, cols);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || isColumnSortableId(String(active.id))) return;
    const activeKey = findColumnKey(String(active.id), cols);
    const overKey = findColumnKey(String(over.id), cols);
    if (!activeKey || !overKey || activeKey === overKey) return;

    setCols((prev) => {
      const from = prev.find((c) => c.key === activeKey);
      const to = prev.find((c) => c.key === overKey);
      if (!from || !to) return prev;
      const moving = from.items.find((it) => it.task_id === String(active.id));
      if (!moving) return prev;
      const overIndex = to.items.findIndex((it) => it.task_id === String(over.id));
      const insertAt = overIndex >= 0 ? overIndex : to.items.length;
      return prev.map((c) => {
        if (c.key === from.key) return { ...c, items: c.items.filter((it) => it.task_id !== moving.task_id) };
        if (c.key === to.key) {
          const next = [...c.items];
          next.splice(insertAt, 0, moving);
          return { ...c, items: next };
        }
        return c;
      });
    });
  }

  function handleColumnDragEnd(activeRaw: string, overRaw: string | null) {
    const fromKey = columnKeyFromSortableId(activeRaw);
    const toKey = overRaw ? findColumnKey(overRaw, cols) : null;
    if (!toKey || fromKey === toKey) return;
    const sectionCols = cols.filter((c) => c.sectionId != null);
    const from = sectionCols.findIndex((c) => c.key === fromKey);
    const to = sectionCols.findIndex((c) => c.key === toKey);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(sectionCols, from, to);
    setCols([...reordered, ...cols.filter((c) => c.sectionId == null)]);
    onReorderColumns?.(reordered.map((c) => c.sectionId!));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const activeRaw = String(active.id);
    if (isColumnSortableId(activeRaw)) {
      resetDrag();
      handleColumnDragEnd(activeRaw, over ? String(over.id) : null);
      return;
    }
    const taskId = activeRaw;
    const fromKey = originKey.current;
    resetDrag();
    if (!over || !fromKey) {
      setCols(columns);
      return;
    }
    const currentKey = findColumnKey(taskId, cols);
    const overKey = findColumnKey(String(over.id), cols);
    if (!currentKey || !overKey) {
      setCols(columns);
      return;
    }
    let next = cols;
    if (currentKey === overKey) {
      const col = cols.find((c) => c.key === currentKey)!;
      const oldIndex = col.items.findIndex((it) => it.task_id === taskId);
      const newIndex = col.items.findIndex((it) => it.task_id === String(over.id));
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        next = cols.map((c) => (c.key === col.key ? { ...c, items: arrayMove(c.items, oldIndex, newIndex) } : c));
        setCols(next);
      }
    }
    const dest = next.find((c) => c.key === currentKey)!;
    const orderedTaskIds = dest.items.map((it) => it.task_id);
    const moved = fromKey !== dest.key || orderedTaskIds.join() !== (columns.find((c) => c.key === dest.key)?.items.map((it) => it.task_id).join() ?? '');
    if (moved) onDrop({ taskId, fromKey, to: dest, orderedTaskIds });
  }

  function handleDragCancel() {
    resetDrag();
    setCols(columns);
  }

  const activeItem = activeId && !isColumnSortableId(activeId) ? cols.flatMap((c) => c.items).find((it) => it.task_id === activeId) ?? null : null;
  const sectionTools = grouping === 'section' && canEdit && Boolean(onAddSection);
  // Index in `cols` after the last real section (before "Sin sección").
  const lastSectionIndex = cols.filter((c) => c.sectionId !== null).length;
  const columnSortableIds = cols.filter((c) => c.sectionId != null).map((c) => columnSortableId(c.key));

  const renderNewSectionInput = (index: number) => (
    <NewSectionColumn
      key={`new-${index}`}
      width={dims.column}
      onCancel={() => setNewSectionAt(null)}
      onSave={(name) => {
        setNewSectionAt(null);
        onAddSection?.(name, index);
      }}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={columnSortableIds} strategy={horizontalListSortingStrategy}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1.2rem',
            overflowX: 'auto',
            paddingBottom: '1.6rem',
            minHeight: '200px',
          }}
        >
          {cols.map((col, idx) => (
            <div key={col.key} style={{ display: 'contents' }}>
              {sectionTools && newSectionAt === idx && idx < lastSectionIndex && renderNewSectionInput(idx)}
              <Column
                column={col}
                scale={scale}
                canEdit={canEdit}
                members={members}
                onToggleComplete={onToggleComplete}
                onOpen={onOpen}
                onChanged={onChanged}
                composer={composerColumnKey === col.key && renderComposer ? renderComposer(col) : null}
                onAddTask={onAddTask ? () => onAddTask(col) : undefined}
                sectionTools={sectionTools && col.sectionId != null}
                onRename={(name) => col.sectionId && onRenameSection?.(col.sectionId, name)}
                onAddBefore={() => setNewSectionAt(idx)}
                onAddAfter={() => setNewSectionAt(idx + 1)}
                onDelete={() => col.sectionId && onDeleteSection?.(col.sectionId)}
              />
            </div>
          ))}
          {sectionTools &&
            (newSectionAt === lastSectionIndex ? (
              renderNewSectionInput(lastSectionIndex)
            ) : (
              <button
                type="button"
                onClick={() => setNewSectionAt(lastSectionIndex)}
                style={{
                  width: dims.column,
                  minWidth: dims.column,
                  padding: '1.4rem',
                  border: '2px dashed #c4cdd5',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: '#637381',
                  fontSize: '1.3rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                + Agregar sección
              </button>
            ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <div style={{ width: dims.column - 20 }}>
            <BoardCard item={activeItem} scale={scale} canEdit={false} onToggleComplete={() => {}} onOpen={() => {}} overlay />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
