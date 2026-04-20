'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useObjectivesTable } from '@/hooks/use-objectives-table';
import { ObjectivesTable } from '@/components/objectives/objectives-table';
import { ObjectiveForm } from '@/components/objectives/objective-form';
import { OkrDetailPanel, type PanelTarget } from '@/components/okrs/okr-detail-panel';
import { ObjectivesGantt } from '@/components/objectives/objectives-gantt';
import { SkillTreeCanvas } from '@/components/skill-tree/skill-tree-canvas';
import { createClient } from '@/lib/supabase/client';
import { canManageContent } from '@/lib/utils/permissions';
import { calculateKpiProgress } from '@/lib/utils/progress';
import type { Department, KPI, KPIStatus, ObjectiveStatus } from '@/types';
import type { ObjectiveRow } from '@/hooks/use-objectives-table';

const ARROW_UP = 'M5 15l7-7 7 7';
const ARROW_DOWN = 'M19 9l-7 7-7-7';

// ---------- Metric helpers ----------

function getProgress(o: ObjectiveRow): number {
  return o.computed_progress ?? o.manual_progress ?? 0;
}

/** Objective is "finished" when its computed progress is at least 100%. */
function isFinished(o: ObjectiveRow): boolean {
  return getProgress(o) >= 100;
}

/**
 * "Behind schedule": a planning window is set on both ends AND the window
 * has elapsed past the halfway point AND progress is still below 50%.
 * Objectives without start/end dates are not counted (we can't assess them).
 */
function isBehindSchedule(o: ObjectiveRow, now: Date = new Date()): boolean {
  if (!o.start_date || !o.end_date) return false;
  const start = new Date(o.start_date).getTime();
  const end = new Date(o.end_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const elapsedFrac = (now.getTime() - start) / (end - start);
  if (elapsedFrac <= 0.5) return false;
  return getProgress(o) < 50;
}

/**
 * Objetivos view: one ObjectivesTable per KPI (plus a bucket for orphan
 * objectives that aren't linked to any KPI). KPI sections can be reordered
 * via up/down buttons; the new order persists to `kpis.sort_order` (shared
 * with the OKRs view). A single OkrDetailPanel backs every sub-table.
 */
export default function ObjetivosPage() {
  const { currentWorkspace, activePeriod, userWorkspace } = useWorkspaceStore();
  const { rows, loading, refetch } = useObjectivesTable(currentWorkspace?.id, activePeriod?.id);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ObjectiveStatus | 'all'>('all');
  const [panelTarget, setPanelTarget] = useState<PanelTarget>(null);
  const [activeTab, setActiveTab] = useState<'listado' | 'gantt' | 'metricas' | 'tree'>('listado');

  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));
  const canReorder = canEdit;

  useEffect(() => {
    async function loadMeta() {
      if (!currentWorkspace?.id || !activePeriod?.id) return;
      const supabase = createClient();
      const [deptRes, kpiRes] = await Promise.all([
        supabase
          .from('departments')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .order('name', { ascending: true }),
        supabase
          .from('kpis')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .eq('period_id', activePeriod.id)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);
      if (deptRes.data) setDepartments(deptRes.data as Department[]);
      if (kpiRes.data) setKpis(kpiRes.data as KPI[]);
    }
    loadMeta();
  }, [currentWorkspace?.id, activePeriod?.id]);

  // Metrics are always computed over the FULL objective list (not the
  // filtered one) so the status chips don't warp the counts.
  const metrics = useMemo(() => {
    const finishedCount = rows.filter(isFinished).length;
    const behindCount = rows.filter((o) => isBehindSchedule(o)).length;
    const deptStats = new Map<
      string,
      { department: Department; total: number; finished: number; progressSum: number }
    >();
    rows.forEach((o) => {
      const deptId = o.responsible_department_id;
      if (!deptId) return;
      const dept = departments.find((d) => d.id === deptId);
      if (!dept) return;
      const bucket = deptStats.get(deptId) ?? {
        department: dept,
        total: 0,
        finished: 0,
        progressSum: 0,
      };
      bucket.total += 1;
      if (isFinished(o)) bucket.finished += 1;
      bucket.progressSum += getProgress(o);
      deptStats.set(deptId, bucket);
    });
    const leaderboard = Array.from(deptStats.values())
      .map((b) => ({
        department: b.department,
        total: b.total,
        finished: b.finished,
        avg: Math.round(b.progressSum / Math.max(b.total, 1)),
      }))
      .sort((a, b) => b.finished - a.finished || b.avg - a.avg);
    return { finishedCount, behindCount, leaderboard };
  }, [rows, departments]);

  // Apply the status filter once, then group by KPI.
  const filteredRows = filterStatus === 'all' ? rows : rows.filter((o) => o.status === filterStatus);

  const rowsByKpi = useMemo(() => {
    const map = new Map<string, typeof filteredRows>();
    const orphans: typeof filteredRows = [];
    filteredRows.forEach((obj) => {
      if (!obj.linked_kpis || obj.linked_kpis.length === 0) {
        orphans.push(obj);
        return;
      }
      obj.linked_kpis.forEach((k) => {
        const arr = map.get(k.id) || [];
        arr.push(obj);
        map.set(k.id, arr);
      });
    });
    return { map, orphans };
  }, [filteredRows]);

  async function moveKpi(kpiId: string, direction: -1 | 1) {
    const idx = kpis.findIndex((k) => k.id === kpiId);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= kpis.length) return;
    const reordered = [...kpis];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(target, 0, item);
    // Local echo
    setKpis(reordered.map((k, i) => ({ ...k, sort_order: i })));
    // Persist
    const supabase = createClient();
    await Promise.all(
      reordered.map((k, i) => supabase.from('kpis').update({ sort_order: i }).eq('id', k.id)),
    );
  }

  async function refreshAll() {
    // Reload both objectives and the kpi ordering (in case we're showing a
    // freshly-reordered list and a mutation reran).
    if (!currentWorkspace?.id || !activePeriod?.id) {
      refetch();
      return;
    }
    const supabase = createClient();
    const kpiRes = await supabase
      .from('kpis')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .eq('period_id', activePeriod.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (kpiRes.data) setKpis(kpiRes.data as KPI[]);
    refetch();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Objetivos</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            {activePeriod
              ? `Periodo ${activePeriod.name}. Los objetivos se agrupan por KPI.`
              : 'Sin periodo activo'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          {canEdit && activePeriod && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              + Crear Objetivo
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '0.4rem',
          borderBottom: '1px solid #dfe3e8',
          marginBottom: '2rem',
        }}
      >
        <TabButton active={activeTab === 'listado'} onClick={() => setActiveTab('listado')}>
          Listado
        </TabButton>
        <TabButton active={activeTab === 'gantt'} onClick={() => setActiveTab('gantt')}>
          Gantt
        </TabButton>
        <TabButton active={activeTab === 'metricas'} onClick={() => setActiveTab('metricas')}>
          Métricas
        </TabButton>
        <TabButton active={activeTab === 'tree'} onClick={() => setActiveTab('tree')}>
          Skill Tree
        </TabButton>
      </div>

      {activeTab === 'gantt' && (
        <>
          {!activePeriod ? (
            <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo.</p>
            </div>
          ) : loading ? (
            <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando objetivos...</p>
          ) : (
            <ObjectivesGantt
              rows={rows}
              departments={departments}
              activePeriod={activePeriod}
              onOpenPanel={setPanelTarget}
            />
          )}
        </>
      )}

      {activeTab === 'tree' && (
        <>
          {!activePeriod ? (
            <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo.</p>
            </div>
          ) : !currentWorkspace ? null : (
            // Fills the viewport below the topbar + tab header. 150px is the
            // measured combined height of the 56px topbar + the page header
            // and tablist above this container.
            <div style={{ height: 'calc(100vh - 200px)', minHeight: '480px' }}>
              <SkillTreeCanvas
                workspaceId={currentWorkspace.id}
                periodId={activePeriod.id}
                height="100%"
                onNodeClick={(type, id) => {
                  if (type === 'kpi') setPanelTarget({ type: 'kpi', id });
                  else if (type === 'obj') setPanelTarget({ type: 'objective', id });
                  else if (type === 'task') setPanelTarget({ type: 'task', id });
                }}
              />
            </div>
          )}
        </>
      )}

      {activeTab === 'metricas' && (
        <>
          {!activePeriod ? (
            <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo.</p>
            </div>
          ) : loading ? (
            <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando métricas...</p>
          ) : rows.length === 0 ? (
            <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay objetivos en este periodo.</p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                // Row 1 sizes to the taller of the two stat cards, so both
                // render at the same height regardless of subtext length.
                gridAutoRows: 'minmax(0, auto)',
                gap: '1.6rem',
              }}
            >
              <StatCard
                label="Objetivos finalizados"
                value={metrics.finishedCount}
                subtext={`de ${rows.length} totales`}
                accent="#108043"
              />
              <StatCard
                label="Objetivos atrasados"
                value={metrics.behindCount}
                subtext="< 50% de progreso y > 50% del tiempo"
                accent="#bf0711"
              />
              <LeaderboardCard rows={metrics.leaderboard} />
            </div>
          )}
        </>
      )}

      {activeTab === 'listado' && <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '2rem' }}>
        {(['all', 'in_progress', 'upcoming', 'paused', 'deprecated'] as const).map((s) => {
          const labels = { all: 'Todos', in_progress: 'En progreso', upcoming: 'Próximos', paused: 'Pausados', deprecated: 'Deprecados' };
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '0.4rem 1.2rem',
                fontSize: '1.3rem',
                fontWeight: filterStatus === s ? 600 : 400,
                color: filterStatus === s ? '#5c6ac4' : '#637381',
                backgroundColor: filterStatus === s ? '#f4f5fc' : 'transparent',
                border: filterStatus === s ? '1px solid #5c6ac4' : '1px solid #dfe3e8',
                borderRadius: '20px',
                cursor: 'pointer',
              }}
            >
              {labels[s]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando objetivos...</p>
      ) : !activePeriod ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo.</p>
        </div>
      ) : kpis.length === 0 && rowsByKpi.orphans.length === 0 ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay KPIs ni objetivos en este periodo.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.4rem' }}>
          {kpis.map((kpi, idx) => {
            const kpiRows = rowsByKpi.map.get(kpi.id) || [];
            return (
              <KpiSection
                key={kpi.id}
                kpi={kpi}
                rows={kpiRows}
                isFirst={idx === 0}
                isLast={idx === kpis.length - 1}
                canReorder={canReorder}
                onMoveUp={() => moveKpi(kpi.id, -1)}
                onMoveDown={() => moveKpi(kpi.id, 1)}
                departments={departments}
                canEdit={canEdit}
                onChanged={refreshAll}
                onOpenPanel={setPanelTarget}
              />
            );
          })}

          {rowsByKpi.orphans.length > 0 && (
            <OrphanSection
              rows={rowsByKpi.orphans}
              departments={departments}
              workspaceId={currentWorkspace!.id}
              canEdit={canEdit}
              onChanged={refreshAll}
              onOpenPanel={setPanelTarget}
            />
          )}
        </div>
      )}
      </>}

      {showCreate && activePeriod && currentWorkspace && (
        <ObjectiveForm
          workspaceId={currentWorkspace.id}
          periodId={activePeriod.id}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refetch(); }}
        />
      )}

      <OkrDetailPanel
        target={panelTarget}
        departments={departments}
        canEdit={canEdit}
        onClose={() => setPanelTarget(null)}
        onChanged={refreshAll}
      />
    </div>
  );
}

// ---------- Per-KPI section ----------

interface KpiSectionProps {
  kpi: KPI;
  rows: ReturnType<typeof useObjectivesTable>['rows'];
  isFirst: boolean;
  isLast: boolean;
  canReorder: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  departments: Department[];
  canEdit: boolean;
  onChanged: () => void;
  onOpenPanel: (t: PanelTarget) => void;
}

function KpiSection({
  kpi,
  rows,
  isFirst,
  isLast,
  canReorder,
  onMoveUp,
  onMoveDown,
  departments,
  canEdit,
  onChanged,
  onOpenPanel,
}: KpiSectionProps) {
  // Derived: roll-up progress computed from the linked objectives (respects
  // manual/auto/hybrid mode). Counts drive the per-KPI summary line.
  const progress = useMemo(
    () =>
      calculateKpiProgress(
        kpi,
        rows.map((obj) => ({ objective: obj, tasks: obj.tasks || [] })),
      ),
    [kpi, rows],
  );
  const inProgressCount = rows.filter((r) => r.status === 'in_progress').length;
  const atRiskCount = rows.filter((r) => isBehindSchedule(r)).length;
  const responsibleDept = kpi.responsible_department_id
    ? departments.find((d) => d.id === kpi.responsible_department_id)
    : null;

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
      {/* Header: ring + title block + summary + reorder */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.6rem',
          padding: '1.6rem 2rem',
          borderBottom: '1px solid #f1f2f4',
          backgroundColor: '#fafbfb',
        }}
      >
        <KpiRing value={progress} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '1.0rem',
              fontWeight: 600,
              color: '#919eab',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '0.2rem',
            }}
          >
            KPI{responsibleDept ? ` · ${responsibleDept.name}` : ''}
          </div>
          <button
            type="button"
            onClick={() => onOpenPanel({ type: 'kpi', id: kpi.id })}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              font: 'inherit',
              fontSize: '1.7rem',
              fontWeight: 600,
              color: '#212b36',
              cursor: 'pointer',
              textAlign: 'left',
              lineHeight: 1.25,
              display: 'block',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={kpi.title}
          >
            {kpi.title}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.8rem', flexShrink: 0 }}>
          <div style={{ fontSize: '1.2rem', color: '#637381' }}>
            <strong style={{ color: '#212b36', fontWeight: 600 }}>{rows.length}</strong>{' '}
            {rows.length === 1 ? 'objetivo' : 'objetivos'}
            <span style={{ color: '#c4cdd5', padding: '0 0.4rem' }}>·</span>
            <strong style={{ color: '#212b36', fontWeight: 600 }}>{inProgressCount}</strong> en progreso
            <span style={{ color: '#c4cdd5', padding: '0 0.4rem' }}>·</span>
            <strong
              style={{
                color: atRiskCount > 0 ? '#bf0711' : '#212b36',
                fontWeight: 600,
              }}
            >
              {atRiskCount}
            </strong>{' '}
            en riesgo
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <KpiStatusPill status={kpi.status} />
            {canReorder && (
              <>
                <ReorderButton direction="up" disabled={isFirst} onClick={onMoveUp} />
                <ReorderButton direction="down" disabled={isLast} onClick={onMoveDown} />
              </>
            )}
          </div>
        </div>
      </div>

      <ObjectivesTable
        rows={rows}
        departments={departments}
        workspaceId={kpi.workspace_id}
        canEdit={canEdit}
        onChanged={onChanged}
        onOpenPanel={onOpenPanel}
        emptyLabel="No hay objetivos vinculados a este KPI."
      />
    </div>
  );
}

/**
 * Circular progress indicator for the KPI section header. Uses an SVG ring
 * matching the inline-progress style elsewhere in the app (indigo stroke on
 * a border-colored track). Percentage label centered.
 */
function KpiRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  // r=17.5 → circumference ≈ 109.96, so dasharray in hundredths of pct
  // maps cleanly via pathLength=100.
  return (
    <div
      style={{
        position: 'relative',
        width: '5.6rem',
        height: '5.6rem',
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 40 40"
        width="100%"
        height="100%"
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        <circle cx="20" cy="20" r="17.5" stroke="#dfe3e8" strokeWidth="3.5" fill="none" />
        <circle
          cx="20"
          cy="20"
          r="17.5"
          stroke="#5c6ac4"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${clamped} 100`}
          pathLength={100}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: '1.3rem',
          fontWeight: 600,
          color: '#212b36',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {clamped}%
      </div>
    </div>
  );
}

/**
 * Small Polaris-tinted pill rendering the KPI's status. Matches the visual
 * vocabulary used in the inline-status dropdowns but without edit affordance
 * (header is not an editor).
 */
function KpiStatusPill({ status }: { status: KPIStatus }) {
  const style: Record<KPIStatus, { label: string; fg: string; bg: string; border: string; dot: string }> = {
    on_track:  { label: 'On track',       fg: '#108043', bg: '#e3f1df', border: 'rgba(80,184,60,0.28)', dot: '#50b83c' },
    at_risk:   { label: 'En riesgo',      fg: '#a45412', bg: '#fdeedc', border: 'rgba(244,147,66,0.32)', dot: '#f49342' },
    off_track: { label: 'Fuera de curso', fg: '#bf0711', bg: '#fbeae5', border: 'rgba(222,54,24,0.24)', dot: '#de3618' },
    achieved:  { label: 'Completado',     fg: '#108043', bg: '#e3f1df', border: 'rgba(80,184,60,0.28)', dot: '#50b83c' },
  };
  const s = style[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.2rem 0.9rem',
        borderRadius: '999px',
        fontSize: '1.15rem',
        fontWeight: 500,
        color: s.fg,
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        lineHeight: '1.8rem',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '0.7rem',
          height: '0.7rem',
          borderRadius: '999px',
          backgroundColor: s.dot,
        }}
      />
      {s.label}
    </span>
  );
}

function ReorderButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'up' | 'down';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'up' ? 'Mover arriba' : 'Mover abajo'}
      style={{
        width: '2.8rem',
        height: '2.8rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: '1px solid #dfe3e8',
        borderRadius: '4px',
        backgroundColor: disabled ? '#f4f6f8' : 'white',
        color: disabled ? '#c4cdd5' : '#637381',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={direction === 'up' ? ARROW_UP : ARROW_DOWN} />
      </svg>
    </button>
  );
}

// ---------- Orphan section (objectives not linked to any KPI) ----------

function OrphanSection({
  rows,
  departments,
  workspaceId,
  canEdit,
  onChanged,
  onOpenPanel,
}: {
  rows: ReturnType<typeof useObjectivesTable>['rows'];
  departments: Department[];
  workspaceId: string;
  canEdit: boolean;
  onChanged: () => void;
  onOpenPanel: (t: PanelTarget) => void;
}) {
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
      <div
        style={{
          padding: '1.2rem 1.6rem',
          borderBottom: '1px solid #f1f2f4',
          backgroundColor: '#fafbfb',
          fontSize: '1.6rem',
          fontWeight: 600,
          color: '#637381',
        }}
      >
        Sin KPI asignado
      </div>
      <ObjectivesTable
        rows={rows}
        departments={departments}
        workspaceId={workspaceId}
        canEdit={canEdit}
        onChanged={onChanged}
        onOpenPanel={onOpenPanel}
      />
    </div>
  );
}

// ---------- Metric cards ----------

function StatCard({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: number;
  subtext: string;
  accent: string;
}) {
  return (
    <div
      className="Polaris-Card"
      style={{
        // height: 100% so that sibling stat cards in the same grid row end up
        // the same height regardless of subtext wrapping. The grid row itself
        // sizes to the tallest card's natural content; this pins the shorter
        // one to match.
        height: '100%',
        minHeight: '14rem',
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        backgroundColor: 'white',
        padding: '1.6rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        boxSizing: 'border-box',
        // polaris.css adds `margin-top: 2rem` to any .Polaris-Card that
        // follows another .Polaris-Card via an adjacent-sibling rule. In a
        // grid layout that pushes the second card down and misaligns it with
        // its row-mate. Inline margin beats the class rule.
        marginTop: 0,
      }}
    >
      <span style={{ fontSize: '1.2rem', color: '#637381', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: '3.6rem', fontWeight: 700, color: accent, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: '1.2rem', color: '#919eab', marginTop: 'auto' }}>{subtext}</span>
    </div>
  );
}

// ---------- Tab button ----------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: '0.8rem 1.6rem',
        fontSize: '1.4rem',
        fontWeight: active ? 600 : 500,
        color: active ? '#5c6ac4' : '#637381',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #5c6ac4' : '2px solid transparent',
        marginBottom: '-1px', // overlap the tablist's bottom border so the
                             // active underline visually replaces it
        cursor: 'pointer',
        transition: 'color 0.15s ease, border-color 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

interface LeaderboardRow {
  department: Department;
  total: number;
  finished: number;
  avg: number;
}

function LeaderboardCard({ rows }: { rows: LeaderboardRow[] }) {
  const headerCell: React.CSSProperties = {
    padding: '0.8rem 1.2rem',
    textAlign: 'left',
    fontSize: '1.1rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#637381',
    borderBottom: '1px solid #dfe3e8',
  };
  const cellBase: React.CSSProperties = {
    padding: '0.8rem 1.2rem',
    borderBottom: '1px solid #f1f2f4',
    fontSize: '1.3rem',
    color: '#212b36',
  };
  return (
    <div
      className="Polaris-Card"
      style={{
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        backgroundColor: 'white',
        overflow: 'hidden',
        // Span only one of the two columns — i.e. half the container, matching
        // the surrounding stat cards.
        gridColumn: 'span 1',
        // See note on StatCard: neutralize the .Polaris-Card adjacent-sibling
        // margin from polaris.css so the leaderboard doesn't sit 2rem below
        // its grid row.
        marginTop: 0,
      }}
    >
      <div
        style={{
          padding: '1.2rem 1.6rem',
          borderBottom: '1px solid #f1f2f4',
          backgroundColor: '#fafbfb',
        }}
      >
        <h3 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36' }}>
          Leaderboard de departamentos
        </h3>
        <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.2rem' }}>
          Ordenado por objetivos finalizados
        </p>
      </div>
      {rows.length === 0 ? (
        <p style={{ padding: '2rem', textAlign: 'center', color: '#637381', fontSize: '1.3rem' }}>
          Aún no hay objetivos asignados a un departamento responsable.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCell}>Departamento</th>
              <th style={{ ...headerCell, textAlign: 'right' }}>Objetivos</th>
              <th style={{ ...headerCell, textAlign: 'right' }}>Progreso prom.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.department.id}>
                <td style={cellBase}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span
                      style={{
                        width: '0.8rem',
                        height: '0.8rem',
                        borderRadius: '50%',
                        backgroundColor: r.department.color || '#919eab',
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{r.department.name}</span>
                  </span>
                </td>
                <td style={{ ...cellBase, textAlign: 'right' }}>
                  <span style={{ fontWeight: 600, color: '#108043' }}>{r.finished}</span>
                  <span style={{ color: '#919eab' }}> / {r.total}</span>
                </td>
                <td style={{ ...cellBase, textAlign: 'right', fontWeight: 600 }}>{r.avg}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
