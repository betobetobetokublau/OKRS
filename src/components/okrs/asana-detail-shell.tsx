'use client';

import React from 'react';

/**
 * Shared visual scaffold for KPI / Objective / Task detail views.
 *
 * Layout:
 *   Breadcrumb (parent entity, clickable)
 *   Title + Edit button
 *   Fields table (label-left / value-right rows)
 *   Children (custom sections — Progress, Description, Subtasks, Timeline)
 *
 * Each body (KpiDetailPanelBody, ObjectiveDetailPanelBody, TaskDetailPanelBody,
 * KPIDetail, ObjectiveDetail) composes this shell with its own data.
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface FieldRow {
  label: string;
  value: React.ReactNode;
}

interface AsanaDetailShellProps {
  breadcrumb?: BreadcrumbItem[];
  /**
   * Custom node rendered in place of the breadcrumb. Useful when the
   * parent context is best surfaced as colored chips or another
   * non-text element. Takes precedence over `breadcrumb` when set.
   */
  breadcrumbContent?: React.ReactNode;
  title: string;
  titleAfter?: React.ReactNode;
  onEdit?: () => void;
  fields: FieldRow[];
  children?: React.ReactNode;
  maxWidth?: number | string;
}

const MONTHS_ES_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

export function AsanaDetailShell({
  breadcrumb,
  breadcrumbContent,
  title,
  titleAfter,
  onEdit,
  fields,
  children,
  maxWidth,
}: AsanaDetailShellProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        maxWidth: maxWidth ?? 'none',
      }}
    >
      {breadcrumbContent ? (
        <nav aria-label="Ubicación">{breadcrumbContent}</nav>
      ) : breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Ubicación" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
          {breadcrumb.map((item, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {item.href || item.onClick ? (
                <a
                  href={item.href || '#'}
                  onClick={(e) => {
                    if (item.onClick) {
                      e.preventDefault();
                      item.onClick();
                    }
                  }}
                  style={{
                    color: '#637381',
                    fontSize: '1.3rem',
                    textDecoration: 'none',
                    padding: '0.2rem 0',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = '#5c6ac4';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = '#637381';
                  }}
                >
                  {item.label}
                </a>
              ) : (
                <span style={{ color: '#637381', fontSize: '1.3rem' }}>{item.label}</span>
              )}
              {i < breadcrumb.length - 1 && (
                <span style={{ color: '#c4cdd5', fontSize: '1.3rem', padding: '0 0.8rem' }}>›</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: '2.4rem',
              fontWeight: 600,
              color: '#212b36',
              lineHeight: 1.25,
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h1>
          {titleAfter}
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            style={{
              padding: '0.6rem 1.4rem',
              fontSize: '1.3rem',
              fontWeight: 500,
              color: '#5c6ac4',
              backgroundColor: '#f4f5fc',
              border: '1px solid #e3e5f1',
              borderRadius: '4px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Editar
          </button>
        )}
      </div>

      {fields.length > 0 && (
        <div role="list" style={{ display: 'flex', flexDirection: 'column' }}>
          {fields.map((f, i) => (
            <div
              key={i}
              role="listitem"
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr',
                gap: '1.2rem',
                padding: '0.8rem 0',
                alignItems: 'center',
                minHeight: '3.6rem',
              }}
            >
              <div style={{ fontSize: '1.3rem', color: '#637381', fontWeight: 500 }}>{f.label}</div>
              <div style={{ fontSize: '1.3rem', color: '#212b36', minWidth: 0 }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}

// ---------- Section container ----------

interface AsanaSectionProps {
  title?: string;
  count?: number | string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** When true, keeps the section title but drops the surrounding card. */
  plain?: boolean;
}

export function AsanaSection({ title, count, action, children, plain }: AsanaSectionProps) {
  const inner = (
    <>
      {(title || action) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: plain ? '0.8rem' : '1.2rem',
          }}
        >
          {title && (
            <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36', margin: 0 }}>
              {title}
              {count !== undefined && (
                <span
                  style={{
                    marginLeft: '0.8rem',
                    fontSize: '1.2rem',
                    color: '#919eab',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {count}
                </span>
              )}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </>
  );
  if (plain) {
    return <section>{inner}</section>;
  }
  return (
    <section
      className="Polaris-Card"
      style={{
        padding: '1.6rem',
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
      }}
    >
      {inner}
    </section>
  );
}

// ---------- Field value helpers ----------

export function AsanaEmpty({ children = 'Sin asignar' }: { children?: React.ReactNode }) {
  return <span style={{ color: '#919eab' }}>{children}</span>;
}

export function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS_ES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function AsanaDueDateValue({
  iso,
  overdue,
}: {
  iso: string | null;
  overdue?: boolean;
}) {
  const formatted = formatShortDate(iso);
  if (!formatted) return <AsanaEmpty>Sin fecha</AsanaEmpty>;
  return (
    <span style={{ color: overdue ? '#de3618' : '#212b36', fontWeight: overdue ? 600 : 400 }}>
      {formatted}
      {overdue && <span style={{ marginLeft: '0.6rem', fontSize: '1.1rem' }}>— Vencida</span>}
    </span>
  );
}

/**
 * Static, non-interactive progress bar used inside the "Progreso"
 * card when its mode is auto. Same height as a normal slider track
 * but colored with the editable variant's accent so the read-only
 * state still reads as part of the same family.
 */
export function ProgressFillBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        width: '100%',
        height: '8px',
        backgroundColor: '#e4e5e7',
        borderRadius: '999px',
        overflow: 'hidden',
      }}
      aria-hidden
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          backgroundColor: '#5c6ac4',
          borderRadius: '999px',
        }}
      />
    </div>
  );
}

/**
 * Progress bar used in the "Objetivos vinculados" list inside the KPI
 * detail panel. The numeric percentage label lives INSIDE the gray
 * track (8px from the left edge), the fill height matches the
 * container exactly, and corners are pill-rounded.
 */
export function LinkedObjectiveProgress({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  // Color ramp matches the rest of the app's progress styling: red →
  // amber → green at 40 / 70.
  const fill =
    clamped < 40 ? '#de3618' : clamped < 70 ? '#eec200' : '#50b83c';
  // Tall enough to host the inline numeric label without crowding the
  // fill colour. Pill border-radius keeps both ends visually rounded.
  const HEIGHT = 18;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: `${HEIGHT}px`,
        backgroundColor: '#e4e5e7',
        borderRadius: '999px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          right: 'auto',
          width: `${clamped}%`,
          backgroundColor: fill,
          borderRadius: '999px',
        }}
        aria-hidden
      />
      <span
        style={{
          position: 'absolute',
          left: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '1.1rem',
          fontWeight: 600,
          color: '#212b36',
          fontVariantNumeric: 'tabular-nums',
          // Above the fill in stacking order so the label stays
          // legible even when the fill crosses behind it.
          zIndex: 1,
        }}
      >
        {clamped}%
      </span>
    </div>
  );
}

/** Date range shown as "1 abr – 30 jun 2026", for objectives with a planning window. */
export function AsanaDateRangeValue({
  startIso,
  endIso,
}: {
  startIso: string | null;
  endIso: string | null;
}) {
  if (!startIso && !endIso) return <AsanaEmpty>Sin fechas</AsanaEmpty>;
  if (startIso && !endIso) return <span>{`desde ${formatShortDate(startIso)}`}</span>;
  if (!startIso && endIso) return <span>{`hasta ${formatShortDate(endIso)}`}</span>;
  return <span>{`${formatShortDate(startIso)} – ${formatShortDate(endIso)}`}</span>;
}
