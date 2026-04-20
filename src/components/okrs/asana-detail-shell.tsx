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
      {breadcrumb && breadcrumb.length > 0 && (
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
                borderBottom: i < fields.length - 1 ? '1px solid #f1f2f4' : 'none',
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
