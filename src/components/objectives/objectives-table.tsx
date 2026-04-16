'use client';

import { useState } from 'react';
import type { Task, Department } from '@/types';
import type { ObjectiveRow } from '@/hooks/use-objectives-table';
import { InlineTeamSelect } from '@/components/okrs/inline-team-select';
import { InlineStatusSelect } from '@/components/okrs/inline-status-select';
import { OkrDetailPanel, type PanelTarget } from '@/components/okrs/okr-detail-panel';

// ---------- Small cell helpers ----------

function TypeBadge({ type }: { type: 'objective' | 'task' }) {
  const map = {
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
      <div style={{ flex: 1, height: '0.8rem', borderRadius: '10rem', backgroundColor: '#e4e5e7', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: fill, borderRadius: '10rem', transition: 'width 0.2s ease' }} />
      </div>
      <span style={{ fontSize: '1.2rem', color: '#454f5b', minWidth: '3.5rem', textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

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

const CHEVRON_RIGHT = 'M9 5l7 7-7 7';
const CHEVRON_DOWN = 'M19 9l-7 7-7-7';
function Chevron({ expanded, visible }: { expanded: boolean; visible: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#637381"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ visibility: visible ? 'visible' : 'hidden', transition: 'transform 0.15s ease', flexShrink: 0 }}
    >
      <path d={expanded ? CHEVRON_DOWN : CHEVRON_RIGHT} />
    </svg>
  );
}

// ---------- Main ----------

interface ObjectivesTableProps {
  rows: ObjectiveRow[];
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
}

export function ObjectivesTable({ rows, departments, canEdit, onChanged }: ObjectivesTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [panelTarget, setPanelTarget] = useState<PanelTarget>(null);

  function toggle(id: string) {
    setExpanded((prev) => {
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
        style={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'white', overflow: 'hidden' }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerCell, width: '35%' }}>Nombre</th>
                <th style={headerCell}>Tipo</th>
                <th style={headerCell}>KPI</th>
                <th style={headerCell}>Equipo</th>
                <th style={headerCell}>Progreso</th>
                <th style={headerCell}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...cellBase, textAlign: 'center', color: '#637381', padding: '4rem' }}>
                    No hay objetivos en este periodo.
                  </td>
                </tr>
              )}

              {rows.map((obj) => {
                const isExpanded = expanded.has(obj.id);
                const hasTasks = (obj.tasks || []).length > 0;
                const progress = obj.computed_progress ?? obj.manual_progress ?? 0;

                return (
                  <ObjectiveRowGroup
                    key={obj.id}
                    obj={obj}
                    expanded={isExpanded}
                    hasTasks={hasTasks}
                    progress={progress}
                    onToggle={() => toggle(obj.id)}
                    cellBase={cellBase}
                    departments={departments}
                    canEdit={canEdit}
                    onChanged={onChanged}
                    onOpenPanel={setPanelTarget}
                  />
                );
              })}
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

// ---------- Row group ----------

interface ObjectiveRowGroupProps {
  obj: ObjectiveRow;
  expanded: boolean;
  hasTasks: boolean;
  progress: number;
  onToggle: () => void;
  cellBase: React.CSSProperties;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
  onOpenPanel: (t: PanelTarget) => void;
}

function ObjectiveRowGroup({
  obj,
  expanded,
  hasTasks,
  progress,
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
        style={{ cursor: hasTasks ? 'pointer' : 'default', backgroundColor: expanded ? '#f9fafb' : 'white' }}
      >
        <td style={cellBase}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Chevron expanded={expanded} visible={hasTasks} />
            <TitleButton onClick={() => onOpenPanel({ type: 'objective', id: obj.id })} strong>
              {obj.title}
            </TitleButton>
          </div>
        </td>
        <td style={cellBase}><TypeBadge type="objective" /></td>
        <td style={cellBase}>
          {obj.linked_kpis.length === 0 ? (
            <span style={{ color: '#919eab', fontSize: '1.2rem' }}>—</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {obj.linked_kpis.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPanel({ type: 'kpi', id: k.id });
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    font: 'inherit',
                    color: '#5c6ac4',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '1.3rem',
                  }}
                >
                  {k.title}
                </button>
              ))}
            </div>
          )}
        </td>
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
        <td style={cellBase}><ProgressBar value={progress} /></td>
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

      {expanded &&
        obj.tasks.map((t: Task) => {
          const taskProgress = t.status === 'completed' ? 100 : 0;
          return (
            <tr key={`${obj.id}-${t.id}`} style={{ backgroundColor: 'white' }}>
              <td style={cellBase}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', paddingLeft: '3rem' }}>
                  <Chevron expanded={false} visible={false} />
                  <TitleButton onClick={() => onOpenPanel({ type: 'task', id: t.id })} dimmed>
                    {t.title}
                  </TitleButton>
                </div>
              </td>
              <td style={cellBase}><TypeBadge type="task" /></td>
              <td style={cellBase}><span style={{ color: '#919eab' }}>—</span></td>
              <td style={cellBase}><span style={{ color: '#919eab' }}>—</span></td>
              <td style={cellBase}><ProgressBar value={taskProgress} /></td>
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
