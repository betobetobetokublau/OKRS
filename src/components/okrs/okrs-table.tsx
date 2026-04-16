'use client';

import { useState } from 'react';
import type { Task } from '@/types';
import type { KPIWithObjectives, ObjectiveWithTasks } from '@/hooks/use-okrs';

// ---------- Helpers ----------

function getKpiProgress(kpi: KPIWithObjectives): number {
  return kpi.computed_progress ?? kpi.manual_progress ?? 0;
}

function getObjectiveProgress(o: ObjectiveWithTasks): number {
  return o.computed_progress ?? o.manual_progress ?? 0;
}

function getTaskProgress(t: Task): number {
  return t.status === 'completed' ? 100 : 0;
}

interface StatusChip {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}

function kpiStatusFromProgress(progress: number): StatusChip {
  if (progress >= 100) return { label: 'Logrado', bg: '#e3f1df', fg: '#108043', dot: '#108043' };
  if (progress >= 70) return { label: 'On track', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
  if (progress >= 40) return { label: 'En progreso', bg: '#fcf1cd', fg: '#8a6116', dot: '#eec200' };
  return { label: 'Off track', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
}

function objectiveStatus(status: string): StatusChip {
  switch (status) {
    case 'in_progress':
      return { label: 'En progreso', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
    case 'paused':
      return { label: 'En pausa', bg: '#fcf1cd', fg: '#8a6116', dot: '#eec200' };
    case 'deprecated':
      return { label: 'Deprecado', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
    case 'upcoming':
      return { label: 'Próximo', bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
    default:
      return { label: status, bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
  }
}

function taskStatus(status: string): StatusChip {
  switch (status) {
    case 'completed':
      return { label: 'Completada', bg: '#e3f1df', fg: '#108043', dot: '#108043' };
    case 'in_progress':
      return { label: 'En progreso', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
    case 'pending':
      return { label: 'Pendiente', bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
    case 'blocked':
      return { label: 'Bloqueada', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
    default:
      return { label: status, bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
  }
}

// ---------- Cell renderers ----------

function TypeBadge({ type }: { type: 'kpi' | 'objective' | 'task' }) {
  const map = {
    kpi: { label: 'KPI', bg: '#ede7ff', fg: '#5c3fba', icon: '📊' },
    objective: { label: 'Objetivo', bg: '#e0f2ff', fg: '#084c8f', icon: '🎯' },
    task: { label: 'Tarea', bg: '#ffeadf', fg: '#8a3e12', icon: '📌' },
  }[type];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.2rem 0.8rem',
        borderRadius: '10rem',
        backgroundColor: map.bg,
        color: map.fg,
        fontSize: '1.2rem',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden>{map.icon}</span>
      {map.label}
    </span>
  );
}

function StatusBadge({ chip }: { chip: StatusChip }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.2rem 0.8rem',
        borderRadius: '10rem',
        backgroundColor: chip.bg,
        color: chip.fg,
        fontSize: '1.2rem',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '0.8rem',
          height: '0.8rem',
          borderRadius: '50%',
          backgroundColor: chip.dot,
        }}
      />
      {chip.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  let fill = '#50b83c';
  if (pct < 40) fill = '#de3618';
  else if (pct < 70) fill = '#eec200';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: '14rem' }}>
      <div
        style={{
          flex: 1,
          height: '0.8rem',
          borderRadius: '10rem',
          backgroundColor: '#e4e5e7',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: fill,
            borderRadius: '10rem',
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <span style={{ fontSize: '1.2rem', color: '#454f5b', minWidth: '3.5rem', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  );
}

function TeamChip({ name, color }: { name: string; color?: string | null }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.2rem 0.8rem',
        borderRadius: '10rem',
        backgroundColor: '#f4f6f8',
        color: '#212b36',
        fontSize: '1.2rem',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        border: '1px solid #dfe3e8',
      }}
    >
      <span
        style={{
          width: '0.8rem',
          height: '0.8rem',
          borderRadius: '50%',
          backgroundColor: color || '#919eab',
        }}
      />
      {name}
    </span>
  );
}

// ---------- Table rows ----------

const CHEVRON_RIGHT = 'M9 5l7 7-7 7';
const CHEVRON_DOWN = 'M19 9l-7 7-7-7';

function Chevron({ expanded, visible }: { expanded: boolean; visible: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#637381"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        visibility: visible ? 'visible' : 'hidden',
        transition: 'transform 0.15s ease',
        flexShrink: 0,
      }}
    >
      <path d={expanded ? CHEVRON_DOWN : CHEVRON_RIGHT} />
    </svg>
  );
}

interface OkrsTableProps {
  kpis: KPIWithObjectives[];
}

export function OkrsTable({ kpis }: OkrsTableProps) {
  const [expandedKpis, setExpandedKpis] = useState<Set<string>>(new Set());
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set());

  function toggleKpi(id: string) {
    setExpandedKpis((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleObjective(id: string) {
    setExpandedObjectives((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const cellBase: React.CSSProperties = {
    padding: '1.2rem 1.6rem',
    borderBottom: '1px solid #f1f2f4',
    fontSize: '1.4rem',
    color: '#212b36',
    verticalAlign: 'middle',
  };

  const headerCell: React.CSSProperties = {
    padding: '1.2rem 1.6rem',
    textAlign: 'left',
    fontSize: '1.2rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#637381',
    borderBottom: '1px solid #dfe3e8',
    backgroundColor: '#fafbfb',
  };

  return (
    <div
      className="Polaris-Card"
      style={{
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        backgroundColor: 'white',
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...headerCell, width: '45%' }}>Nombre</th>
              <th style={headerCell}>Tipo</th>
              <th style={headerCell}>Equipo</th>
              <th style={headerCell}>Progreso</th>
              <th style={headerCell}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((kpi) => {
              const kpiExpanded = expandedKpis.has(kpi.id);
              const kpiProgress = getKpiProgress(kpi);
              const kpiChip = kpiStatusFromProgress(kpiProgress);
              const hasObjectives = (kpi.objectives || []).length > 0;

              return (
                <KpiRowGroup
                  key={kpi.id}
                  kpi={kpi}
                  kpiExpanded={kpiExpanded}
                  kpiProgress={kpiProgress}
                  kpiChip={kpiChip}
                  hasObjectives={hasObjectives}
                  onToggleKpi={() => toggleKpi(kpi.id)}
                  expandedObjectives={expandedObjectives}
                  onToggleObjective={toggleObjective}
                  cellBase={cellBase}
                />
              );
            })}

            {kpis.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...cellBase, textAlign: 'center', color: '#637381', padding: '4rem' }}>
                  No hay KPIs en este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Row groups ----------

interface KpiRowGroupProps {
  kpi: KPIWithObjectives;
  kpiExpanded: boolean;
  kpiProgress: number;
  kpiChip: StatusChip;
  hasObjectives: boolean;
  onToggleKpi: () => void;
  expandedObjectives: Set<string>;
  onToggleObjective: (id: string) => void;
  cellBase: React.CSSProperties;
}

function KpiRowGroup({
  kpi,
  kpiExpanded,
  kpiProgress,
  kpiChip,
  hasObjectives,
  onToggleKpi,
  expandedObjectives,
  onToggleObjective,
  cellBase,
}: KpiRowGroupProps) {
  return (
    <>
      <tr
        onClick={hasObjectives ? onToggleKpi : undefined}
        style={{
          cursor: hasObjectives ? 'pointer' : 'default',
          backgroundColor: kpiExpanded ? '#f9fafb' : 'white',
        }}
      >
        <td style={cellBase}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <Chevron expanded={kpiExpanded} visible={hasObjectives} />
            <span style={{ fontWeight: 600 }}>{kpi.title}</span>
          </div>
        </td>
        <td style={cellBase}><TypeBadge type="kpi" /></td>
        <td style={cellBase}>
          {kpi.responsible_department ? (
            <TeamChip name={kpi.responsible_department.name} color={kpi.responsible_department.color} />
          ) : (
            <span style={{ color: '#919eab' }}>—</span>
          )}
        </td>
        <td style={cellBase}><ProgressBar value={kpiProgress} /></td>
        <td style={cellBase}><StatusBadge chip={kpiChip} /></td>
      </tr>

      {kpiExpanded &&
        kpi.objectives.map((obj) => {
          const objExpanded = expandedObjectives.has(obj.id);
          const objProgress = getObjectiveProgress(obj);
          const objChip = objectiveStatus(obj.status);
          const hasTasks = (obj.tasks || []).length > 0;

          return (
            <ObjectiveRowGroup
              key={`${kpi.id}-${obj.id}`}
              obj={obj}
              objExpanded={objExpanded}
              objProgress={objProgress}
              objChip={objChip}
              hasTasks={hasTasks}
              onToggle={() => onToggleObjective(obj.id)}
              cellBase={cellBase}
            />
          );
        })}
    </>
  );
}

interface ObjectiveRowGroupProps {
  obj: ObjectiveWithTasks;
  objExpanded: boolean;
  objProgress: number;
  objChip: StatusChip;
  hasTasks: boolean;
  onToggle: () => void;
  cellBase: React.CSSProperties;
}

function ObjectiveRowGroup({
  obj,
  objExpanded,
  objProgress,
  objChip,
  hasTasks,
  onToggle,
  cellBase,
}: ObjectiveRowGroupProps) {
  return (
    <>
      <tr
        onClick={hasTasks ? onToggle : undefined}
        style={{
          cursor: hasTasks ? 'pointer' : 'default',
          backgroundColor: objExpanded ? '#fbfcfd' : 'white',
        }}
      >
        <td style={cellBase}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', paddingLeft: '3.2rem' }}>
            <Chevron expanded={objExpanded} visible={hasTasks} />
            <span style={{ fontWeight: 500 }}>{obj.title}</span>
          </div>
        </td>
        <td style={cellBase}><TypeBadge type="objective" /></td>
        <td style={cellBase}>
          {obj.responsible_department ? (
            <TeamChip name={obj.responsible_department.name} color={obj.responsible_department.color} />
          ) : (
            <span style={{ color: '#919eab' }}>—</span>
          )}
        </td>
        <td style={cellBase}><ProgressBar value={objProgress} /></td>
        <td style={cellBase}><StatusBadge chip={objChip} /></td>
      </tr>

      {objExpanded &&
        obj.tasks.map((t) => {
          const chip = taskStatus(t.status);
          const progress = getTaskProgress(t);
          return (
            <tr key={`${obj.id}-${t.id}`} style={{ backgroundColor: 'white' }}>
              <td style={cellBase}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', paddingLeft: '6.4rem' }}>
                  <Chevron expanded={false} visible={false} />
                  <span style={{ color: '#454f5b' }}>{t.title}</span>
                </div>
              </td>
              <td style={cellBase}><TypeBadge type="task" /></td>
              <td style={cellBase}>
                <span style={{ color: '#919eab' }}>—</span>
              </td>
              <td style={cellBase}><ProgressBar value={progress} /></td>
              <td style={cellBase}><StatusBadge chip={chip} /></td>
            </tr>
          );
        })}
    </>
  );
}
