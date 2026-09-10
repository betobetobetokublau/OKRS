'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BoardCard, SCALE, type KanbanScale } from './board-card';
import { SectionMenu } from './section-menu';
import type { BoardColumn } from './board-filters';
import type { BoardTask, Profile } from '@/types';

/** dnd-kit id prefix for column (header) sortables, kept apart from card ids. */
export const COLUMN_ID_PREFIX = 'col:';
export const columnSortableId = (key: string) => `${COLUMN_ID_PREFIX}${key}`;
export const isColumnSortableId = (id: string) => id.startsWith(COLUMN_ID_PREFIX);
export const columnKeyFromSortableId = (id: string) => (isColumnSortableId(id) ? id.slice(COLUMN_ID_PREFIX.length) : id);

interface ColumnProps {
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
  /** Section-only tools: drag grip, inline rename, ··· menu. */
  sectionTools: boolean;
  onRename: (name: string) => void;
  onAddBefore: () => void;
  onAddAfter: () => void;
  onDelete: () => void;
}

export function Column({
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
}: ColumnProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.key });
  const sortable = useSortable({ id: columnSortableId(column.key), disabled: !sectionTools });
  const dims = SCALE[scale];

  const setRefs = (el: HTMLElement | null) => {
    setDropRef(el);
    sortable.setNodeRef(el);
  };

  return (
    <section
      ref={setRefs}
      aria-label={column.title}
      style={{
        width: dims.column,
        minWidth: dims.column,
        backgroundColor: isOver ? '#e3e7ee' : '#eceff3',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 240px)',
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : 1,
        zIndex: sortable.isDragging ? 5 : undefined,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '1rem 1rem 0.6rem 0.8rem', minWidth: 0 }}>
        {sectionTools ? (
          <button
            type="button"
            aria-label="Mover sección"
            {...sortable.attributes}
            {...sortable.listeners}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#919eab',
              cursor: sortable.isDragging ? 'grabbing' : 'grab',
              padding: '0 0.2rem',
              fontSize: '1.4rem',
              lineHeight: 1,
              letterSpacing: '-1px',
              touchAction: 'none',
            }}
          >
            ⋮⋮
          </button>
        ) : (
          <span style={{ width: '0.4rem' }} />
        )}
        <ColumnTitle title={column.title} scale={scale} editable={sectionTools} onRename={onRename} />
        <span style={{ fontSize: '1.2rem', color: '#919eab', fontWeight: 500 }}>{column.items.length}</span>
        <span style={{ flex: 1 }} />
        {sectionTools && <SectionMenu onAddBefore={onAddBefore} onAddAfter={onAddAfter} onDelete={onDelete} />}
      </header>

      <SortableContext items={column.items.map((it) => it.task_id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.4rem 1rem 1rem', overflowY: 'auto', minHeight: '60px' }}>
          {column.items.map((it) => (
            <SortableCard key={it.task_id} item={it} scale={scale} canEdit={canEdit} members={members} onToggleComplete={onToggleComplete} onOpen={onOpen} onChanged={onChanged} />
          ))}
          {composer}
          {canEdit && onAddTask && !composer && (
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.stopPropagation();
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
        if (editable && e.key === 'Enter') setEditing(true);
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
        cursor: editable ? 'text' : 'default',
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
