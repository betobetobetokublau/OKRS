'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/common/user-avatar';
import { MentionTextarea, renderCommentContent } from '@/components/comments/mention-textarea';
import { extractMentionIds } from '@/lib/validators/board';
import { formatRelative } from '@/lib/utils/dates';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { formatActivityBody } from './task-activity-format';
import type { Comment, Profile, TaskActivity } from '@/types';

interface TaskCommentsProps {
  taskId: string;
  workspaceId: string;
  /** Show the composer (default true). */
  canComment?: boolean;
}

type Tab = 'comments' | 'activity';

/**
 * Comments + activity trail for a task. The header shows the comment count and
 * a segmented toggle; the composer supports @mentions (ids are stored in
 * `comments.mentions` and the DB trigger notifies those users).
 */
export function TaskComments({ taskId, workspaceId, canComment = true }: TaskCommentsProps) {
  const profile = useWorkspaceStore((s) => s.profile);
  const [tab, setTab] = useState<Tab>('comments');
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [commentsRes, activityRes, membersRes] = await Promise.all([
      supabase
        .from('comments')
        .select('*, user:profiles(*)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false }),
      supabase
        .from('task_activity')
        .select('*, actor:profiles(*)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('user_workspaces').select('profile:profiles(*)').eq('workspace_id', workspaceId),
    ]);
    setComments((commentsRes.data || []) as Comment[]);
    setActivity((activityRes.data || []) as TaskActivity[]);
    setMembers(
      ((membersRes.data || []) as Array<{ profile: Profile | Profile[] | null }>)
        .map((uw) => (Array.isArray(uw.profile) ? uw.profile[0] ?? null : uw.profile))
        .filter((p): p is Profile => Boolean(p)),
    );
    setLoading(false);
  }, [taskId, workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.id, m.full_name);
    // Activity actors / comment authors may have left the workspace: still resolvable.
    for (const a of activity) if (a.actor) map.set(a.actor.id, a.actor.full_name);
    for (const c of comments) if (c.user) map.set(c.user.id, c.user.full_name);
    return map;
  }, [members, activity, comments]);
  const lookupName = useCallback((id: string) => nameById.get(id) ?? null, [nameById]);

  const mentionedOthers = useMemo(
    () => extractMentionIds(draft).filter((id) => id !== profile?.id).length,
    [draft, profile?.id],
  );

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      setError('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }
    const { error: insertError } = await supabase.from('comments').insert({
      user_id: user.id,
      task_id: taskId,
      content: trimmed,
      mentions: extractMentionIds(trimmed),
    });
    setSubmitting(false);
    if (insertError) {
      setError('No se pudo publicar el comentario.');
      return;
    }
    setDraft('');
    load();
  }

  return (
    <section
      className="Polaris-Card"
      style={{ padding: '1.6rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.2rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36', margin: 0 }}>
          Comentarios
          <span style={{ marginLeft: '0.8rem', fontSize: '1.2rem', color: '#919eab', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {comments.length}
          </span>
        </h2>
        <SegmentedToggle value={tab} onChange={setTab} />
      </header>

      {loading ? (
        <p style={{ color: '#637381', fontSize: '1.3rem', margin: 0 }}>Cargando...</p>
      ) : tab === 'comments' ? (
        <>
          {comments.length === 0 ? (
            <p style={{ color: '#919eab', fontSize: '1.3rem', margin: '0 0 1.2rem' }}>Aún no hay comentarios.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.2rem' }}>
              {comments.map((c) => (
                <li key={c.id} style={{ display: 'flex', gap: '1rem', padding: '1rem 0', borderBottom: '1px solid #f4f6f8' }}>
                  {c.user ? <UserAvatar user={c.user} size="small" /> : <span style={{ width: 24 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36' }}>
                        {c.user?.full_name ?? 'Usuario'}
                      </span>
                      <span style={{ fontSize: '1.1rem', color: '#919eab' }}>{formatRelative(c.created_at)}</span>
                    </div>
                    <p style={{ fontSize: '1.3rem', color: '#212b36', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {renderCommentContent(c.content, members)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canComment && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <MentionTextarea
                value={draft}
                onChange={setDraft}
                members={members}
                placeholder="Escribe un comentario… usa @ para mencionar"
                rows={3}
                disabled={submitting}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <span style={{ fontSize: '1.2rem', color: error ? '#bf0711' : '#919eab' }}>
                  {error
                    ? error
                    : mentionedOthers > 0
                      ? `Se notificará a ${mentionedOthers} ${mentionedOthers === 1 ? 'persona' : 'personas'}`
                      : ''}
                </span>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    padding: '0.6rem 1.6rem',
                    fontSize: '1.3rem',
                    fontWeight: 500,
                    color: 'white',
                    backgroundColor: canSubmit ? '#5c6ac4' : '#8c92c4',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                  }}
                >
                  {submitting ? 'Enviando...' : 'Comentar'}
                </button>
              </div>
            </form>
          )}
        </>
      ) : activity.length === 0 ? (
        <p style={{ color: '#919eab', fontSize: '1.3rem', margin: 0 }}>Sin actividad registrada.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {activity.map((a) => (
            <li key={a.id} style={{ display: 'flex', gap: '1rem', padding: '0.8rem 0', borderBottom: '1px solid #f4f6f8', alignItems: 'flex-start' }}>
              {a.actor ? (
                <UserAvatar user={a.actor} size="small" />
              ) : (
                <span style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#dfe3e8', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '1.3rem', color: '#637381', fontStyle: 'italic', margin: 0, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, fontStyle: 'normal', color: '#212b36' }}>{a.actor?.full_name ?? 'Alguien'}</span>{' '}
                  {formatActivityBody(a, lookupName)}
                </p>
                <span style={{ fontSize: '1.1rem', color: '#919eab' }}>{formatRelative(a.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SegmentedToggle({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const options: Array<{ value: Tab; label: string }> = [
    { value: 'comments', label: 'Comentarios' },
    { value: 'activity', label: 'Actividad' },
  ];
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        padding: '0.2rem',
        backgroundColor: '#f4f6f8',
        border: '1px solid #dfe3e8',
        borderRadius: '6px',
        gap: '0.2rem',
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(o.value)}
            style={{
              padding: '0.3rem 1rem',
              fontSize: '1.2rem',
              fontWeight: 500,
              color: selected ? '#212b36' : '#637381',
              backgroundColor: selected ? 'white' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              boxShadow: selected ? '0 1px 2px rgba(33,43,54,0.12)' : 'none',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
