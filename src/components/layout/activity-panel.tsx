'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useActivityFeed, type EntityRef } from '@/hooks/use-activity-feed';
import { ActivityList } from './activity-list';

interface ActivityPanelProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string | undefined;
}

/**
 * Right-side slide-in panel with the unified activity feed. Full viewport
 * height. Uses the shared anim-panel-enter / anim-panel-exit CSS classes so
 * the slide-in matches OkrDetailPanel. Closing waits for the exit animation
 * before unmounting.
 *
 * Body rendering lives in `activity-list.tsx` — the same component backs
 * the embedded feed at the bottom of /check-in.
 */
export function ActivityPanel({ open, onClose, workspaceId }: ActivityPanelProps) {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = (params['workspace-slug'] as string) || '';

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
      // Tasks don't have a dedicated page; route to their parent objective.
    }, 40);
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
