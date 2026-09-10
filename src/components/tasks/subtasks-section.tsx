'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/common/user-avatar';
import { AsanaSection, formatShortDate } from '@/components/okrs/asana-detail-shell';
import { isOverdue } from '@/lib/utils/dates';
import type { Task } from '@/types';

interface SubtasksSectionProps {
  parentTask: Pick<Task, 'id' | 'workspace_id' | 'objective_id'>;
  canEdit: boolean;
  onChanged?: () => void;
}

const SUBTASK_SELECT = '*, assigned_user:profiles!tasks_assigned_user_id_fkey(*)';

/**
 * Checklist of subtasks (rows in `tasks` with `parent_task_id`). Toggling the
 * circle flips completed/pending; Enter in the inline input creates one.
 */
export function SubtasksSection({ parentTask, canEdit, onChanged }: SubtasksSectionProps) {
  const [subtasks, setSubtasks] = useState<Task[]>([]);
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
    setSubtasks((data || []) as Task[]);
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
          {subtasks.map((s) => {
            const isDone = s.status === 'completed';
            const overdue = !isDone && isOverdue(s.due_date);
            const busy = busyId === s.id;
            return (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.6rem 0',
                  borderBottom: '1px solid #f4f6f8',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggle(s)}
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
                  }}
                >
                  {s.title}
                </span>
                {s.due_date && (
                  <span style={{ fontSize: '1.2rem', color: overdue ? '#de3618' : '#637381', fontWeight: overdue ? 600 : 400, whiteSpace: 'nowrap' }}>
                    {formatShortDate(s.due_date)}
                  </span>
                )}
                {s.assigned_user && <UserAvatar user={s.assigned_user} size="small" />}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => remove(s)}
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
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
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
