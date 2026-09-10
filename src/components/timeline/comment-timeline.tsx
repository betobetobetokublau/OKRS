'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/common/user-avatar';
import { formatRelative } from '@/lib/utils/dates';
import { MentionTextarea, renderCommentContent } from '@/components/comments/mention-textarea';
import { useLiveRefetch } from '@/components/comments/use-live-comments';
import { extractMentionIds } from '@/lib/validators/board';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Comment, ProgressLog, Profile } from '@/types';

interface TimelineEntry {
  id: string;
  type: 'comment' | 'progress_log';
  user: Profile;
  content: string;
  created_at: string;
}

interface CommentTimelineProps {
  objectiveId?: string;
  kpiId?: string;
}

export function CommentTimeline({ objectiveId, kpiId }: CommentTimelineProps) {
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspace?.id);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  // `newComment` is the display text (`@Nombre`); `serialized` holds the
  // `@[Nombre](uuid)` tokens that get stored.
  const [newComment, setNewComment] = useState('');
  const [serialized, setSerialized] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadEntries = useCallback(async () => {
    const supabase = createClient();
    const allEntries: TimelineEntry[] = [];

    // Load comments
    let commentQuery = supabase.from('comments').select('*, user:profiles(*)');
    if (objectiveId) commentQuery = commentQuery.eq('objective_id', objectiveId);
    if (kpiId) commentQuery = commentQuery.eq('kpi_id', kpiId);
    const { data: comments } = await commentQuery.order('created_at', { ascending: false });

    if (comments) {
      for (const c of comments as (Comment & { user: Profile })[]) {
        allEntries.push({
          id: c.id,
          type: 'comment',
          user: c.user,
          content: c.content,
          created_at: c.created_at,
        });
      }
    }

    // Load progress logs
    let logQuery = supabase.from('progress_logs').select('*, user:profiles(*)');
    if (objectiveId) logQuery = logQuery.eq('objective_id', objectiveId);
    if (kpiId) logQuery = logQuery.eq('kpi_id', kpiId);
    const { data: logs } = await logQuery.order('created_at', { ascending: false });

    if (logs) {
      for (const l of logs as (ProgressLog & { user: Profile })[]) {
        allEntries.push({
          id: l.id,
          type: 'progress_log',
          user: l.user,
          content: `actualizó el progreso a ${l.new_value}%${l.comment ? ` — ${l.comment}` : ''}`,
          created_at: l.created_at,
        });
      }
    }

    allEntries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEntries(allEntries);
    setLoading(false);
  }, [objectiveId, kpiId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Live updates: new comments on this objective / KPI from other users.
  useLiveRefetch(
    `comment-timeline-${objectiveId ?? 'none'}-${kpiId ?? 'none'}`,
    objectiveId
      ? [{ table: 'comments', filter: `objective_id=eq.${objectiveId}` }]
      : kpiId
        ? [{ table: 'comments', filter: `kpi_id=eq.${kpiId}` }]
        : [],
    loadEntries,
  );

  // Workspace members for the @mention popover.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    async function loadMembers() {
      const supabase = createClient();
      const { data } = await supabase.from('user_workspaces').select('profile:profiles(*)').eq('workspace_id', workspaceId);
      if (cancelled) return;
      setMembers(
        ((data || []) as Array<{ profile: Profile | Profile[] | null }>)
          .map((uw) => (Array.isArray(uw.profile) ? uw.profile[0] ?? null : uw.profile))
          .filter((p): p is Profile => Boolean(p)),
      );
    }
    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    const content = serialized.trim();
    if (!content) return;
    setSubmitting(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    const commentData: Record<string, string | string[]> = {
      user_id: user.id,
      content,
      mentions: extractMentionIds(content),
    };
    if (objectiveId) commentData.objective_id = objectiveId;
    if (kpiId) commentData.kpi_id = kpiId;

    await supabase.from('comments').insert(commentData);
    setNewComment('');
    setSerialized('');
    setSubmitting(false);
    loadEntries();
  }

  return (
    <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
      <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Timeline</h2>

      {/* Comment form */}
      <form onSubmit={handleSubmitComment} style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '0.8rem' }}>
          <MentionTextarea
            value={newComment}
            onChange={(display, stored) => {
              setNewComment(display);
              setSerialized(stored);
            }}
            members={members}
            placeholder="Escribe un comentario... usa @ para mencionar"
            rows={2}
            disabled={submitting}
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !newComment.trim()}
          style={{
            padding: '0.6rem 1.6rem',
            fontSize: '1.3rem',
            fontWeight: 500,
            color: 'white',
            backgroundColor: submitting || !newComment.trim() ? '#8c92c4' : '#5c6ac4',
            border: 'none',
            borderRadius: '4px',
            cursor: submitting || !newComment.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Enviando...' : 'Comentar'}
        </button>
      </form>

      {/* Entries */}
      {loading ? (
        <p style={{ color: '#637381', fontSize: '1.3rem' }}>Cargando timeline...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: '#637381', fontSize: '1.3rem' }}>No hay actividad aún</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {entries.map((entry) => (
            <li key={entry.id} style={{ display: 'flex', gap: '1rem', padding: '1.2rem 0', borderBottom: '1px solid #f4f6f8' }}>
              <UserAvatar user={entry.user} size="small" />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36' }}>{entry.user.full_name}</span>
                  <span style={{ fontSize: '1.1rem', color: '#919eab' }}>{formatRelative(entry.created_at)}</span>
                </div>
                {entry.type === 'progress_log' ? (
                  <p style={{ fontSize: '1.3rem', color: '#637381', fontStyle: 'italic' }}>
                    {entry.content}
                  </p>
                ) : (
                  <p style={{ fontSize: '1.3rem', color: '#212b36', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderCommentContent(entry.content, members)}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
