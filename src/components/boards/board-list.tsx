'use client';

import { useState, type ReactNode } from 'react';
import { InlinePrioritySelect } from '@/components/okrs/inline-priority-select';
import { InlineStatusSelect } from '@/components/okrs/inline-status-select';
import { ParentHint } from '@/components/tasks/task-row';
import { formatDate, formatOverdue } from '@/lib/utils/dates';
import { AssigneePopover } from './assignee-popover';
import { isTaskOverdue, type BoardColumn } from './board-filters';
import type { BoardTask, Profile } from '@/types';
import { useIsMobile } from '@/hooks/use-is-mobile';

interface BoardListProps {
  /** Already filtered + sorted + grouped (same pipeline as the Kanban). */
  columns: BoardColumn[];
  canEdit: boolean;
  members: Profile[];
  onOpen: (item: BoardTask) => void;
  onChanged: () => void;
  composerColumnKey?: string | null;
  renderComposer?: (column: BoardColumn) => ReactNode;
  onAddTask?: (column: BoardColumn) => void;
}

const COLS = 'minmax(280px, 1fr) 160px 200px 130px 160px';
const CELL = { padding: '0.7rem 1.2rem', fontSize: '1.3rem', color: '#212b36', display: 'flex', alignItems: 'center', minWidth: 0 } as const;

/** "Lista" tab: one table per group with collapsible headers and an inline composer row. */
export function BoardList({ columns, canEdit, members, onOpen, onChanged, composerColumnKey = null, renderComposer, onAddTask }: BoardListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // Phones: title + status only, sections stack vertically with sticky headers (design B1).
  const { isMobile } = useIsMobile();

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #dfe3e8', borderRadius: '10px', overflowX: 'auto' }}>
      <div style={{ minWidth: isMobile ? 0 : 930 }}>
        <div role="row" style={{ display: isMobile ? 'none' : 'grid', gridTemplateColumns: COLS, borderBottom: '1px solid #dfe3e8', backgroundColor: '#f9fafb' }}>
          {['Tarea', 'Prioridad', 'Responsable', 'Fecha límite', 'Estado'].map((h) => (
            <div key={h} role="columnheader" style={{ ...CELL, fontSize: '1.1rem', fontWeight: 700, color: '#919eab', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {h}
            </div>
          ))}
        </div>

        {columns.map((col) => {
          const isCollapsed = collapsed.has(col.key);
          const composerOpen = composerColumnKey === col.key && Boolean(renderComposer);
          return (
            <section key={col.key} aria-label={col.title}>
              <button
                type="button"
                onClick={() => toggle(col.key)}
                aria-expanded={!isCollapsed}
                style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', textAlign: 'left', padding: '0.9rem 1.2rem', border: 'none', borderBottom: '1px solid #f1f3f5', background: '#fbfbfc', cursor: 'pointer', position: isMobile ? 'sticky' : 'static', top: 0, zIndex: 1 }}
              >
                <span aria-hidden style={{ display: 'inline-block', width: 12, color: '#637381', fontSize: '1rem', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.12s ease' }}>
                  ▼
                </span>
                <span style={{ fontSize: '1.35rem', fontWeight: 600, color: '#212b36' }}>{col.title}</span>
                <span style={{ fontSize: '1.2rem', color: '#919eab', fontWeight: 500 }}>{col.items.length}</span>
              </button>

              {!isCollapsed && (
                <>
                  {col.items.map((it) => (
                    <Row key={it.task_id} item={it} canEdit={canEdit} members={members} onOpen={onOpen} onChanged={onChanged} compact={isMobile} />
                  ))}
                  {composerOpen && renderComposer?.(col)}
                  {canEdit && onAddTask && !composerOpen && (
                    <button
                      type="button"
                      onClick={() => onAddTask(col)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 1.2rem 0.6rem 4.2rem', fontSize: '1.3rem', color: '#637381', background: 'transparent', border: 'none', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }}
                    >
                      + Agregar tarea
                    </button>
                  )}
                </>
              )}
            </section>
          );
        })}

        {columns.length === 0 && <p style={{ margin: 0, padding: '2.4rem', textAlign: 'center', fontSize: '1.3rem', color: '#919eab' }}>No hay tareas que coincidan con los filtros.</p>}
      </div>
    </div>
  );
}

function Row({ item, canEdit, members, onOpen, onChanged, compact = false }: { item: BoardTask; canEdit: boolean; members: Profile[]; onOpen: (item: BoardTask) => void; onChanged: () => void; compact?: boolean }) {
  const [hover, setHover] = useState(false);
  const task = item.task;
  if (!task) return null;
  const completed = task.status === 'completed';
  const overdue = isTaskOverdue(item);
  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(item);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr) auto auto' : COLS, borderBottom: '1px solid #f1f3f5', backgroundColor: hover ? '#f9fafb' : 'white', cursor: 'pointer' }}
    >
      <div style={{ ...CELL, gap: '0.8rem' }}>
        <span aria-hidden style={{ width: 16, height: 16, minWidth: 16, borderRadius: '50%', border: completed ? '1.5px solid #108043' : '1.5px solid #c4cdd5', backgroundColor: completed ? '#108043' : 'white', color: 'white', fontSize: '1rem', lineHeight: '13px', textAlign: 'center' }}>
          {completed ? '✓' : ''}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {task.parent && <ParentHint title={task.parent.title} />}
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: completed ? '#919eab' : '#212b36', textDecoration: completed ? 'line-through' : 'none', fontWeight: 500 }}>{task.title}</span>
        </div>
      </div>
      {!compact && (
        <div style={CELL} onClick={(e) => e.stopPropagation()}>
          <InlinePrioritySelect id={task.id} currentPriority={task.priority} canEdit={canEdit} onChanged={onChanged} />
        </div>
      )}
      <div style={CELL}>
        <AssigneePopover taskId={task.id} current={task.assigned_user ?? null} members={members} canEdit={canEdit} withName={!compact} onChanged={onChanged} />
      </div>
      {!compact && (
        <div style={{ ...CELL, color: overdue ? '#bf0711' : task.due_date ? '#212b36' : '#919eab', fontWeight: overdue ? 600 : 400 }}>
          {task.due_date ? (overdue ? `⚠ ${formatOverdue(task.due_date)}` : formatDate(task.due_date)) : '—'}
        </div>
      )}
      <div style={CELL} onClick={(e) => e.stopPropagation()}>
        <InlineStatusSelect entity="task" id={task.id} currentStatus={task.status} canEdit={canEdit} onChanged={onChanged} />
      </div>
    </div>
  );
}
