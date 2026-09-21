'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BoardCard, SCALE, type KanbanScale } from './board-card';
import { SectionMenu } from './section-menu';
import type { BoardColumn } from './board-filters';
import type { BoardTask, Profile } from '@/types';

/** dnd-kit id prefix for column sortables, kept apart from card ids. */
export const COLUMN_ID_PREFIX = 'col:';
export const columnSortableId = (key: string) => `${COLUMN_ID_PREFIX}${key}`;
export const isColumnSortableId = (id: string) => id.startsWith(COLUMN_ID_PREFIX);
export const columnKeyFromSortableId = (id: string) => (isColumnSortableId(id) ? id.slice(COLUMN_ID_PREFIX.length) : id);

/** Presentation props shared by the live column and its drag overlay copy. */
interface ColumnFrameProps {
  column: BoardColumn;
  scale: KanbanScale;
  canEdit: boolean;
  members: Profile[];
  onToggleComplete: (item: BoardTask) => void;
  onOpen: (item: BoardTask) => void;
  onChanged?: () => void;
  /** Composer node rendered at the bottom of the list when open. */
  composer: ReactNode | null;
  onAddTask?: () => void;
  /** Section-only tools: inline rename + ··· menu. */
  sectionTools: boolean;
  onRename: (name: string) => void;
  onAddBefore: () => void;
  onAddAfter: () => void;
  onDelete: () => void;
}

interface ColumnProps extends ColumnFrameProps {
  /** Whole header becomes a drag handle that reorders the column. */
  reorderable: boolean;
}

/**
 * Live Kanban column: a droppable for cards plus a horizontal sortable so the
 * header can be dragged to reorder sections. While dragging, this node stays
 * in place as a translucent placeholder (the `<DragOverlay>` shows the moving
 * copy) and its siblings slide via the sortable transform.
 */
export function Column({ reorderable, ...frame }: ColumnProps) {
  const { column } = frame;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.key });
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: columnSortableId(column.key),
    disabled: !reorderable,
  });

  const setRefs = (el: HTMLElement | null) => {
    setDropRef(el);
    setNodeRef(el);
  };

  return (
    <ColumnFrame
      {...frame}
      setNodeRef={setRefs}
      isOver={isOver}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      headerRef={reorderable ? setActivatorNodeRef : undefined}
      headerProps={reorderable ? { ...attributes, ...listeners, role: undefined, 'aria-roledescription': 'Sección arrastrable' } : undefined}
      grabbing={isDragging}
    />
  );
}

/** Floating copy of a column rendered inside `<DragOverlay>` while its header is dragged. */
export function ColumnOverlay(props: ColumnFrameProps) {
  return (
    <ColumnFrame
      {...props}
      overlay
      style={{
        transform: 'rotate(2deg)',
        opacity: 0.95,
        boxShadow: '0 12px 32px rgba(33,43,54,0.22)',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Frame (shared markup)
// ---------------------------------------------------------------------------
function ColumnFrame({
  column,
  scale,
  canEdit,
  members,
  onToggleComplete,
  onOpen,
  onChanged,
  composer,
  onAddTask,
  sectionTools,
  onRename,
  onAddBefore,
  onAddAfter,
  onDelete,
  setNodeRef,
  isOver = false,
  style,
  headerRef,
  headerProps,
  grabbing = false,
  overlay = false,
}: ColumnFrameProps & {
  setNodeRef?: (el: HTMLElement | null) => void;
  isOver?: boolean;
  style?: CSSProperties;
  headerRef?: (el: HTMLElement | null) => void;
  headerProps?: Record<string, unknown>;
  grabbing?: boolean;
  /** Static copy for the drag overlay: no droppable/sortable hooks, no interaction. */
  overlay?: boolean;
}) {
  const dims = SCALE[scale];
  const draggable = Boolean(headerProps) || overlay;
  const cardProps = { scale, canEdit, members, onToggleComplete, onOpen, onChanged };

  return (
    <section
      ref={setNodeRef}
      aria-label={column.title}
      className="m-kcol"
      style={{
        width: dims.column,
        minWidth: dims.column,
        backgroundColor: isOver ? '#e3e7ee' : '#eceff3',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 240px)',
        ...style,
      }}
    >
      <header
        ref={headerRef}
        {...headerProps}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '1rem 1rem 0.6rem 0.8rem',
          minWidth: 0,
          cursor: grabbing || overlay ? 'grabbing' : draggable ? 'grab' : 'default',
          touchAction: draggable ? 'none' : undefined,
          userSelect: draggable ? 'none' : undefined,
          outline: 'none',
        }}
      >
        {draggable ? (
          <span aria-hidden style={{ color: '#919eab', padding: '0 0.2rem', fontSize: '1.4rem', lineHeight: 1, letterSpacing: '-1px' }}>
            ⋮⋮
          </span>
        ) : (
          <span style={{ width: '0.4rem' }} />
        )}
        <ColumnTitle title={column.title} scale={scale} editable={sectionTools && !overlay} onRename={onRename} />
        <span style={{ fontSize: '1.2rem', color: '#919eab', fontWeight: 500 }}>{column.items.length}</span>
        <span style={{ flex: 1 }} />
        {sectionTools && !overlay && (
          // Pointer events inside the menu must not start a column drag.
          <div onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <SectionMenu onAddBefore={onAddBefore} onAddAfter={onAddAfter} onDelete={onDelete} />
          </div>
        )}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.4rem 1rem 1rem', overflowY: overlay ? 'hidden' : 'auto', minHeight: '60px' }}>
        {overlay ? (
          column.items.map((it) => <BoardCard key={it.task_id} item={it} {...cardProps} canEdit={false} />)
        ) : (
          <SortableContext items={column.items.map((it) => it.task_id)} strategy={verticalListSortingStrategy}>
            {column.items.map((it) => (
              <SortableCard key={it.task_id} item={it} {...cardProps} />
            ))}
          </SortableContext>
        )}
        {!overlay && composer}
        {canEdit && onAddTask && !composer && (
          <button
            type="button"
            onClick={overlay ? undefined : onAddTask}
            tabIndex={overlay ? -1 : undefined}
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Click-to-edit column title
// ---------------------------------------------------------------------------
function ColumnTitle({ title, scale, editable, onRename }: { title: string; scale: KanbanScale; editable: boolean; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const fontSize = scale === 'large' ? '1.5rem' : '1.35rem';

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  function commit() {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== title) onRename(name);
    else setDraft(title);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        aria-label="Nombre de la sección"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        // Text selection inside the input must not start a column drag.
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(title);
            setEditing(false);
          }
        }}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize,
          fontWeight: 600,
          color: '#212b36',
          padding: '0.1rem 0.2rem',
          border: 'none',
          borderBottom: '2px solid #5c6ac4',
          borderRadius: 0,
          background: 'transparent',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <span
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      title={editable ? 'Clic para renombrar' : undefined}
      onClick={() => editable && setEditing(true)}
      onKeyDown={(e) => {
        if (editable && e.key === 'Enter') {
          e.stopPropagation();
          setEditing(true);
        }
      }}
      style={{
        fontSize,
        fontWeight: 600,
        color: '#212b36',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        padding: '0.1rem 0.2rem',
        borderBottom: '2px solid transparent',
        cursor: editable ? 'text' : 'inherit',
      }}
    >
      {title}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sortable card wrapper
// ---------------------------------------------------------------------------
function SortableCard({
  item,
  scale,
  canEdit,
  members,
  onToggleComplete,
  onOpen,
  onChanged,
}: {
  item: BoardTask;
  scale: KanbanScale;
  canEdit: boolean;
  members: Profile[];
  onToggleComplete: (item: BoardTask) => void;
  onOpen: (item: BoardTask) => void;
  onChanged?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.task_id, disabled: !canEdit });
  return (
    <BoardCard
      item={item}
      scale={scale}
      canEdit={canEdit}
      members={members}
      onToggleComplete={onToggleComplete}
      onOpen={onOpen}
      onChanged={onChanged}
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
export function NewSectionColumn({ width, onSave, onCancel }: { width: number; onSave: (name: string) => void; onCancel: () => void }) {
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
