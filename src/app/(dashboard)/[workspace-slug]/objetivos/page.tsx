'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useObjectivesTable } from '@/hooks/use-objectives-table';
import { ObjectivesTable } from '@/components/objectives/objectives-table';
import { ObjectiveForm } from '@/components/objectives/objective-form';
import { ObjectivesOverview } from '@/components/objectives/objectives-overview';
import { OkrDetailPanel, type PanelTarget } from '@/components/okrs/okr-detail-panel';
import { ObjectivesGantt } from '@/components/objectives/objectives-gantt';
import { SkillTreeCanvas } from '@/components/skill-tree/skill-tree-canvas';
import { createClient } from '@/lib/supabase/client';
import { canManageContent, canManageObjectives } from '@/lib/utils/permissions';
import { calculateKpiProgress } from '@/lib/utils/progress';
import type { Department, KPI, KPIStatus } from '@/types';
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
  const { currentWorkspace, activePeriod, userWorkspace, profile } = useWorkspaceStore();
  const { rows, loading, refetch } = useObjectivesTable(currentWorkspace?.id, activePeriod?.id);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  // `createFor` drives the ObjectiveForm modal.
  //  - undefined → modal closed
  //  - null      → modal open with no KPI pre-selected (hero CTA path)
  //  - string    → modal open with this KPI id pre-linked (per-table
  //                "+ Agregar objetivo" row path)
  const [createFor, setCreateFor] = useState<string | null | undefined>(undefined);
  // Listado scope filter — "all" shows every KPI/objective in the
  // workspace, "mine" narrows to KPIs and objectives where the user
  // is the responsible person OR a member of the responsible /
  // linked department (mirrors the visibility rule used by the
  // check-in page).
  const [filterScope, setFilterScope] = useState<'all' | 'mine'>('all');
  // Department ids the current user belongs to, plus the
  // objective→department junction. Both feed the "asignados a mí"
  // scope filter; loaded once per workspace/profile.
  const [myDeptIds, setMyDeptIds] = useState<Set<string>>(new Set());
  const [deptIdsByObjective, setDeptIdsByObjective] = useState<Map<string, Set<string>>>(
    new Map(),
  );
  const [panelTarget, setPanelTarget] = useState<PanelTarget>(null);
  const [activeTab, setActiveTab] = useState<'listado' | 'gantt' | 'metricas' | 'tree' | 'overview'>('listado');
  // "Vista resumida" collapses every KpiSection / OrphanSection to just
  // its header (hides the ObjectivesTable underneath). Useful when the
  // user wants to scan KPI progress at a glance without scrolling past
  // every objective row. Only applies to the Listado tab.
  const [collapsedListado, setCollapsedListado] = useState(false);

  // Two-tier permissions: members can create/edit objectives + tasks
  // (the operational work) but KPI structural edits stay gated to
  // manager+. Both the inline ObjectivesTable affordances and the
  // ObjectiveForm's "create" path key off `canEdit`; the KPI detail
  // panel receives `canEditKpi` separately.
  const canEdit = Boolean(userWorkspace && canManageObjectives(userWorkspace.role));
  const canEditKpi = Boolean(userWorkspace && canManageContent(userWorkspace.role));
  // Reordering KPIs is an org-structure action — keep it manager+.
  const canReorder = canEditKpi;

  useEffect(() => {
    async function loadMeta() {
      if (!currentWorkspace?.id || !activePeriod?.id) return;
      const supabase = createClient();
      const [deptRes, kpiRes, userDeptRes, objDeptRes] = await Promise.all([
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
        // Department membership for the current user — drives the
        // "asignados a mí" filter. Skipped (resolves to empty array)
        // when there's no profile.
        profile?.id
          ? supabase
              .from('user_departments')
              .select('department_id')
              .eq('user_id', profile.id)
          : Promise.resolve({ data: [] as Array<{ department_id: string }> }),
        // objective_departments junction — used to detect objectives
        // linked to one of the user's departments without being the
        // responsible department. Workspace scoping happens through
        // RLS; we don't filter here.
        supabase.from('objective_departments').select('objective_id, department_id'),
      ]);
      if (deptRes.data) setDepartments(deptRes.data as Department[]);
      if (kpiRes.data) setKpis(kpiRes.data as KPI[]);
      setMyDeptIds(
        new Set(
          ((userDeptRes.data || []) as Array<{ department_id: string }>).map(
            (r) => r.department_id,
          ),
        ),
      );
      const map = new Map<string, Set<string>>();
      ((objDeptRes.data || []) as Array<{ objective_id: string; department_id: string }>).forEach(
        (r) => {
          const s = map.get(r.objective_id) || new Set<string>();
          s.add(r.department_id);
          map.set(r.objective_id, s);
        },
      );
      setDeptIdsByObjective(map);
    }
    loadMeta();
  }, [currentWorkspace?.id, activePeriod?.id, profile?.id]);

  // Metrics are always computed over the FULL objective list (not the
  // filtered one) so the status chips don't warp the counts.
  const metrics = useMemo(() => {
    const finishedCount = rows.filter(isFinished).length;
    const behindCount = rows.filter((o) => isBehindSchedule(o)).length;
    // "Bloqueados" = objectives that have at least one blocked task. The
    // ObjectiveStatus enum doesn't have a 'blocked' value, so we derive it
    // from the tasks (which do).
    const blockedCount = rows.filter((o) =>
      (o.tasks || []).some((t) => t.status === 'blocked'),
    ).length;
    const overallAvg = rows.length
      ? Math.round(rows.reduce((a, o) => a + getProgress(o), 0) / rows.length)
      : 0;
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
    return { finishedCount, behindCount, blockedCount, overallAvg, leaderboard };
  }, [rows, departments]);

  // Apply the scope filter (Todos / Asignados a mí) once, then group
  // by KPI. An objective counts as "mine" if the user is the
  // responsible person, the responsible department is one they
  // belong to, the objective is linked to one of their departments
  // through the `objective_departments` junction, OR they're the
  // assignee on any of its tasks. Mirrors the visibility rule used
  // on the check-in page.
  const isObjectiveMine = useMemo(() => {
    return (o: ObjectiveRow): boolean => {
      if (!profile?.id) return false;
      if (o.responsible_user_id === profile.id) return true;
      if (o.responsible_department_id && myDeptIds.has(o.responsible_department_id))
        return true;
      const linked = deptIdsByObjective.get(o.id);
      if (linked && Array.from(linked).some((id) => myDeptIds.has(id))) return true;
      if ((o.tasks || []).some((t) => t.assigned_user_id === profile.id)) return true;
      return false;
    };
  }, [profile?.id, myDeptIds, deptIdsByObjective]);

  const filteredRows = filterScope === 'all' ? rows : rows.filter(isObjectiveMine);

  // KPIs to render in Listado. When scope is "mine" we further hide
  // KPI sections whose objectives all got filtered out AND which the
  // user has no direct claim on (responsible person / responsible
  // department) — otherwise empty section headers would clutter the
  // view.
  const isKpiMine = useMemo(() => {
    return (k: KPI): boolean => {
      if (!profile?.id) return false;
      if (k.responsible_user_id === profile.id) return true;
      if (k.responsible_department_id && myDeptIds.has(k.responsible_department_id))
        return true;
      return false;
    };
  }, [profile?.id, myDeptIds]);

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

  // FLIP animation state. `flipSnapshot` caches the bounding rect of
  // every KPI section keyed by its `data-flip-key` attribute right
  // before we call setKpis(). After React paints the new order, the
  // useLayoutEffect below reads the new rects, computes each card's
  // delta, and plays a translate(dx,dy) → translate(0,0) transition
  // so cards visibly slide to their new positions.
  //
  // Works for both the detailed list view and the 3-col resumida grid
  // because the same [data-flip-key] attribute is attached to each
  // section root regardless of layout.
  const flipSnapshot = useRef<Map<string, DOMRect>>(new Map());

  function captureFlip() {
    const els = document.querySelectorAll<HTMLElement>('[data-flip-key]');
    const snap = new Map<string, DOMRect>();
    els.forEach((el) => {
      const key = el.dataset.flipKey;
      if (key) snap.set(key, el.getBoundingClientRect());
    });
    flipSnapshot.current = snap;
  }

  useLayoutEffect(() => {
    if (flipSnapshot.current.size === 0) return;
    const els = document.querySelectorAll<HTMLElement>('[data-flip-key]');
    els.forEach((el) => {
      const key = el.dataset.flipKey;
      if (!key) return;
      const prev = flipSnapshot.current.get(key);
      if (!prev) return;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // Force a reflow so the browser commits the "invert" transform
      // before we clear it — without this the transition is skipped.
      void el.offsetHeight;
      el.style.transition = 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = '';
    });
    flipSnapshot.current = new Map();
  }, [kpis]);

  async function moveKpi(kpiId: string, direction: -1 | 1) {
    const idx = kpis.findIndex((k) => k.id === kpiId);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= kpis.length) return;
    // Snapshot BEFORE the DOM updates so FLIP has a valid "first".
    captureFlip();
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

  // The hero + department bars section is a tall block that only makes sense
  // when the user is looking at the operational views (Listado / Gantt).
  // On Métricas the same data is presented as full stat cards, and on the
  // Skill Tree it would crowd the canvas, so we hide it there.
  const showHeroBlock = activeTab === 'listado' || activeTab === 'gantt';

  return (
    <div>
      {showHeroBlock && (
        <>
          {/* Hero summary block — transparent, floats on the page bg. */}
          <ObjetivosHero
            periodName={activePeriod?.name}
            total={rows.length}
            overallAvg={metrics.overallAvg}
            finishedCount={metrics.finishedCount}
            behindCount={metrics.behindCount}
            blockedCount={metrics.blockedCount}
            leaderboard={metrics.leaderboard}
            canCreate={Boolean(canEdit && activePeriod)}
            onCreate={() => setCreateFor(null)}
          />

          {/* Per-department progress bars */}
          {metrics.leaderboard.length > 0 && (
            <DepartmentBars rows={metrics.leaderboard} />
          )}
        </>
      )}

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
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
          Overview
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

      {activeTab === 'overview' && (
        <>
          {!activePeriod ? (
            <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo.</p>
            </div>
          ) : loading ? (
            <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando overview...</p>
          ) : (
            <ObjectivesOverview
              kpis={kpis}
              departments={departments}
              rows={rows}
              onOpenPanel={setPanelTarget}
            />
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
      {/* Filters row — scope pills on the left, vista toggle pinned to
          the right with `marginLeft: auto` so it floats against the
          right edge regardless of pill count. The scope filter
          replaces the previous status pills and limits the list to
          the user / their department when "Asignados a mí" is
          active. */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '2rem', alignItems: 'center' }}>
        {(['all', 'mine'] as const).map((s) => {
          const labels = { all: 'Todos', mine: 'Asignados a mí' };
          return (
            <button
              key={s}
              onClick={() => setFilterScope(s)}
              style={{
                padding: '0.4rem 1.2rem',
                fontSize: '1.3rem',
                fontWeight: filterScope === s ? 600 : 400,
                color: filterScope === s ? '#5c6ac4' : '#637381',
                backgroundColor: filterScope === s ? '#f4f5fc' : 'transparent',
                border: filterScope === s ? '1px solid #5c6ac4' : '1px solid #dfe3e8',
                borderRadius: '20px',
                cursor: 'pointer',
              }}
            >
              {labels[s]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCollapsedListado((v) => !v)}
          aria-pressed={collapsedListado}
          title={collapsedListado ? 'Expandir todas las secciones' : 'Colapsar todas las secciones'}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.4rem 1.2rem',
            fontSize: '1.3rem',
            fontWeight: 500,
            color: '#454f5b',
            backgroundColor: 'white',
            border: '1px solid #dfe3e8',
            borderRadius: '20px',
            cursor: 'pointer',
          }}
        >
          <VistaToggleIcon collapsed={collapsedListado} />
          {collapsedListado ? 'Vista detallada' : 'Vista resumida'}
        </button>
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
        // Vista detallada renders sections top-to-bottom with their full
        // tables. Vista resumida swaps the container to a 3-column grid
        // of compact summary cards — KpiSection and OrphanSection both
        // branch internally on `collapsed` to render the compact form.
        <div
          style={
            collapsedListado
              ? {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '1.6rem',
                  alignItems: 'stretch',
                }
              : {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2.4rem',
                }
          }
        >
          {kpis.map((kpi, idx) => {
            const kpiRows = rowsByKpi.map.get(kpi.id) || [];
            // In "Asignados a mí" mode, hide a KPI section when both
            // it and its objectives are unrelated to the user — that
            // way the view collapses cleanly to just the user's
            // surface area instead of leaving empty headers.
            if (filterScope === 'mine' && kpiRows.length === 0 && !isKpiMine(kpi)) {
              return null;
            }
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
                collapsed={collapsedListado}
                onAddObjective={() => setCreateFor(kpi.id)}
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
              collapsed={collapsedListado}
              onAddObjective={() => setCreateFor(null)}
            />
          )}
        </div>
      )}
      </>}

      {createFor !== undefined && activePeriod && currentWorkspace && (
        <ObjectiveForm
          workspaceId={currentWorkspace.id}
          periodId={activePeriod.id}
          onClose={() => setCreateFor(undefined)}
          onSaved={() => { setCreateFor(undefined); refetch(); }}
          initialData={createFor ? { kpi_ids: [createFor] } : undefined}
        />
      )}

      <OkrDetailPanel
        target={panelTarget}
        departments={departments}
        canEdit={canEdit}
        canEditKpi={canEditKpi}
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
  /** When true, hides the ObjectivesTable and shows only the header. */
  collapsed?: boolean;
  /** When provided, the ObjectivesTable renders its "+ Agregar objetivo"
   *  footer row and calls this on click so the parent can open its
   *  ObjectiveForm pre-linked to this KPI. */
  onAddObjective?: () => void;
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
  collapsed = false,
  onAddObjective,
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

  // Vista resumida — render a compact card designed to sit in a 3-col
  // grid. All the interactive elements from the detailed view are
  // preserved (title button opens the detail panel; reorder buttons
  // reorder; status pill stays decorative as in detailed mode) but
  // re-stacked for the narrower footprint.
  if (collapsed) {
    return (
      <div
        className="Polaris-Card"
        data-flip-key={kpi.id}
        style={{
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'white',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          // Override the global `.Polaris-Card + .Polaris-Card { margin-top: 2rem }`
          // rule so every card in the grid aligns to the same top Y.
          // Without this, the 2nd+ card in each row sits 2rem lower
          // than the first.
          marginTop: 0,
        }}
      >
        {/* Top band — ring left, status pill right. Gives the card a
            visual anchor at the very top and keeps the status chip in
            a predictable slot for scanning across a grid. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.8rem',
            padding: '1.2rem 1.4rem 0.4rem',
          }}
        >
          <KpiRing value={progress} />
          <KpiStatusPill status={kpi.status} />
        </div>

        {/* Title block — eyebrow "KPI · DEPT", clickable title, and
            the optional description. Same elements as the detailed
            header but vertically stacked. */}
        <div style={{ flex: 1, padding: '0.6rem 1.4rem 1rem', minWidth: 0 }}>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              color: '#637381',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '0.3rem',
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
              fontSize: '1.95rem',
              fontWeight: 600,
              color: '#212b36',
              cursor: 'pointer',
              textAlign: 'left',
              lineHeight: 1.25,
              maxWidth: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            title={kpi.title}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                minWidth: 0,
              }}
            >
              {kpi.title}
            </span>
            <TitleArrow />
          </button>
          {kpi.description && (
            <p
              style={{
                fontSize: '1.15rem',
                color: '#637381',
                margin: '0.4rem 0 0',
                lineHeight: 1.45,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
              title={kpi.description}
            >
              {kpi.description}
            </p>
          )}
        </div>

        {/* Stats strip — 3 equal cells with vertical dividers. Mirrors
            the "N · M · K" inline summary from the detailed header
            but broken out so each number is its own labeled chunk. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            borderTop: '1px solid #f1f2f4',
            backgroundColor: '#fafbfb',
          }}
        >
          <KpiStatCell value={rows.length} label="Objetivos" />
          <KpiStatCell value={inProgressCount} label="En progreso" withDivider />
          <KpiStatCell
            value={atRiskCount}
            label="En riesgo"
            warning={atRiskCount > 0}
            withDivider
          />
        </div>

        {canReorder && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.4rem',
              padding: '0.6rem 0.8rem',
              borderTop: '1px solid #f1f2f4',
              backgroundColor: '#fafbfb',
            }}
          >
            <ReorderButton direction="up" disabled={isFirst} onClick={onMoveUp} />
            <ReorderButton direction="down" disabled={isLast} onClick={onMoveDown} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="Polaris-Card"
      data-flip-key={kpi.id}
      style={{
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        backgroundColor: 'white',
        overflow: 'hidden',
        marginTop: 0,
      }}
    >
      {/* Header: ring + title block + summary + reorder */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.6rem',
          padding: '1.6rem 2rem',
          borderBottom: collapsed ? 'none' : '1px solid #f1f2f4',
          backgroundColor: '#fafbfb',
        }}
      >
        <KpiRing value={progress} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section label — bumped from 10px → 14px per the design
              note ("unreadable at the old size"). Keeps the uppercase
              letter-spacing treatment so it still reads as metadata
              rather than body copy. */}
          <div
            style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              color: '#637381',
              letterSpacing: '0.05em',
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              maxWidth: '100%',
            }}
            title={kpi.title}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {kpi.title}
            </span>
            <TitleArrow />
          </button>
          {/* Description as subtitle — surfaces the KPI's narrative
              context right next to its title so users don't have to
              open the detail panel to remember what it's measuring. */}
          {kpi.description && (
            <p
              style={{
                fontSize: '1.25rem',
                color: '#637381',
                margin: '0.2rem 0 0',
                lineHeight: 1.45,
                maxWidth: '70ch',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
              title={kpi.description}
            >
              {kpi.description}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexShrink: 0 }}>
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
          <KpiStatusPill status={kpi.status} />
          {canReorder && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <ReorderButton direction="up" disabled={isFirst} onClick={onMoveUp} />
              <ReorderButton direction="down" disabled={isLast} onClick={onMoveDown} />
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <ObjectivesTable
          rows={rows}
          departments={departments}
          workspaceId={kpi.workspace_id}
          canEdit={canEdit}
          onChanged={onChanged}
          onOpenPanel={onOpenPanel}
          emptyLabel="No hay objetivos vinculados a este KPI."
          onAddObjective={onAddObjective}
        />
      )}
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

/**
 * Small right-chevron rendered next to every clickable KPI / objective
 * title as a "this opens" affordance. Inherits the parent's text color
 * so it reads as part of the title. When `opacity` is controlled from
 * the outside (e.g. shown only on row hover) the svg uses currentColor
 * and fades smoothly.
 */
function TitleArrow({ opacity = 1 }: { opacity?: number }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0,
        opacity,
        transition: 'opacity 140ms ease, transform 140ms ease',
      }}
      aria-hidden
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Icon for the Listado "Vista resumida" / "Vista detallada" toggle.
 *
 * - collapsed=false (current state is detailed) → shows a "compress"
 *   glyph: a horizontal bar above a line (cards collapsed into
 *   headers). Clicking will switch the view TO the summary layout,
 *   so the icon previews that outcome.
 * - collapsed=true (current state is summary) → shows an "expand"
 *   glyph: a header bar above three stacked rows, hinting that
 *   clicking will rewind to the full tables.
 */
function VistaToggleIcon({ collapsed }: { collapsed: boolean }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (collapsed) {
    // Click will expand → icon shows an expanded list (header + rows).
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="4" rx="1" />
        <path d="M3 11h18" />
        <path d="M3 15h18" />
        <path d="M3 19h18" />
      </svg>
    );
  }
  // Click will collapse → icon shows only headers stacked.
  return (
    <svg {...common}>
      <rect x="3" y="3" width="18" height="4" rx="1" />
      <rect x="3" y="11" width="18" height="4" rx="1" />
      <rect x="3" y="19" width="18" height="2" rx="1" />
    </svg>
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
  collapsed = false,
  onAddObjective,
}: {
  rows: ReturnType<typeof useObjectivesTable>['rows'];
  departments: Department[];
  workspaceId: string;
  canEdit: boolean;
  onChanged: () => void;
  onOpenPanel: (t: PanelTarget) => void;
  collapsed?: boolean;
  onAddObjective?: () => void;
}) {
  // Vista resumida — compact card so this section fits the same 3-col
  // grid as KpiSection. Shape mirrors the KPI card (eyebrow + title +
  // stats strip) minus the ring/status pill since orphans have no KPI
  // progress roll-up to show.
  if (collapsed) {
    return (
      <div
        className="Polaris-Card"
        data-flip-key="__orphans__"
        style={{
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'white',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          marginTop: 0,
        }}
      >
        <div style={{ flex: 1, padding: '1.2rem 1.4rem' }}>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              color: '#637381',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '0.3rem',
            }}
          >
            Sin KPI
          </div>
          <div
            style={{
              // Matches the KPI-card title scale in collapsed mode so
              // both section types read at the same visual weight when
              // they sit side-by-side in the grid.
              fontSize: '1.95rem',
              fontWeight: 600,
              color: '#212b36',
              lineHeight: 1.25,
            }}
          >
            Objetivos huérfanos
          </div>
          <p
            style={{
              fontSize: '1.15rem',
              color: '#637381',
              margin: '0.4rem 0 0',
              lineHeight: 1.45,
            }}
          >
            Objetivos no vinculados a ningún KPI.
          </p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            borderTop: '1px solid #f1f2f4',
            backgroundColor: '#fafbfb',
          }}
        >
          <KpiStatCell value={rows.length} label="Objetivos" />
          <KpiStatCell
            value={rows.filter((r) => r.status === 'in_progress').length}
            label="En progreso"
            withDivider
          />
          <KpiStatCell
            value={rows.filter((r) => isBehindSchedule(r)).length}
            label="En riesgo"
            warning={rows.some((r) => isBehindSchedule(r))}
            withDivider
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="Polaris-Card"
      data-flip-key="__orphans__"
      style={{
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        backgroundColor: 'white',
        overflow: 'hidden',
        marginTop: 0,
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
        onAddObjective={onAddObjective}
      />
    </div>
  );
}

/**
 * Single numeric stat cell used in the Vista resumida card footers.
 * Renders the value big and the label small/uppercase beneath. Optional
 * vertical divider on the left to separate from the previous cell; the
 * `warning` flag turns the value red (used for non-zero "en riesgo").
 */
function KpiStatCell({
  value,
  label,
  warning = false,
  withDivider = false,
}: {
  value: number;
  label: string;
  warning?: boolean;
  withDivider?: boolean;
}) {
  return (
    <div
      style={{
        padding: '0.8rem 0.4rem',
        textAlign: 'center',
        borderLeft: withDivider ? '1px solid #f1f2f4' : 'none',
      }}
    >
      <div
        style={{
          fontSize: '1.8rem',
          fontWeight: 700,
          color: warning ? '#bf0711' : '#212b36',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '0.95rem',
          fontWeight: 600,
          color: '#637381',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginTop: '0.2rem',
        }}
      >
        {label}
      </div>
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

// ──────────────── Hero + department bars (new top section) ────────────────

interface HeroLeaderboardRow {
  department: Department;
  total: number;
  finished: number;
  avg: number;
}

function ObjetivosHero({
  periodName,
  total,
  overallAvg,
  finishedCount,
  behindCount,
  blockedCount,
  leaderboard,
  canCreate,
  onCreate,
}: {
  periodName?: string;
  total: number;
  overallAvg: number;
  finishedCount: number;
  behindCount: number;
  blockedCount: number;
  leaderboard: HeroLeaderboardRow[];
  canCreate: boolean;
  onCreate: () => void;
}) {
  // Narrative built from per-department averages: call out the teams above
  // / below the line so the hero reads like a quick status note.
  const narrative = buildNarrative(leaderboard, overallAvg);
  return (
    <div
      style={{
        // Signature purple hero card — the flat rework below applied only
        // to the DepartmentBars block, not to this one.
        background: 'linear-gradient(180deg, #5c6ac4 0%, #4959bd 100%)',
        color: '#fff',
        borderRadius: '12px',
        padding: '2.4rem 2.8rem',
        marginBottom: '1.6rem',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '2.4rem',
        alignItems: 'center',
        boxShadow: '0 10px 30px -10px rgba(73,89,189,0.25)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: '1.1rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 600,
            marginBottom: '0.6rem',
          }}
        >
          Objetivos {periodName ? `· ${periodName}` : ''}
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '3rem',
            fontWeight: 700,
            letterSpacing: '-0.015em',
            lineHeight: 1.2,
          }}
        >
          <span>{total} objetivos, </span>
          <span style={{ color: '#ffe082' }}>{overallAvg}%</span>
          <span> de avance medio</span>
        </h1>
        <div
          style={{
            fontSize: '1.8rem',
            fontWeight: 600,
            marginTop: '0.4rem',
            color: 'rgba(255,255,255,0.92)',
          }}
        >
          {finishedCount} completados <span style={{ opacity: 0.5 }}>·</span>{' '}
          {behindCount} en riesgo <span style={{ opacity: 0.5 }}>·</span>{' '}
          {blockedCount} bloqueados
        </div>
        {narrative && (
          <p
            style={{
              margin: '1.4rem 0 0',
              fontSize: '1.4rem',
              lineHeight: '2.2rem',
              color: 'rgba(255,255,255,0.85)',
              maxWidth: '62ch',
            }}
          >
            {narrative}
          </p>
        )}
        {canCreate && (
          <div style={{ marginTop: '1.8rem' }}>
            <button
              onClick={onCreate}
              style={{
                padding: '0.8rem 1.6rem',
                fontSize: '1.3rem',
                fontWeight: 600,
                color: '#4959bd',
                background: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15,24,48,0.1)',
              }}
            >
              + Crear Objetivo
            </button>
          </div>
        )}
      </div>
      <HeroRing value={overallAvg} />
    </div>
  );
}

function HeroRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: '10rem',
          height: '10rem',
          position: 'relative',
        }}
      >
        <svg viewBox="0 0 40 40" width="100%" height="100%" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="20" cy="20" r="17" stroke="rgba(255,255,255,0.22)" strokeWidth="4" fill="none" />
          <circle
            cx="20"
            cy="20"
            r="17"
            stroke="#ffe082"
            strokeWidth="4"
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
            fontSize: '2.4rem',
            fontWeight: 700,
            color: '#fff',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clamped}%
        </div>
      </div>
      <div
        style={{
          marginTop: '0.4rem',
          fontSize: '1.05rem',
          color: 'rgba(255,255,255,0.75)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Promedio global
      </div>
    </div>
  );
}

/**
 * Data-driven hero narrative. Points out the teams above/below the mean
 * so the block reads like a short status note rather than a static label.
 */
function buildNarrative(leaderboard: HeroLeaderboardRow[], overallAvg: number): string | null {
  if (leaderboard.length === 0) return null;
  const sorted = [...leaderboard].sort((a, b) => b.avg - a.avg);
  const best = sorted.filter((d) => d.avg >= overallAvg + 5).slice(0, 2).map((d) => d.department.name);
  const worst = sorted
    .filter((d) => d.avg < overallAvg - 5)
    .slice(-1)
    .map((d) => d.department.name)[0];

  const parts: string[] = [];
  if (best.length === 2) parts.push(`${best[0]} y ${best[1]} están por encima del ritmo`);
  else if (best.length === 1) parts.push(`${best[0]} está por encima del ritmo`);
  if (worst) parts.push(`${worst} necesita atención`);
  if (parts.length === 0) parts.push('Todos los departamentos están cerca del promedio');
  return `${parts.join(' · ')}.`;
}

function DepartmentBars({ rows }: { rows: HeroLeaderboardRow[] }) {
  return (
    <div
      style={{
        // Transparent — matches the page background (no card, no border).
        padding: '0.4rem 0',
        background: 'transparent',
        marginBottom: '1.4rem',
      }}
    >
      <div
        style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#637381',
          marginBottom: '0.6rem',
        }}
      >
        Progreso por departamento
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          columnGap: '3.6rem',
          rowGap: '0.4rem',
        }}
      >
        {rows.map((r) => (
          <DepartmentBarRow key={r.department.id} row={r} />
        ))}
      </div>
    </div>
  );
}

function DepartmentBarRow({ row }: { row: HeroLeaderboardRow }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr 56px 68px',
        alignItems: 'center',
        columnGap: '1.2rem',
        fontSize: '1.25rem',
        // Zero vertical padding — parent's rowGap is the only spacing;
        // keeps the department list dense per the design note.
        padding: 0,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
        <span
          style={{
            width: '0.8rem',
            height: '0.8rem',
            borderRadius: '2px',
            backgroundColor: row.department.color || '#919eab',
          }}
        />
        <span style={{ fontWeight: 500, color: '#212b36' }}>{row.department.name}</span>
      </span>
      <div style={{ position: 'relative', height: '0.8rem', borderRadius: '999px', background: '#dfe3e8', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            right: 'auto',
            width: `${Math.max(0, Math.min(100, row.avg))}%`,
            background: '#5c6ac4',
            borderRadius: '999px',
          }}
        />
      </div>
      <span
        style={{
          textAlign: 'right',
          fontWeight: 700,
          color: '#212b36',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {row.avg}%
      </span>
      <span style={{ fontSize: '1.15rem', color: '#637381', textAlign: 'right' }}>
        {row.finished}/{row.total}
      </span>
    </div>
  );
}
