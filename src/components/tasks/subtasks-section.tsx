'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/common/user-avatar';
import { UserIcon } from '@/components/boards/assignee-popover';
import { AsanaSection, formatShortDate } from '@/components/okrs/asana-detail-shell';
import { fetchSubtaskCounts } from '@/hooks/use-tasks';
import { formatOverdue, isPastDue } from '@/lib/utils/dates';
import { PRIORITY_CHIPS } from './priority';
import type { Task } from '@/types';

interface SubtasksSectionProps {
  parentTask: Pick<Task, 'id' | 'workspace_id' | 'objective_id'>;
  canEdit: boolean;
  onChanged?: () => void;
  /** Open a subtask's own detail (panel stack push, or full-page navigation). */
  onOpen?: (subtaskId: string) => void;
}

type SubtaskCount = { total: number; done: number };

const SUBTASK_SELECT = '*, assigned_user:profiles!tasks_assigned_user_id_fkey(*)';

/**
 * Subtasks are first-class tasks (rows in `tasks` with `parent_task_id`) and
 * may nest. The circle toggles completed/pending; the rest of the row opens
 * the subtask's own detail. Enter in the inline input creates one — never
 * placed on a board automatically.
 */
export function SubtasksSection({ parentTask, canEdit, onChanged, onOpen }: SubtasksSectionProps) {
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<Map<string, SubtaskCount>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('tasks')
      .select(SUBTASK_SELECT)
      .eq('parent_task_id', parentTask.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    const rows = (data || []) as Task[];
    // Nested-subtask counters ("☑ n/m"): one query for every row.
    const nested = await fetchSubtaskCounts(rows.map((r) => r.id));
    setSubtasks(rows);
    setCounts(nested);
    setLoading(false);
  }, [parentTask.id]);

  useEffect(() => {
    load();
  }, [load]);

  function refresh() {
    load();
    onChanged?.();
  }

  async function toggle(sub: Task) {
    if (!canEdit || busyId) return;
    setBusyId(sub.id);
    const supabase = createClient();
    const next = sub.status === 'completed' ? 'pending' : 'completed';
    await supabase.from('tasks').update({ status: next }).eq('id', sub.id);
    setBusyId(null);
    refresh();
  }

  async function remove(sub: Task) {
    if (!canEdit || busyId) return;
    const children = counts.get(sub.id)?.total ?? 0;
    if (children > 0) {
      const noun = children === 1 ? 'subtarea' : 'subtareas';
      const ok = window.confirm(`Se eliminarán también sus ${children} ${noun}. ¿Eliminar “${sub.title}”?`);
      if (!ok) return;
    }
    setBusyId(sub.id);
    const supabase = createClient();
    await supabase.from('tasks').delete().eq('id', sub.id);
    setBusyId(null);
    refresh();
  }

  async function add() {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    const supabase = createClient();
    // Intentionally NOT placed on any board: subtasks inherit context from
    // their parent and can be added to a board from their own detail.
    const { error } = await supabase.from('tasks').insert({
      title,
      parent_task_id: parentTask.id,
      workspace_id: parentTask.workspace_id,
      objective_id: parentTask.objective_id,
      status: 'pending',
      sort_order: subtasks.length,
    });
    setAdding(false);
    if (error) return;
    setNewTitle('');
    refresh();
  }

  const total = subtasks.length;
  const done = subtasks.filter((s) => s.status === 'completed').length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <AsanaSection title="Subtareas" count={total > 0 ? `${done}/${total}` : undefined}>
      {total > 0 && (
        <div
          aria-hidden
          style={{ width: '100%', height: '4px', backgroundColor: '#e4e5e7', borderRadius: '999px', overflow: 'hidden', marginBottom: '1.2rem' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct === 100 ? '#108043' : '#5c6ac4', borderRadius: '999px', transition: 'width 200ms' }} />
        </div>
      )}

      {loading ? (
        <p style={{ color: '#637381', fontSize: '1.3rem', margin: 0 }}>Cargando...</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {subtasks.map((s) => (
            <SubtaskRow
              key={s.id}
              subtask={s}
              nested={counts.get(s.id)}
              canEdit={canEdit}
              busy={busyId === s.id}
              onToggle={() => toggle(s)}
              onRemove={() => remove(s)}
              onOpen={onOpen ? () => onOpen(s.id) : undefined}
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: total > 0 ? '0.8rem' : 0 }}>
          <span aria-hidden style={{ color: '#5c6ac4', fontSize: '1.6rem', lineHeight: 1 }}>+</span>
          <input
            type="text"
            value={newTitle}
            disabled={adding}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Agregar subtarea"
            aria-label="Nueva subtarea"
            style={{
              flex: 1,
              fontSize: '1.3rem',
              color: '#212b36',
              padding: '0.5rem 0.2rem',
              border: 'none',
              borderBottom: '1px solid transparent',
              outline: 'none',
              backgroundColor: 'transparent',
            }}
            onFocus={(e) => { e.currentTarget.style.borderBottomColor = '#5c6ac4'; }}
            onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; }}
          />
        </div>
      )}
      {!canEdit && total === 0 && !loading && (
        <p style={{ color: '#919eab', fontSize: '1.3rem', margin: 0 }}>Sin subtareas.</p>
      )}
    </AsanaSection>
  );
}

// ---------------------------------------------------------------------------

interface SubtaskRowProps {
  subtask: Task;
  nested?: SubtaskCount;
  canEdit: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onOpen?: () => void;
}

function SubtaskRow({ subtask: s, nested, canEdit, busy, onToggle, onRemove, onOpen }: SubtaskRowProps) {
  const [hover, setHover] = useState(false);
  const isDone = s.status === 'completed';
  const overdue = !isDone && isPastDue(s.due_date);
  const priority = s.priority ? PRIORITY_CHIPS[s.priority] : null;
  const clickable = Boolean(onOpen);

  const body = (
    <>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: '1.3rem',
          color: isDone ? '#919eab' : '#212b36',
          textDecoration: isDone ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'left',
        }}
      >
        {s.title}
      </span>
      {nested && nested.total > 0 && (
        <span
          title={`${nested.done} de ${nested.total} subtareas completadas`}
          style={{ fontSize: '1.1rem', color: nested.done === nested.total ? '#108043' : '#637381', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
        >
          ☑ {nested.done}/{nested.total}
        </span>
      )}
      {priority && (
        <span
          title={`Prioridad ${priority.label.toLowerCase()}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.1rem 0.6rem',
            borderRadius: '999px',
            fontSize: '1.05rem',
            fontWeight: 600,
            backgroundColor: priority.bg,
            color: priority.fg,
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden style={{ fontSize: '0.85rem' }}>{priority.glyph}</span>
          {priority.label}
        </span>
      )}
      {s.due_date && (
        <span style={{ fontSize: '1.2rem', color: overdue ? '#bf0711' : '#637381', fontWeight: overdue ? 600 : 400, whiteSpace: 'nowrap' }}>
          {overdue ? `⚠ ${formatOverdue(s.due_date)}` : formatShortDate(s.due_date)}
        </span>
      )}
      {s.assigned_user ? (
        <UserAvatar user={s.assigned_user} size="small" />
      ) : (
        <span
          aria-label="Sin asignar"
          title="Sin asignar"
          style={{
            width: 24,
            height: 24,
            minWidth: 24,
            borderRadius: '50%',
            border: '1.5px dashed #c4cdd5',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <UserIcon />
        </span>
      )}
    </>
  );

  const rowInnerStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem',
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    background: hover && clickable ? '#f4f6f8' : 'transparent',
    border: 'none',
    font: 'inherit',
    color: 'inherit',
    cursor: clickable ? 'pointer' : 'default',
    transition: 'background-color 120ms',
  };

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.3rem 0',
        borderBottom: '1px solid #f4f6f8',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!canEdit || busy}
        aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como completada'}
        style={{
          width: '1.8rem',
          height: '1.8rem',
          borderRadius: '50%',
          border: `1.5px solid ${isDone ? '#108043' : '#c4cdd5'}`,
          backgroundColor: isDone ? '#108043' : 'white',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          marginLeft: '0.2rem',
          cursor: canEdit ? 'pointer' : 'default',
          flexShrink: 0,
        }}
      >
        {isDone && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </button>

      {clickable ? (
        <button
          type="button"
          onClick={onOpen}
          disabled={busy}
          title="Abrir subtarea"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          style={rowInnerStyle}
        >
          {body}
        </button>
      ) : (
        <div style={rowInnerStyle}>{body}</div>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label="Eliminar subtarea"
          title="Eliminar subtarea"
          style={{
            border: 'none',
            background: 'transparent',
            color: '#919eab',
            fontSize: '1.6rem',
            lineHeight: 1,
            cursor: 'pointer',
            padding: '0 0.2rem',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </li>
  );
}
