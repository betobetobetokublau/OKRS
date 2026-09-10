'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BoardCard, SCALE, type KanbanScale } from './board-card';
import { SectionMenu } from './section-menu';
import type { BoardColumn, BoardGrouping } from './board-filters';
import type { BoardTask } from '@/types';

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
  onToggleComplete: (item: BoardTask) => void;
  onOpen: (item: BoardTask) => void;
  onDrop: (payload: DropPayload) => void;
  onAddTask: (column: BoardColumn) => void;
  /** Section tools are only rendered when grouping === 'section' and these are provided. */
  onAddSection?: (name: string, index: number) => void;
  onRenameSection?: (sectionId: string, name: string) => void;
  onDeleteSection?: (sectionId: string) => void;
}

/**
 * Horizontal Kanban with dnd-kit. Keeps a local mirror of `columns` so cards
 * can move between containers while dragging; on drop it reports the final
 * destination + order and lets the page persist (and refetch).
 */
export function BoardKanban({
  columns,
  grouping,
  scale = 'normal',
  canEdit,
  onToggleComplete,
  onOpen,
  onDrop,
  onAddTask,
  onAddSection,
  onRenameSection,
  onDeleteSection,
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

  const findColumnKey = useCallback(
    (id: string, list: BoardColumn[]): string | null => {
      if (list.some((c) => c.key === id)) return id;
      return list.find((c) => c.items.some((it) => it.task_id === id))?.key ?? null;
    },
    [],
  );

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    dragging.current = true;
    originKey.current = findColumnKey(id, cols);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
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

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const taskId = String(active.id);
    const fromKey = originKey.current;
    setActiveId(null);
    dragging.current = false;
    originKey.current = null;
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
    setActiveId(null);
    dragging.current = false;
    originKey.current = null;
    setCols(columns);
  }

  const activeItem = activeId ? cols.flatMap((c) => c.items).find((it) => it.task_id === activeId) ?? null : null;
  const sectionTools = grouping === 'section' && canEdit && Boolean(onAddSection);
  // Index in `cols` after the last real section (before "Sin sección").
  const lastSectionIndex = cols.filter((c) => c.sectionId !== null).length;

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
              onToggleComplete={onToggleComplete}
              onOpen={onOpen}
              onAddTask={() => onAddTask(col)}
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

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------
interface ColumnProps {
  column: BoardColumn;
  scale: KanbanScale;
  canEdit: boolean;
  onToggleComplete: (item: BoardTask) => void;
  onOpen: (item: BoardTask) => void;
  onAddTask: () => void;
  sectionTools: boolean;
  onRename: (name: string) => void;
  onAddBefore: () => void;
  onAddAfter: () => void;
  onDelete: () => void;
}

function Column({ column, scale, canEdit, onToggleComplete, onOpen, onAddTask, sectionTools, onRename, onAddBefore, onAddAfter, onDelete }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(column.title);
  const dims = SCALE[scale];

  function commitRename() {
    setRenaming(false);
    const name = draft.trim();
    if (name && name !== column.title) onRename(name);
    else setDraft(column.title);
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={column.title}
      style={{
        width: dims.column,
        minWidth: dims.column,
        backgroundColor: isOver ? '#e3e7ee' : '#eceff3',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 240px)',
        transition: 'background-color 0.12s ease',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1rem 1rem 0.6rem 1.2rem' }}>
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setDraft(column.title);
                setRenaming(false);
              }
            }}
            style={{ flex: 1, fontSize: '1.35rem', fontWeight: 600, padding: '0.2rem 0.6rem', border: '1px solid #5c6ac4', borderRadius: '4px' }}
          />
        ) : (
          <span
            onDoubleClick={() => sectionTools && setRenaming(true)}
            style={{ fontSize: scale === 'large' ? '1.5rem' : '1.35rem', fontWeight: 600, color: '#212b36', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {column.title}
          </span>
        )}
        <span style={{ fontSize: '1.2rem', color: '#919eab', fontWeight: 500 }}>{column.items.length}</span>
        <span style={{ flex: 1 }} />
        {sectionTools && !renaming && (
          <SectionMenu
            onRename={() => {
              setDraft(column.title);
              setRenaming(true);
            }}
            onAddBefore={onAddBefore}
            onAddAfter={onAddAfter}
            onDelete={onDelete}
          />
        )}
      </header>

      <SortableContext items={column.items.map((it) => it.task_id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.4rem 1rem 1rem', overflowY: 'auto', minHeight: '60px' }}>
          {column.items.map((it) => (
            <SortableCard key={it.task_id} item={it} scale={scale} canEdit={canEdit} onToggleComplete={onToggleComplete} onOpen={onOpen} />
          ))}
          {canEdit && (
            <button
              type="button"
              onClick={onAddTask}
              style={{
                textAlign: 'left',
                padding: column.items.length === 0 ? '1.2rem 0.6rem' : '0.5rem 0.6rem',
                fontSize: '1.3rem',
                color: '#637381',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              + Agregar tarea
            </button>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sortable card wrapper
// ---------------------------------------------------------------------------
function SortableCard({
  item,
  scale,
  canEdit,
  onToggleComplete,
  onOpen,
}: {
  item: BoardTask;
  scale: KanbanScale;
  canEdit: boolean;
  onToggleComplete: (item: BoardTask) => void;
  onOpen: (item: BoardTask) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.task_id, disabled: !canEdit });
  return (
    <BoardCard
      item={item}
      scale={scale}
      canEdit={canEdit}
      onToggleComplete={onToggleComplete}
      onOpen={onOpen}
      ghost={isDragging}
      setNodeRef={setNodeRef}
      dragHandleProps={{ ...attributes, ...listeners }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    />
  );
}

// ---------------------------------------------------------------------------
// Inline "new section" column
// ---------------------------------------------------------------------------
function NewSectionColumn({ width, onSave, onCancel }: { width: number; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  return (
    <div style={{ width, minWidth: width, backgroundColor: '#eceff3', borderRadius: '10px', padding: '1rem' }}>
      <input
        autoFocus
        value={name}
        placeholder="Nombre de la sección"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim());
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => {
          if (name.trim()) onSave(name.trim());
          else onCancel();
        }}
        style={{ width: '100%', fontSize: '1.35rem', fontWeight: 600, padding: '0.5rem 0.8rem', border: '1px solid #5c6ac4', borderRadius: '6px' }}
      />
      <p style={{ margin: '0.6rem 0 0', fontSize: '1.1rem', color: '#919eab' }}>Enter para guardar · Esc para cancelar</p>
    </div>
  );
}
