'use client';

import { useMemo, useState } from 'react';
import type { Department, Period } from '@/types';
import type { ObjectiveRow } from '@/hooks/use-objectives-table';
import type { PanelTarget } from '@/components/okrs/okr-detail-panel';

/**
 * Gantt view for /objetivos.
 *
 * Each objective is rendered as a horizontal bar placed on a time axis derived
 * from `start_date` / `end_date`. The axis is driven by two controls:
 *   - Zoom: the visible time window (active period by default, or a preset
 *     rolling window like "próximos 3 meses").
 *   - Frequency: the cohort size used to divide the axis and draw vertical
 *     gridlines and X labels. Changing frequency re-renders ticks and the
 *     dashed cohort dividers inside every row track.
 *
 * Clicking the objective title opens the shared OkrDetailPanel (same panel
 * used by Listado / Skill Tree views).
 */

type ZoomKey = 'period' | 'month' | 'quarter' | 'six';
type Frequency = 'week' | '2weeks' | 'month' | '3months';

const MONTHS_ES_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

interface ObjectivesGanttProps {
  rows: ObjectiveRow[];
  departments: Department[];
  activePeriod: Period | null;
  onOpenPanel: (t: PanelTarget) => void;
}

interface TimeWindow {
  start: Date;
  end: Date;
  label: string;
}

interface Cohort {
  start: Date;
  end: Date;
  label: string;
  sub: string;
  leftPct: number;
  widthPct: number;
}

function getProgress(o: ObjectiveRow): number {
  return o.computed_progress ?? o.manual_progress ?? 0;
}

function statusKind(o: ObjectiveRow): 'in_progress' | 'success' | 'danger' | 'paused' | 'upcoming' {
  if (o.status === 'paused' || o.status === 'deprecated') return 'paused';
  if (o.status === 'upcoming') return 'upcoming';
  const p = getProgress(o);
  if (p >= 100) return 'success';
  // "behind": past halfway elapsed AND <50% progress
  if (o.start_date && o.end_date) {
    const start = new Date(o.start_date).getTime();
    const end = new Date(o.end_date).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const elapsed = (Date.now() - start) / (end - start);
      if (elapsed > 0.5 && p < 50) return 'danger';
    }
  }
  if (p >= 85) return 'success';
  return 'in_progress';
}

function barColor(kind: ReturnType<typeof statusKind>): string {
  switch (kind) {
    case 'success': return '#50b83c';
    case 'danger': return '#de3618';
    case 'paused': return '#919eab';
    case 'upcoming': return '#47c1bf';
    default: return '#5c6ac4';
  }
}

function computeWindow(zoomKey: ZoomKey, activePeriod: Period | null): TimeWindow {
  const now = new Date();
  if (zoomKey === 'period' && activePeriod) {
    return {
      start: new Date(activePeriod.start_date),
      end: new Date(activePeriod.end_date),
      label: activePeriod.name,
    };
  }
  if (zoomKey === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end, label: 'Este mes' };
  }
  if (zoomKey === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0);
    return { start, end, label: 'Este trimestre' };
  }
  // six months rolling (3 past, 3 future)
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 4, 0);
  return { start, end, label: '6 meses' };
}

function frequencyDays(f: Frequency): number {
  switch (f) {
    case 'week': return 7;
    case '2weeks': return 14;
    case 'month': return 30;
    case '3months': return 91;
  }
}

function buildCohorts(window: TimeWindow, freq: Frequency): Cohort[] {
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  const totalMs = endMs - startMs;
  if (totalMs <= 0) return [];

  const cohorts: Cohort[] = [];

  if (freq === 'month' || freq === '3months') {
    // Calendar-aligned: iterate months. For 3months, skip by 3.
    const step = freq === 'month' ? 1 : 3;
    const cursor = new Date(window.start.getFullYear(), window.start.getMonth(), 1);
    while (cursor.getTime() <= endMs) {
      const chunkStart = new Date(cursor);
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
      const chunkEnd = new Date(Math.min(next.getTime() - 1, endMs));
      const clampedStart = new Date(Math.max(chunkStart.getTime(), startMs));
      const leftPct = ((clampedStart.getTime() - startMs) / totalMs) * 100;
      const widthPct = ((chunkEnd.getTime() - clampedStart.getTime()) / totalMs) * 100;
      const label = freq === 'month'
        ? MONTHS_ES_SHORT[chunkStart.getMonth()]
        : `Q${Math.floor(chunkStart.getMonth() / 3) + 1}`;
      const sub = freq === 'month'
        ? `${chunkStart.getFullYear()}`
        : `${MONTHS_ES_SHORT[chunkStart.getMonth()]}–${MONTHS_ES_SHORT[Math.min(chunkStart.getMonth() + 2, 11)]}`;
      cohorts.push({ start: clampedStart, end: chunkEnd, label, sub, leftPct, widthPct });
      cursor.setMonth(cursor.getMonth() + step);
    }
    return cohorts;
  }

  // Week-aligned: start on the Monday at-or-before window.start.
  const days = frequencyDays(freq);
  const cursor = new Date(window.start);
  const dow = cursor.getDay(); // 0 = Sun, 1 = Mon
  const daysBackToMonday = (dow + 6) % 7;
  cursor.setDate(cursor.getDate() - daysBackToMonday);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= endMs) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor.getTime() + days * 86400000 - 1);
    const clampedStart = new Date(Math.max(chunkStart.getTime(), startMs));
    const clampedEnd = new Date(Math.min(chunkEnd.getTime(), endMs));
    if (clampedEnd.getTime() < clampedStart.getTime()) break;
    const leftPct = ((clampedStart.getTime() - startMs) / totalMs) * 100;
    const widthPct = ((clampedEnd.getTime() - clampedStart.getTime()) / totalMs) * 100;
    const weekNum = isoWeek(clampedStart);
    const label = MONTHS_ES_SHORT[clampedStart.getMonth()];
    const sub = freq === 'week' ? `sem ${weekNum}` : `sem ${weekNum}–${isoWeek(clampedEnd)}`;
    cohorts.push({ start: clampedStart, end: clampedEnd, label, sub, leftPct, widthPct });
    cursor.setDate(cursor.getDate() + days);
  }
  return cohorts;
}

function isoWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 86400000));
}

function formatDayShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_ES_SHORT[d.getMonth()]}`;
}

export function ObjectivesGantt({
  rows,
  departments,
  activePeriod,
  onOpenPanel,
}: ObjectivesGanttProps) {
  const [deptFilter, setDeptFilter] = useState<string | 'all'>('all');
  const [zoomKey, setZoomKey] = useState<ZoomKey>('period');
  const [frequency, setFrequency] = useState<Frequency>('2weeks');

  const window = useMemo(() => computeWindow(zoomKey, activePeriod), [zoomKey, activePeriod]);
  const cohorts = useMemo(() => buildCohorts(window, frequency), [window, frequency]);
  const totalMs = window.end.getTime() - window.start.getTime();

  // Today marker: only render if within window.
  const todayPct = useMemo(() => {
    const now = Date.now();
    if (now < window.start.getTime() || now > window.end.getTime()) return null;
    return ((now - window.start.getTime()) / totalMs) * 100;
  }, [window, totalMs]);

  const { visible, undated, outOfWindow } = useMemo(() => {
    const v: ObjectiveRow[] = [];
    let u = 0;
    let o = 0;
    rows.forEach((r) => {
      if (!r.start_date || !r.end_date) {
        u += 1;
        return;
      }
      if (deptFilter !== 'all' && r.responsible_department_id !== deptFilter) return;
      const rs = new Date(r.start_date).getTime();
      const re = new Date(r.end_date).getTime();
      if (re < window.start.getTime() || rs > window.end.getTime()) {
        o += 1;
        return;
      }
      v.push(r);
    });
    return { visible: v, undated: u, outOfWindow: o };
  }, [rows, deptFilter, window]);

  if (!activePeriod) {
    return (
      <div
        className="Polaris-Card"
        style={{
          padding: '4rem',
          textAlign: 'center',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
        }}
      >
        <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.8rem',
          alignItems: 'center',
        }}
      >
        <ToolbarSelect
          label="Zoom"
          value={zoomKey}
          onChange={(v) => setZoomKey(v as ZoomKey)}
          options={[
            { value: 'period', label: activePeriod ? activePeriod.name : 'Periodo activo' },
            { value: 'month', label: 'Este mes' },
            { value: 'quarter', label: 'Este trimestre' },
            { value: 'six', label: '6 meses (rolling)' },
          ]}
        />
        <ToolbarSelect
          label="Frecuencia"
          value={frequency}
          onChange={(v) => setFrequency(v as Frequency)}
          options={[
            { value: 'week', label: '1 semana' },
            { value: '2weeks', label: '2 semanas' },
            { value: 'month', label: '1 mes' },
            { value: '3months', label: '3 meses' },
          ]}
        />
        <ToolbarSelect
          label="Departamento"
          value={deptFilter}
          onChange={(v) => setDeptFilter(v)}
          options={[
            { value: 'all', label: 'Todos' },
            ...departments.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '1.2rem', color: '#637381' }}>
          {visible.length} objetivos
          {outOfWindow > 0 && ` · ${outOfWindow} fuera del rango`}
          {undated > 0 && ` · ${undated} sin fechas`}
        </span>
      </div>

      {/* Gantt */}
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {/* Header row: axis */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '280px 1fr',
            backgroundColor: '#fafbfb',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              padding: '1rem 1.4rem',
              fontSize: '1.1rem',
              fontWeight: 600,
              color: '#637381',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            Objetivo
          </div>
          <div style={{ position: 'relative', minHeight: '44px' }}>
            {cohorts.map((c, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${c.leftPct}%`,
                  width: `${c.widthPct}%`,
                  padding: '0.8rem 0.6rem',
                  borderRight: i === cohorts.length - 1 ? 'none' : '1px solid var(--color-border)',
                  textAlign: 'center',
                  fontSize: '1.15rem',
                  color: '#637381',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{ fontWeight: 500 }}>{c.label}</div>
                <div style={{ fontSize: '1.0rem', color: '#919eab', marginTop: '1px' }}>{c.sub}</div>
              </div>
            ))}
            {todayPct != null && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${todayPct}%`,
                    width: 2,
                    marginLeft: -1,
                    backgroundColor: '#de3618',
                    zIndex: 2,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: `${todayPct}%`,
                    transform: 'translateX(-50%)',
                    backgroundColor: '#de3618',
                    color: 'white',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '3px',
                    zIndex: 3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Hoy
                </div>
              </>
            )}
          </div>
        </div>

        {/* Rows */}
        {visible.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#637381', fontSize: '1.3rem' }}>
            No hay objetivos con fechas en el rango seleccionado.
            {undated > 0 && ` (${undated} objetivos sin fechas están ocultos.)`}
          </div>
        ) : (
          visible.map((o) => (
            <GanttRow
              key={o.id}
              objective={o}
              departments={departments}
              cohorts={cohorts}
              windowStart={window.start}
              windowEnd={window.end}
              todayPct={todayPct}
              onOpenPanel={onOpenPanel}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------- Row ----------

function GanttRow({
  objective,
  departments,
  cohorts,
  windowStart,
  windowEnd,
  todayPct,
  onOpenPanel,
}: {
  objective: ObjectiveRow;
  departments: Department[];
  cohorts: Cohort[];
  windowStart: Date;
  windowEnd: Date;
  todayPct: number | null;
  onOpenPanel: (t: PanelTarget) => void;
}) {
  const totalMs = windowEnd.getTime() - windowStart.getTime();
  const objStart = new Date(objective.start_date!).getTime();
  const objEnd = new Date(objective.end_date!).getTime();
  const clampedStart = Math.max(objStart, windowStart.getTime());
  const clampedEnd = Math.min(objEnd, windowEnd.getTime());
  const leftPct = ((clampedStart - windowStart.getTime()) / totalMs) * 100;
  const widthPct = Math.max(0.5, ((clampedEnd - clampedStart) / totalMs) * 100);
  const progress = getProgress(objective);
  const kind = statusKind(objective);
  const bg = barColor(kind);

  const dept = departments.find((d) => d.id === objective.responsible_department_id);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        borderBottom: '1px solid var(--color-border)',
        minHeight: '56px',
      }}
    >
      {/* Label cell */}
      <div
        style={{
          padding: '1rem 1.4rem',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => onOpenPanel({ type: 'objective', id: objective.id })}
          title={objective.title}
          style={{
            padding: 0,
            margin: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '1.3rem',
            fontWeight: 600,
            color: '#212b36',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#5c6ac4';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#212b36';
          }}
        >
          {objective.title}
        </button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '1.1rem', color: '#637381' }}>
          {dept && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: dept.color || '#919eab',
                }}
              />
              {dept.name}
            </span>
          )}
          {objective.responsible_user?.full_name && (
            <>
              {dept && <span style={{ color: '#c4cdd5' }}>·</span>}
              <span>{objective.responsible_user.full_name}</span>
            </>
          )}
        </div>
      </div>

      {/* Track */}
      <div style={{ position: 'relative' }}>
        {/* Cohort dividers */}
        {cohorts.map((c, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${c.leftPct + c.widthPct}%`,
              width: 0,
              borderLeft: i === cohorts.length - 1 ? 'none' : '1px dashed var(--color-border)',
            }}
          />
        ))}

        {/* Today marker */}
        {todayPct != null && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${todayPct}%`,
              width: 2,
              marginLeft: -1,
              backgroundColor: '#de3618',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Bar */}
        <button
          type="button"
          onClick={() => onOpenPanel({ type: 'objective', id: objective.id })}
          title={`${objective.title} — ${formatDayShort(new Date(objStart))} → ${formatDayShort(
            new Date(objEnd),
          )} · ${progress}%`}
          style={{
            position: 'absolute',
            top: 12,
            bottom: 12,
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            padding: '0 10px',
            borderRadius: 6,
            border: 'none',
            backgroundColor: bg,
            color: 'white',
            cursor: 'pointer',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'inherit',
            fontSize: '1.1rem',
            fontWeight: 500,
          }}
        >
          {/* Progress overlay */}
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.max(0, Math.min(100, progress))}%`,
              backgroundColor: 'rgba(255,255,255,0.18)',
              borderRight: progress > 0 && progress < 100 ? '2px solid rgba(255,255,255,0.5)' : 'none',
              pointerEvents: 'none',
            }}
          />
          <span style={{ position: 'relative', zIndex: 1, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {progress}%
          </span>
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontSize: '1.05rem',
            }}
          >
            {formatDayShort(new Date(objStart))} → {formatDayShort(new Date(objEnd))}
          </span>
        </button>
      </div>
    </div>
  );
}

// ---------- Toolbar select ----------

function ToolbarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.6rem',
        fontSize: '1.2rem',
        color: '#637381',
      }}
    >
      <span style={{ fontWeight: 500 }}>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: '28px',
          padding: '0 2.4rem 0 0.8rem',
          fontSize: '1.2rem',
          fontFamily: 'inherit',
          color: '#212b36',
          backgroundColor: 'white',
          border: '1px solid #c4cdd5',
          borderRadius: '4px',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 4l3 3 3-3' stroke='%23637381' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.8rem center',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
