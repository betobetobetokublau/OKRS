'use client';

import type { CSSProperties } from 'react';
import { PRIORITY_CHIPS } from '@/components/tasks/priority';
import { taskStatusChip } from '@/components/okrs/status-chips';
import { formatDate, formatOverdue } from '@/lib/utils/dates';
import { AssigneePopover } from './assignee-popover';
import { isTaskOverdue } from './board-filters';
import type { BoardTask, Profile } from '@/types';

export type KanbanScale = 'normal' | 'large';

/** Size tokens for the two Kanban densities (standup mode uses `large`). */
export const SCALE = {
  normal: { column: 260, title: '1.35rem', chip: '1.1rem', meta: '1.2rem', avatar: 'small' as const, check: 18 },
  large: { column: 300, title: '1.5rem', chip: '1.25rem', meta: '1.3rem', avatar: 'medium' as const, check: 22 },
};

interface BoardCardProps {
  item: BoardTask;
  scale: KanbanScale;
  canEdit: boolean;
  /** Workspace members for the on-card assignee dropdown. */
  members?: Profile[];
  onToggleComplete: (item: BoardTask) => void;
  onOpen: (item: BoardTask) => void;
  /** Called after the card wrote to the task (assignee change). */
  onChanged?: () => void;
  /** Render as the floating drag overlay (no interaction). */
  overlay?: boolean;
  /** Placeholder left in the source column while dragging. */
  ghost?: boolean;
  style?: CSSProperties;
  dragHandleProps?: Record<string, unknown>;
  setNodeRef?: (el: HTMLElement | null) => void;
}

export function BoardCard({
  item,
  scale,
  canEdit,
  members = [],
  onToggleComplete,
  onOpen,
  onChanged,
  overlay,
  ghost,
  style,
  dragHandleProps,
  setNodeRef,
}: BoardCardProps) {
  const task = item.task;
  if (!task) return null;
  const s = SCALE[scale];
  const completed = task.status === 'completed';
  const blocked = task.status === 'blocked';
  const overdue = isTaskOverdue(item);
  const priority = task.priority ? PRIORITY_CHIPS[task.priority] : null;
  const status = task.status !== 'pending' ? taskStatusChip(task.status) : null;
  const subtasks = task.subtasks ?? [];
  const subDone = subtasks.filter((t) => t.status === 'completed').length;

  return (
    <div
      ref={setNodeRef}
      {...dragHandleProps}
      onClick={() => onOpen(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(item);
      }}
      style={{
        backgroundColor: 'white',
        border: '1px solid #dfe3e8',
        borderLeft: blocked ? '3px solid #de3618' : '1px solid #dfe3e8',
        borderRadius: '9px',
        padding: '10px 11px',
        cursor: overlay ? 'grabbing' : 'pointer',
        boxShadow: overlay ? '0 8px 24px rgba(33,43,54,0.18)' : '0 1px 0 rgba(33,43,54,0.04)',
        opacity: ghost ? 0.35 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.7rem',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
        <button
          type="button"
          aria-label={completed ? 'Marcar como pendiente' : 'Marcar como completada'}
          disabled={!canEdit}
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(item);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            width: s.check,
            height: s.check,
            minWidth: s.check,
            marginTop: '1px',
            borderRadius: '50%',
            border: completed ? '1.5px solid #108043' : '1.5px solid #c4cdd5',
            backgroundColor: completed ? '#108043' : 'white',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: canEdit ? 'pointer' : 'default',
            padding: 0,
            fontSize: `${s.check * 0.6}px`,
            lineHeight: 1,
          }}
        >
          {completed ? '✓' : ''}
        </button>
        <span
          style={{
            fontSize: s.title,
            fontWeight: 500,
            color: completed ? '#919eab' : '#212b36',
            textDecoration: completed ? 'line-through' : 'none',
            lineHeight: 1.35,
            wordBreak: 'break-word',
          }}
        >
          {task.title}
        </span>
      </div>

      {/* Meta chips */}
      {(priority || status) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingLeft: `${s.check + 8}px` }}>
          {priority && (
            <Chip bg={priority.bg} fg={priority.fg} size={s.chip}>
              {priority.glyph} {priority.label}
            </Chip>
          )}
          {status && (
            <Chip bg={status.bg} fg={status.fg} size={s.chip}>
              {status.label}
            </Chip>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', paddingLeft: `${s.check + 8}px` }}>
        <AssigneePopover
          taskId={task.id}
          current={task.assigned_user ?? null}
          members={members}
          canEdit={canEdit && !overlay}
          size={s.avatar}
          onChanged={() => onChanged?.()}
        />
        {task.due_date && (
          <span
            style={{
              fontSize: s.meta,
              color: overdue ? '#bf0711' : '#637381',
              fontWeight: overdue ? 600 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {overdue ? `⚠ ${formatOverdue(task.due_date)}` : formatDate(task.due_date)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {subtasks.length > 0 && (
          <span style={{ fontSize: s.meta, color: subDone === subtasks.length ? '#108043' : '#637381', whiteSpace: 'nowrap' }}>
            ☑ {subDone}/{subtasks.length}
          </span>
        )}
      </div>
    </div>
  );
}

function Chip({ bg, fg, size, children }: { bg: string; fg: string; size: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.7rem',
        borderRadius: '999px',
        backgroundColor: bg,
        color: fg,
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.6,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
