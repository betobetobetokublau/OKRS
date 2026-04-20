'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useActivityFeed, type ActivityEvent, type EntityRef } from '@/hooks/use-activity-feed';

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
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#637381', fontSize: '1.3rem' }}>
              Cargando actividad...
            </div>
          ) : events.length === 0 ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#637381', fontSize: '1.3rem' }}>
              No hay actividad reciente.
            </div>
          ) : (
            events.map((ev) => (
              <ActivityRow key={ev.id} event={ev} onOpen={handleEntityClick} />
            ))
          )}
        </div>
      </aside>
    </>
  );
}

// ──────────────── Row ────────────────

function ActivityRow({
  event,
  onOpen,
}: {
  event: ActivityEvent;
  onOpen: (ref: EntityRef) => void;
}) {
  const accent = accentFor(event.kind);
  const highlight = event.kind === 'task_completed' || event.kind === 'checkin';

  return (
    <article
      style={{
        padding: '1.2rem 1.6rem 1.2rem 1.3rem',
        borderBottom: '1px solid #f1f2f4',
        borderLeft: `3px solid ${accent}`,
        background: highlight ? 'rgba(80,184,60,0.04)' : 'transparent',
        display: 'grid',
        gridTemplateColumns: '28px 1fr',
        columnGap: '1rem',
        textAlign: 'left',
      }}
    >
      {/* Left column — kind-specific icon. Color-matches the accent bar
          so status is legible at a glance without needing to read text. */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.4rem', color: accent }}>
        <ActivityIcon kind={event.kind} />
      </div>

      {/* Right column — timestamp + event text + optional quote. All
          left-aligned; long entity names wrap beneath the line instead
          of center-aligning to the button default. */}
      <div style={{ textAlign: 'left', minWidth: 0 }}>
        <div style={{ fontSize: '1.1rem', color: '#919eab', marginBottom: '0.4rem' }}>
          {formatRelativeEs(event.timestamp)}
        </div>
        <div style={{ fontSize: '1.3rem', color: '#212b36', lineHeight: 1.55, textAlign: 'left' }}>
          <ActivityText event={event} onOpen={onOpen} />
        </div>
        {event.quote && (
          <div
            style={{
              marginTop: '0.8rem',
              padding: '0.6rem 1rem',
              backgroundColor: '#f4f6f8',
              borderLeft: '2px solid #c4cdd5',
              fontSize: '1.2rem',
              color: '#637381',
              fontStyle: 'italic',
              borderRadius: '2px',
              textAlign: 'left',
            }}
          >
            &ldquo;{event.quote}&rdquo;
          </div>
        )}
      </div>
    </article>
  );
}

// ──────────────── Icon per event kind ────────────────

function ActivityIcon({ kind }: { kind: ActivityEvent['kind'] }) {
  // Inline SVG path (24x24 viewBox). Uses stroke: currentColor so the
  // kind accent color bleeds through via the parent <div>.
  const path = (() => {
    switch (kind) {
      case 'task_completed':
        // check-circle
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12l3 3 5-6" />
          </>
        );
      case 'task_blocked':
        // shield with warning
        return (
          <>
            <path d="M12 3l8 3v6c0 4-3 7-8 9-5-2-8-5-8-9V6l8-3z" />
            <path d="M12 9v4" />
            <path d="M12 16.5v.01" />
          </>
        );
      case 'task_created':
        // checkbox plus
        return (
          <>
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M12 8v8M8 12h8" />
          </>
        );
      case 'objective_created':
        // flag
        return (
          <>
            <path d="M5 3v18" />
            <path d="M5 4h11l-2 4 2 4H5" />
          </>
        );
      case 'kpi_created':
        // star / target
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.5" />
          </>
        );
      case 'progress_log':
        // trending-up
        return (
          <>
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
          </>
        );
      case 'comment':
        // speech bubble
        return (
          <>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </>
        );
      case 'checkin':
        // calendar-check
        return (
          <>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <path d="M9 16l2 2 4-4" />
          </>
        );
      default:
        return <circle cx="12" cy="12" r="4" />;
    }
  })();
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

function ActivityText({
  event,
  onOpen,
}: {
  event: ActivityEvent;
  onOpen: (ref: EntityRef) => void;
}) {
  const actor = event.actor?.full_name?.split(' ')[0] || 'Alguien';
  const kind = event.kind;

  // NOTE: prop is named `entity`, not `ref`. `ref` is a React-reserved
  // prop name — React strips it from a regular function component's
  // props object, so the component would receive `undefined` and the
  // children read would crash with "Cannot read properties of undefined".
  function EntityLink({ entity }: { entity: EntityRef }) {
    return (
      <button
        type="button"
        onClick={() => onOpen(entity)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: '#5c6ac4',
          fontWeight: 500,
          cursor: 'pointer',
          textDecoration: 'none',
          // Default <button> text-align is center; force left so long
          // entity titles wrap against the left edge instead of
          // centering each line.
          textAlign: 'left',
          display: 'inline',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none';
        }}
      >
        {entity.title}
      </button>
    );
  }

  if (kind === 'progress_log' && event.target) {
    const hasPct = typeof event.progressPct === 'number';
    return (
      <>
        <b>{actor}</b> actualizó progreso de <EntityLink entity={event.target} />
        {hasPct ? <> a <b>{Math.round(event.progressPct as number)}%</b></> : null}
      </>
    );
  }

  if (kind === 'comment' && event.target) {
    return (
      <>
        <b>{actor}</b> comentó en <EntityLink entity={event.target} />
      </>
    );
  }

  if (kind === 'objective_created' && event.target) {
    return (
      <>
        <b>{actor}</b> creó el objetivo <EntityLink entity={event.target} />
      </>
    );
  }

  if (kind === 'kpi_created' && event.target) {
    return (
      <>
        <b>{actor}</b> creó el KPI <EntityLink entity={event.target} />
      </>
    );
  }

  if (kind === 'task_created' && event.target && event.parent) {
    return (
      <>
        <b>{actor}</b> creó la tarea <EntityLink entity={event.target} /> en{' '}
        <EntityLink entity={event.parent} />
      </>
    );
  }

  if (kind === 'task_completed' && event.target && event.parent) {
    return (
      <>
        <b>{actor}</b> completó la tarea <EntityLink entity={event.target} /> en{' '}
        <EntityLink entity={event.parent} />
      </>
    );
  }

  if (kind === 'task_blocked' && event.target && event.parent) {
    return (
      <>
        <b>{actor}</b> marcó como bloqueada <EntityLink entity={event.target} /> en{' '}
        <EntityLink entity={event.parent} />
      </>
    );
  }

  if (kind === 'checkin') {
    return (
      <>
        <b>{actor}</b> hizo check-in
      </>
    );
  }

  return <span>{actor}</span>;
}

// ──────────────── helpers ────────────────

/**
 * Coloured left border per event kind. Green for completions, indigo for
 * progress/comments/creations, red for blockers.
 */
function accentFor(kind: ActivityEvent['kind']): string {
  switch (kind) {
    case 'task_completed':
      return '#50b83c';
    case 'task_blocked':
      return '#de3618';
    case 'task_created':
    case 'objective_created':
    case 'kpi_created':
      return '#5c6ac4';
    case 'comment':
      return '#637381';
    case 'progress_log':
      return '#47c1bf';
    case 'checkin':
      return '#5c6ac4';
    default:
      return '#dfe3e8';
  }
}

/**
 * Spanish relative time formatter. Renders "hace 4 min", "hace 2 h",
 * "ayer 17:10", "3 d". Doesn't localize week / month boundaries — falls
 * back to absolute date at 14+ days.
 */
function formatRelativeEs(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (diffSec < 60) return 'justo ahora';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 22) return `hace ${diffH} h`;
  // yesterday: show "ayer HH:MM"
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d >= yesterday && d < new Date(yesterday.getTime() + 86400000)) {
    return `ayer ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const diffD = Math.floor((now - d.getTime()) / 86400000);
  if (diffD < 14) return `${diffD} d`;
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
