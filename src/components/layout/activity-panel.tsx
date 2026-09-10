'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useActivityFeed, type EntityRef } from '@/hooks/use-activity-feed';
import { useNotifications } from '@/hooks/use-notifications';
import { useNotificationStore } from '@/stores/notification-store';
import type { Notification } from '@/types';
import { ActivityList } from './activity-list';

interface ActivityPanelProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string | undefined;
  /** Current user — needed to load their targeted notifications. */
  userId?: string;
}

/** Unread targeted notifications shown above the team feed. */
const MAX_PANEL_NOTIFICATIONS = 5;

/**
 * Right-side slide-in panel with the unified activity feed. Full viewport
 * height. Uses the shared anim-panel-enter / anim-panel-exit CSS classes so
 * the slide-in matches OkrDetailPanel. Closing waits for the exit animation
 * before unmounting.
 *
 * Body rendering lives in `activity-list.tsx` — the same component backs
 * the embedded feed at the bottom of /check-in.
 */
export function ActivityPanel({ open, onClose, workspaceId, userId }: ActivityPanelProps) {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = (params['workspace-slug'] as string) || '';
  const { markNotificationAsRead } = useNotifications(userId, workspaceId);
  const notifications = useNotificationStore((s) => s.notifications);
  const unread = notifications.filter((n) => !n.read).slice(0, MAX_PANEL_NOTIFICATIONS);

  // Same pattern as OkrDetailPanel: stay mounted until the exit animation
  // finishes so the slide-out actually plays.
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const { events, loading, refetch } = useActivityFeed(workspaceId);

  useEffect(() => {
    if (open) {
      setClosing(false);
      setShown(true);
      refetch();
    } else if (shown) {
      setClosing(true);
      const t = setTimeout(() => {
        setShown(false);
        setClosing(false);
      }, 260);
      return () => clearTimeout(t);
    }
  }, [open, shown, refetch]);

  useEffect(() => {
    if (!shown || closing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, closing, onClose]);

  if (!shown) return null;

  function handleEntityClick(ref: EntityRef) {
    onClose();
    if (!workspaceSlug) return;
    // Small delay so the panel starts closing before the route change fires.
    setTimeout(() => {
      if (ref.type === 'kpi') router.push(`/${workspaceSlug}/kpis/${ref.id}`);
      else if (ref.type === 'objective') router.push(`/${workspaceSlug}/objetivos/${ref.id}`);
      else if (ref.type === 'task') router.push(`/${workspaceSlug}/tareas/${ref.id}`);
    }, 40);
  }

  /** Targeted notification (task assigned / blocked / @mention…): mark as
   *  read and follow its `action_url` (DB triggers always populate it). */
  function handleNotificationClick(n: Notification) {
    void markNotificationAsRead(n.id);
    const url = n.action_url;
    // Only follow in-app paths: never let a stored URL send the user off-site.
    if (!url || !url.startsWith('/') || url.startsWith('//')) return;
    onClose();
    setTimeout(() => router.push(url), 40);
  }

  return (
    <>
      <div
        className={closing ? 'anim-backdrop-exit' : 'anim-backdrop'}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 200,
        }}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Actividad reciente"
        className={closing ? 'anim-panel-exit' : 'anim-panel-enter'}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(440px, 100%)',
          backgroundColor: '#ffffff',
          zIndex: 201,
          boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.2rem 1.6rem',
            borderBottom: '1px solid #dfe3e8',
            backgroundColor: '#fafbfb',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span
              style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#212b36',
              }}
            >
              Actividad
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1.15rem',
                color: '#de3618',
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: '0.8rem',
                  height: '0.8rem',
                  borderRadius: '999px',
                  backgroundColor: '#de3618',
                  boxShadow: '0 0 0 4px rgba(222,54,24,0.18)',
                }}
              />
              En vivo
            </span>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              width: '3.2rem',
              height: '3.2rem',
              display: 'grid',
              placeItems: 'center',
              border: 'none',
              background: 'transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#637381',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {unread.length > 0 && (
            <section aria-label="Notificaciones sin leer" style={{ borderBottom: '1px solid #dfe3e8', backgroundColor: '#f9fafb' }}>
              <div
                style={{
                  padding: '1rem 1.6rem 0.4rem',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#637381',
                }}
              >
                Para ti
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: '0 0.8rem 0.8rem' }}>
                {unread.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '1rem',
                        padding: '0.8rem',
                        border: 'none',
                        borderRadius: '6px',
                        background: 'transparent',
                        cursor: n.action_url ? 'pointer' : 'default',
                        textAlign: 'left',
                        font: 'inherit',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(92, 106, 196, 0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <span
                        aria-hidden
                        style={{ marginTop: '0.6rem', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#5c6ac4', flexShrink: 0 }}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '1.3rem', fontWeight: 600, color: '#212b36' }}>{n.title}</span>
                        {n.message && (
                          <span style={{ display: 'block', fontSize: '1.25rem', color: '#637381', marginTop: '0.2rem', wordBreak: 'break-word' }}>{n.message}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ActivityList
            events={events}
            loading={loading}
            onOpen={handleEntityClick}
            variant="panel"
          />
        </div>
      </aside>
    </>
  );
}
