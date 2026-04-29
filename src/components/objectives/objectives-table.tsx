'use client';

import { useState } from 'react';
import type { Task, Department } from '@/types';
import type { ObjectiveRow } from '@/hooks/use-objectives-table';
import { InlineTeamSelect } from '@/components/okrs/inline-team-select';
import { InlineStatusSelect } from '@/components/okrs/inline-status-select';
import { InlineUserSelect } from '@/components/okrs/inline-user-select';
import type { PanelTarget } from '@/components/okrs/okr-detail-panel';

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

/** Interactive wrapper: clicking the chevron toggles task expansion
 *  *without* triggering the row's open-detail-panel handler. */
function ChevronToggle({
  expanded,
  visible,
  onToggle,
}: {
  expanded: boolean;
  visible: boolean;
  onToggle: () => void;
}) {
  if (!visible) {
    // Reserve the slot so titles stay visually aligned across rows.
    return <span style={{ width: 12, height: 12, flexShrink: 0 }} aria-hidden />;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={expanded ? 'Contraer tareas' : 'Expandir tareas'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        padding: 0,
        margin: 0,
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <Chevron expanded={expanded} visible />
    </button>
  );
}

// ---------- Main ----------

interface ObjectivesTableProps {
  rows: ObjectiveRow[];
  departments: Department[];
  workspaceId: string;
  canEdit: boolean;
  onChanged: () => void;
  onOpenPanel: (t: PanelTarget) => void;
  emptyLabel?: string;
  /**
   * When provided AND `canEdit` is true, an Asana-style "+ Agregar
   * objetivo" row renders at the bottom of the table. Click fires the
   * callback so the parent can open its ObjectiveForm pre-filled with
   * the right KPI link.
   */
  onAddObjective?: () => void;
}

/**
 * Presentational table of objectives with expandable task rows. Used as a
 * sub-table (one per KPI) in the Objetivos view; the enclosing panel state
 * is owned by the parent page so that a single OkrDetailPanel can back every
 * sub-table at once.
 */
export function ObjectivesTable({
  rows,
  departments,
  workspaceId,
  canEdit,
  onChanged,
  onOpenPanel,
  emptyLabel = 'No hay objetivos.',
  onAddObjective,
}: ObjectivesTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerCell, width: '34%' }}>Nombre</th>
            <th style={headerCell}>Tipo</th>
            <th style={headerCell}>Responsable</th>
            <th style={headerCell}>Equipo</th>
            <th style={headerCell}>Progreso</th>
            <th style={headerCell}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...cellBase, textAlign: 'center', color: '#637381', padding: '3rem' }}>
                {emptyLabel}
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
                workspaceId={workspaceId}
                onToggle={() => toggle(obj.id)}
                cellBase={cellBase}
                departments={departments}
                canEdit={canEdit}
                onChanged={onChanged}
                onOpenPanel={onOpenPanel}
              />
            );
          })}

          {canEdit && onAddObjective && (
            <AddObjectiveRow onClick={onAddObjective} cellBase={cellBase} />
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Add-objective row ----------

/**
 * Asana-style "Add task..." row, adapted for objectives. Sits at the
 * bottom of the table under the last ObjectiveRowGroup; clicking
 * anywhere in the row triggers the parent's `onAddObjective` callback.
 * Muted text color + hover lift gives it the "inline action" feel
 * without competing with real data rows.
 */
function AddObjectiveRow({
  onClick,
  cellBase,
}: {
  onClick: () => void;
  cellBase: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        backgroundColor: hover ? '#f9fafb' : 'white',
        transition: 'background-color 120ms ease',
      }}
    >
      <td colSpan={6} style={{ ...cellBase, borderBottom: 'none' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '1.3rem',
            color: hover ? '#5c6ac4' : '#919eab',
            fontWeight: 500,
            transition: 'color 120ms ease',
            paddingLeft: '1.6rem',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {/* Bare cross — no enclosing circle — so it reads as a
                stronger "add" glyph at this row's small size. Spans
                the full viewBox so it looks bigger than the previous
                circled plus. */}
            <path d="M12 4v16M4 12h16" />
          </svg>
          Agregar objetivo
        </span>
      </td>
    </tr>
  );
}

// ---------- Row group ----------

interface ObjectiveRowGroupProps {
  obj: ObjectiveRow;
  expanded: boolean;
  hasTasks: boolean;
  progress: number;
  workspaceId: string;
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
  workspaceId,
  onToggle,
  cellBase,
  departments,
  canEdit,
  onChanged,
  onOpenPanel,
}: ObjectiveRowGroupProps) {
  const [hover, setHover] = useState(false);
  // Pick a slightly grayish background on hover so the row feels
  // interactive. Keeps the expanded-row lift (`#f9fafb`) when already
  // expanded so the two states don't fight.
  const bg = hover ? '#f4f6f8' : expanded ? '#f9fafb' : 'white';
  return (
    <>
      <tr
        className="anim-row-in"
        onClick={() => onOpenPanel({ type: 'objective', id: obj.id })}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          // Whole row is now the click target for opening the detail
          // panel — task expansion is reserved for the chevron alone.
          cursor: 'pointer',
          backgroundColor: bg,
          transition: 'background-color 120ms ease',
        }}
      >
        <td style={cellBase}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ChevronToggle expanded={expanded} visible={hasTasks} onToggle={onToggle} />
            <TitleButton onClick={() => onOpenPanel({ type: 'objective', id: obj.id })} strong>
              {obj.title}
            </TitleButton>
            {/* Right-arrow affordance — visible only while the row is
                hovered so idle rows stay clean. Inherits color so it
                matches the title. */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#454f5b"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                flexShrink: 0,
                opacity: hover ? 1 : 0,
                transform: hover ? 'translateX(0)' : 'translateX(-2px)',
                transition: 'opacity 140ms ease, transform 140ms ease',
              }}
              aria-hidden
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </td>
        <td style={cellBase}><TypeBadge type="objective" /></td>
        <td style={cellBase} onClick={(e) => e.stopPropagation()}>
          <InlineUserSelect
            entity="objective"
            id={obj.id}
            workspaceId={workspaceId}
            currentUserId={obj.responsible_user_id}
            currentUser={obj.responsible_user}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </td>
        <td style={cellBase} onClick={(e) => e.stopPropagation()}>
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
        <td style={cellBase} onClick={(e) => e.stopPropagation()}>
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
            <tr key={`${obj.id}-${t.id}`} className="anim-row-in" style={{ backgroundColor: 'white' }}>
              <td style={cellBase}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', paddingLeft: '3rem' }}>
                  <Chevron expanded={false} visible={false} />
                  <TitleButton onClick={() => onOpenPanel({ type: 'task', id: t.id })} dimmed>
                    {t.title}
                  </TitleButton>
                </div>
              </td>
              <td style={cellBase}><TypeBadge type="task" /></td>
              <td style={cellBase}>
                <InlineUserSelect
                  entity="task"
                  id={t.id}
                  workspaceId={workspaceId}
                  currentUserId={t.assigned_user_id}
                  currentUser={t.assigned_user}
                  canEdit={canEdit}
                  onChanged={onChanged}
                />
              </td>
              <td style={cellBase}>
                {/* Tasks inherit their parent objective's department —
                    no per-task override exists, so the cell stays
                    empty for column alignment. */}
                <span style={{ color: '#919eab', fontSize: '1.2rem' }}>—</span>
              </td>
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
