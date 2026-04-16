'use client';

import { useState } from 'react';
import type { Task, Department } from '@/types';
import type { KPIWithObjectives, ObjectiveWithTasks } from '@/hooks/use-okrs';
import { InlineTeamSelect } from './inline-team-select';
import { InlineStatusSelect } from './inline-status-select';
import { OkrDetailPanel, type PanelTarget } from './okr-detail-panel';

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

// ---------- Title button ----------

function TitleButton({
  children,
  onClick,
  strong = false,
  dimmed = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  strong?: boolean;
  dimmed?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: dimmed ? '#454f5b' : '#212b36',
        fontWeight: strong ? 600 : 500,
        cursor: 'pointer',
        textAlign: 'left',
        textDecoration: hover ? 'underline' : 'none',
      }}
    >
      {children}
    </button>
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
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
}

export function OkrsTable({ kpis, departments, canEdit, onChanged }: OkrsTableProps) {
  const [expandedKpis, setExpandedKpis] = useState<Set<string>>(new Set());
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set());
  const [panelTarget, setPanelTarget] = useState<PanelTarget>(null);

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
    <>
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
                const hasObjectives = (kpi.objectives || []).length > 0;

                return (
                  <KpiRowGroup
                    key={kpi.id}
                    kpi={kpi}
                    kpiExpanded={kpiExpanded}
                    kpiProgress={kpiProgress}
                    hasObjectives={hasObjectives}
                    onToggleKpi={() => toggleKpi(kpi.id)}
                    expandedObjectives={expandedObjectives}
                    onToggleObjective={toggleObjective}
                    cellBase={cellBase}
                    departments={departments}
                    canEdit={canEdit}
                    onChanged={onChanged}
                    onOpenPanel={setPanelTarget}
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

      <OkrDetailPanel
        target={panelTarget}
        departments={departments}
        canEdit={canEdit}
        onClose={() => setPanelTarget(null)}
        onChanged={onChanged}
      />
    </>
  );
}

// ---------- Row groups ----------

interface KpiRowGroupProps {
  kpi: KPIWithObjectives;
  kpiExpanded: boolean;
  kpiProgress: number;
  hasObjectives: boolean;
  onToggleKpi: () => void;
  expandedObjectives: Set<string>;
  onToggleObjective: (id: string) => void;
  cellBase: React.CSSProperties;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
  onOpenPanel: (t: PanelTarget) => void;
}

function KpiRowGroup({
  kpi,
  kpiExpanded,
  kpiProgress,
  hasObjectives,
  onToggleKpi,
  expandedObjectives,
  onToggleObjective,
  cellBase,
  departments,
  canEdit,
  onChanged,
  onOpenPanel,
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
            <TitleButton onClick={() => onOpenPanel({ type: 'kpi', id: kpi.id })} strong>
              {kpi.title}
            </TitleButton>
          </div>
        </td>
        <td style={cellBase}><TypeBadge type="kpi" /></td>
        <td style={cellBase}>
          <InlineTeamSelect
            entity="kpi"
            id={kpi.id}
            currentDepartmentId={kpi.responsible_department_id}
            currentDepartment={kpi.responsible_department}
            departments={departments}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </td>
        <td style={cellBase}><ProgressBar value={kpiProgress} /></td>
        <td style={cellBase}>
          <InlineStatusSelect
            entity="kpi"
            id={kpi.id}
            currentStatus=""
            progress={kpiProgress}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </td>
      </tr>

      {kpiExpanded &&
        kpi.objectives.map((obj) => {
          const objExpanded = expandedObjectives.has(obj.id);
          const objProgress = getObjectiveProgress(obj);
          const hasTasks = (obj.tasks || []).length > 0;

          return (
            <ObjectiveRowGroup
              key={`${kpi.id}-${obj.id}`}
              obj={obj}
              objExpanded={objExpanded}
              objProgress={objProgress}
              hasTasks={hasTasks}
              onToggle={() => onToggleObjective(obj.id)}
              cellBase={cellBase}
              departments={departments}
              canEdit={canEdit}
              onChanged={onChanged}
              onOpenPanel={onOpenPanel}
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
  hasTasks: boolean;
  onToggle: () => void;
  cellBase: React.CSSProperties;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
  onOpenPanel: (t: PanelTarget) => void;
}

function ObjectiveRowGroup({
  obj,
  objExpanded,
  objProgress,
  hasTasks,
  onToggle,
  cellBase,
  departments,
  canEdit,
  onChanged,
  onOpenPanel,
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
            <TitleButton onClick={() => onOpenPanel({ type: 'objective', id: obj.id })}>
              {obj.title}
            </TitleButton>
          </div>
        </td>
        <td style={cellBase}><TypeBadge type="objective" /></td>
        <td style={cellBase}>
          <InlineTeamSelect
            entity="objective"
            id={obj.id}
            currentDepartmentId={obj.responsible_department_id}
            currentDepartment={obj.responsible_department}
            departments={departments}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </td>
        <td style={cellBase}><ProgressBar value={objProgress} /></td>
        <td style={cellBase}>
          <InlineStatusSelect
            entity="objective"
            id={obj.id}
            currentStatus={obj.status}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </td>
      </tr>

      {objExpanded &&
        obj.tasks.map((t) => {
          const progress = getTaskProgress(t);
          return (
            <tr key={`${obj.id}-${t.id}`} style={{ backgroundColor: 'white' }}>
              <td style={cellBase}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', paddingLeft: '6.4rem' }}>
                  <Chevron expanded={false} visible={false} />
                  <TitleButton onClick={() => onOpenPanel({ type: 'task', id: t.id })} dimmed>
                    {t.title}
                  </TitleButton>
                </div>
              </td>
              <td style={cellBase}><TypeBadge type="task" /></td>
              <td style={cellBase}>
                <span style={{ color: '#919eab' }}>—</span>
              </td>
              <td style={cellBase}><ProgressBar value={progress} /></td>
              <td style={cellBase}>
                <InlineStatusSelect
                  entity="task"
                  id={t.id}
                  currentStatus={t.status}
                  canEdit={canEdit}
                  onChanged={onChanged}
                />
              </td>
            </tr>
          );
        })}
    </>
  );
}
