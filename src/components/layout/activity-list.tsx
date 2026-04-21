'use client';

import type { ActivityEvent, EntityRef } from '@/hooks/use-activity-feed';

/**
 * Shared activity-timeline list renderer. The bell-icon slide-in panel
 * (`activity-panel.tsx`) and the embedded feed at the bottom of the
 * `/check-in` view both use this. Consumers own data loading (via
 * `useActivityFeed`) and supply an `onOpen` handler to route to the
 * clicked entity.
 *
 * Variant controls the chrome:
 *   - `panel`  (default) — row borders + kind-colored left accent strip,
 *                          green tint on completions/check-ins. This is
 *                          the look used inside the slide-in panel.
 *   - `embed`              transparent, subtle bottom borders only, no
 *                          left accent bar. Meant for in-page embedding
 *                          where the list must sit flat on the page bg.
 */
export type ActivityListVariant = 'panel' | 'embed';

interface ActivityListProps {
  events: ActivityEvent[];
  loading: boolean;
  onOpen: (ref: EntityRef) => void;
  variant?: ActivityListVariant;
  emptyLabel?: string;
}

export function ActivityList({
  events,
  loading,
  onOpen,
  variant = 'panel',
  emptyLabel = 'No hay actividad reciente.',
}: ActivityListProps) {
  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#637381', fontSize: '1.3rem' }}>
        Cargando actividad...
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#637381', fontSize: '1.3rem' }}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <>
      {events.map((ev) => (
        <ActivityRow key={ev.id} event={ev} onOpen={onOpen} variant={variant} />
      ))}
    </>
  );
}

// ──────────────── Row ────────────────

function ActivityRow({
  event,
  onOpen,
  variant,
}: {
  event: ActivityEvent;
  onOpen: (ref: EntityRef) => void;
  variant: ActivityListVariant;
}) {
  const accent = accentFor(event.kind);
  const highlight = event.kind === 'task_completed' || event.kind === 'checkin';
  const isEmbed = variant === 'embed';

  // Panel variant carries the kind-colored accent strip on the left and a
  // subtle green tint for "positive" events. Embed variant stays flat so
  // it blends into the page background; it only keeps a subtle bottom
  // divider between rows.
  const borderLeft = isEmbed ? 'none' : `3px solid ${accent}`;
  const background = !isEmbed && highlight ? 'rgba(80,184,60,0.04)' : 'transparent';
  const paddingLeft = isEmbed ? '0' : '1.3rem';
  const paddingRight = isEmbed ? '0' : '1.6rem';
  const borderBottom = isEmbed ? '1px solid #edeff2' : '1px solid #f1f2f4';

  return (
    <article
      style={{
        padding: `1.2rem ${paddingRight} 1.2rem ${paddingLeft}`,
        borderBottom,
        borderLeft,
        background,
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

      {/* Right column — event text FIRST (so the title aligns with the
          icon at the top), timestamp underneath. */}
      <div style={{ textAlign: 'left', minWidth: 0 }}>
        <div style={{ fontSize: '1.3rem', color: '#212b36', lineHeight: 1.55, textAlign: 'left' }}>
          <ActivityText event={event} onOpen={onOpen} />
        </div>
        <div style={{ fontSize: '1.1rem', color: '#919eab', marginTop: '0.3rem' }}>
          {formatRelativeEs(event.timestamp)}
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
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12l3 3 5-6" />
          </>
        );
      case 'task_blocked':
        return (
          <>
            <path d="M12 3l8 3v6c0 4-3 7-8 9-5-2-8-5-8-9V6l8-3z" />
            <path d="M12 9v4" />
            <path d="M12 16.5v.01" />
          </>
        );
      case 'task_created':
        return (
          <>
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M12 8v8M8 12h8" />
          </>
        );
      case 'objective_created':
        return (
          <>
            <path d="M5 3v18" />
            <path d="M5 4h11l-2 4 2 4H5" />
          </>
        );
      case 'kpi_created':
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.5" />
          </>
        );
      case 'progress_log':
        return (
          <>
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
          </>
        );
      case 'comment':
        return (
          <>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </>
        );
      case 'checkin':
        return (
          <>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <path d="M9 16l2 2 4-4" />
          </>
        );
      case 'checkin_progress':
        // trending-up — mirrors the progress_log icon; the label
        // differentiates the two at read time.
        return (
          <>
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
          </>
        );
      case 'checkin_status':
        // refresh-cw — signals a state transition
        return (
          <>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
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

  if (kind === 'checkin_progress' && event.target) {
    const hasPct = typeof event.progressPct === 'number';
    return (
      <>
        <b>{actor}</b> actualizó progreso de <EntityLink entity={event.target} />
        {hasPct ? <> a <b>{Math.round(event.progressPct as number)}%</b></> : null}
      </>
    );
  }

  if (kind === 'checkin_status' && event.target) {
    return (
      <>
        <b>{actor}</b> cambió estado de <EntityLink entity={event.target} />
        {event.statusLabel ? <> a <b>{event.statusLabel}</b></> : null}
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
    case 'checkin_progress':
      return '#47c1bf';
    case 'checkin':
    case 'checkin_status':
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
