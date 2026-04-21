'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { canManageContent } from '@/lib/utils/permissions';
import { calculateObjectiveProgress } from '@/lib/utils/progress';
import {
  objectiveStatusChip,
  taskStatusChip,
  OBJECTIVE_STATUS_OPTIONS,
} from '@/components/okrs/status-chips';
import { AnimatedModal } from '@/components/common/animated-modal';
import { OkrDetailPanel, type PanelTarget } from '@/components/okrs/okr-detail-panel';
import { TaskForm } from '@/components/tasks/task-form';
import { ActivityList } from '@/components/layout/activity-list';
import { useActivityFeed, type EntityRef } from '@/hooks/use-activity-feed';
import type { Department, KPI, Objective, ObjectiveStatus, Task } from '@/types';

// ---------- Types ----------

type TaskRow = Task;

interface ObjectiveWithTasks extends Objective {
  tasks: TaskRow[];
  /** KPIs this objective is linked to, to group into sections. */
  linked_kpi_ids: string[];
}

interface PendingObjectiveUpdate {
  // Track the submitted delta so we can create checkin_entries on save.
  new_progress?: number;
  new_status?: ObjectiveStatus;
  comment?: string;
}

// ---------- Month name ----------

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const MONTHS_ES_ABBR = [
  'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC',
];

function formatCheckinTitle(d: Date): string {
  return `Check-in del día ${d.getDate()} - ${MONTHS_ES[d.getMonth()]}`;
}

/** "01 ABR" style date, for the period start/end labels in the hero. */
function formatShortDateEs(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ES_ABBR[d.getMonth()]}`;
}

// ---------- Page ----------

export default function CheckinPage() {
  const { currentWorkspace, activePeriod, profile, userWorkspace } = useWorkspaceStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedToastId, setSavedToastId] = useState(0);

  const [kpis, setKpis] = useState<KPI[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveWithTasks[]>([]);
  const [myAssignedTasks, setMyAssignedTasks] = useState<
    Array<Task & { objective: Objective | null }>
  >([]);

  // Pending edits. Keyed by objective id / task id.
  const [objectiveEdits, setObjectiveEdits] = useState<Map<string, PendingObjectiveUpdate>>(
    new Map(),
  );
  const [tasksToComplete, setTasksToComplete] = useState<Set<string>>(new Set());
  // "¿En qué estás pensando?" — free-form note for the whole check-in
  // session. Saved on the `checkins.summary` field and surfaced in the
  // activity timeline as the check-in event's quote.
  const [thought, setThought] = useState<string>('');
  // Total check-ins this user has done during the current period.
  // Feeds the hero ("Llevas N checkins en M meses"). We don't need the
  // rows — just the count — so the query uses `head: true`.
  const [checkinsCount, setCheckinsCount] = useState(0);

  // Expand state (per objective)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Modal state
  const [editingObjective, setEditingObjective] = useState<ObjectiveWithTasks | null>(null);
  const [addingTaskFor, setAddingTaskFor] = useState<{ objectiveId: string | null } | null>(null);

  // Side panel state
  const [panelTarget, setPanelTarget] = useState<PanelTarget>(null);

  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));

  // Activity feed shown under "Mis tareas". Same data source as the bell
  // slide-in; embedded look is flat — no card bg, subtle row dividers only.
  const {
    events: activityEvents,
    loading: activityLoading,
  } = useActivityFeed(currentWorkspace?.id);

  // Embedded rows open the existing detail panel instead of navigating
  // away (the check-in page already mounts OkrDetailPanel at the bottom).
  const handleActivityOpen = useCallback(
    (ref: EntityRef) => {
      if (ref.type === 'kpi') setPanelTarget({ type: 'kpi', id: ref.id });
      else if (ref.type === 'objective') setPanelTarget({ type: 'objective', id: ref.id });
      else if (ref.type === 'task') setPanelTarget({ type: 'task', id: ref.id });
    },
    [],
  );

  const load = useCallback(async () => {
    if (!currentWorkspace?.id || !activePeriod?.id || !profile?.id) return;
    setLoading(true);

    const supabase = createClient();

    // 1) User's departments (to scope visibility by team).
    const { data: udData } = await supabase
      .from('user_departments')
      .select('department_id')
      .eq('user_id', profile.id);
    const myDeptIds = new Set(
      (udData || []).map((r: { department_id: string }) => r.department_id),
    );

    // 2) KPIs for the period in persisted order.
    const { data: kpiRows } = await supabase
      .from('kpis')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .eq('period_id', activePeriod.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    setKpis((kpiRows || []) as KPI[]);

    // 3) Departments list (for the side panel's Detalles card).
    const { data: deptRows } = await supabase
      .from('departments')
      .select('*')
      .eq('workspace_id', currentWorkspace.id);
    setDepartments((deptRows || []) as Department[]);

    // 4) All objectives for the period + tasks + junctions.
    const [objRes, objDeptRes, kpiObjRes] = await Promise.all([
      supabase
        .from('objectives')
        .select('*, tasks(*)')
        .eq('workspace_id', currentWorkspace.id)
        .eq('period_id', activePeriod.id)
        .order('created_at', { ascending: false }),
      supabase.from('objective_departments').select('objective_id, department_id'),
      supabase.from('kpi_objectives').select('objective_id, kpi_id'),
    ]);

    const allObjectives = (objRes.data || []) as ObjectiveWithTasks[];
    const objDepts = (objDeptRes.data || []) as Array<{ objective_id: string; department_id: string }>;
    const objKpis = (kpiObjRes.data || []) as Array<{ objective_id: string; kpi_id: string }>;

    const deptsByObjective = new Map<string, Set<string>>();
    objDepts.forEach((r) => {
      const s = deptsByObjective.get(r.objective_id) || new Set<string>();
      s.add(r.department_id);
      deptsByObjective.set(r.objective_id, s);
    });
    const kpisByObjective = new Map<string, string[]>();
    objKpis.forEach((r) => {
      const arr = kpisByObjective.get(r.objective_id) || [];
      arr.push(r.kpi_id);
      kpisByObjective.set(r.objective_id, arr);
    });

    // 5) Filter to objectives the user owns OR linked to one of their departments.
    const visible: ObjectiveWithTasks[] = [];
    for (const o of allObjectives) {
      const isMine = o.responsible_user_id === profile.id;
      const deptResponsible =
        o.responsible_department_id && myDeptIds.has(o.responsible_department_id);
      const deptLinked = Array.from(deptsByObjective.get(o.id) || []).some((id) =>
        myDeptIds.has(id),
      );
      const hasAssignedTask = (o.tasks || []).some((t) => t.assigned_user_id === profile.id);

      if (isMine || deptResponsible || deptLinked || hasAssignedTask) {
        visible.push({
          ...o,
          tasks: o.tasks || [],
          linked_kpi_ids: kpisByObjective.get(o.id) || [],
        });
      }
    }
    setObjectives(visible);

    // 6) Tasks directly assigned to the user (for the left column).
    const { data: myTasks } = await supabase
      .from('tasks')
      .select('*, objective:objectives!tasks_objective_id_fkey(*)')
      .eq('assigned_user_id', profile.id)
      .order('created_at', { ascending: true });
    // Supabase typings can flatten the nested `objective` into an array in some
    // versions; normalize to a single object before filtering so we don't
    // silently drop tasks (and so the subtitle reliably renders).
    const normalized = ((myTasks || []) as Array<
      Task & { objective: Objective | Objective[] | null }
    >).map((t) => ({
      ...t,
      objective: Array.isArray(t.objective) ? t.objective[0] ?? null : t.objective,
    })) as Array<Task & { objective: Objective | null }>;
    const filtered = normalized.filter(
      (t) =>
        t.objective?.workspace_id === currentWorkspace.id &&
        t.objective?.period_id === activePeriod.id,
    );
    setMyAssignedTasks(filtered);

    // 7) Total check-ins this user has submitted in the current period.
    // head: true means "return no rows, just the count header" — cheap.
    const { count: checkinsTotal } = await supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('period_id', activePeriod.id);
    setCheckinsCount(checkinsTotal ?? 0);

    setLoading(false);
  }, [currentWorkspace?.id, activePeriod?.id, profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Group by KPI for rendering.
  const grouped = useMemo(() => {
    const map = new Map<string, ObjectiveWithTasks[]>();
    const orphans: ObjectiveWithTasks[] = [];
    objectives.forEach((o) => {
      if (o.linked_kpi_ids.length === 0) {
        orphans.push(o);
        return;
      }
      o.linked_kpi_ids.forEach((kid) => {
        const arr = map.get(kid) || [];
        arr.push(o);
        map.set(kid, arr);
      });
    });
    return { map, orphans };
  }, [objectives]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTaskCompletion(t: TaskRow) {
    if (t.status === 'completed') return; // already done
    setTasksToComplete((prev) => {
      const next = new Set(prev);
      if (next.has(t.id)) next.delete(t.id);
      else next.add(t.id);
      return next;
    });
  }

  function applyObjectiveEdit(objId: string, patch: PendingObjectiveUpdate) {
    setObjectiveEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(objId) || {};
      const merged = { ...existing, ...patch };
      const isEmpty =
        merged.new_progress === undefined &&
        merged.new_status === undefined &&
        !merged.comment?.trim();
      if (isEmpty) next.delete(objId);
      else next.set(objId, merged);
      return next;
    });
  }

  async function handleSave() {
    if (!currentWorkspace?.id || !activePeriod?.id || !profile?.id) return;
    setSaving(true);
    setSaveError('');
    const supabase = createClient();

    const { data: checkinData, error: checkinErr } = await supabase
      .from('checkins')
      .insert({
        user_id: profile.id,
        workspace_id: currentWorkspace.id,
        period_id: activePeriod.id,
        // Free-form note from the "¿En qué estás pensando?" card. NULL
        // when empty so the activity feed doesn't render an empty quote.
        summary: thought.trim() || null,
      })
      .select('id')
      .single();

    if (checkinErr || !checkinData) {
      setSaveError(checkinErr?.message || 'No se pudo crear el check-in');
      setSaving(false);
      return;
    }
    const checkinId = checkinData.id as string;

    const timelineInserts: Array<Promise<unknown>> = [];
    const checkinEntryInserts: Array<Record<string, unknown>> = [];

    const editEntries = Array.from(objectiveEdits.entries());
    for (const [objId, edit] of editEntries) {
      const obj = objectives.find((o) => o.id === objId);
      if (!obj) continue;

      const updates: Record<string, unknown> = {};
      if (edit.new_progress !== undefined) updates.manual_progress = edit.new_progress;
      if (edit.new_status !== undefined) updates.status = edit.new_status;
      if (Object.keys(updates).length > 0) {
        await supabase.from('objectives').update(updates).eq('id', objId);
      }

      checkinEntryInserts.push({
        checkin_id: checkinId,
        objective_id: objId,
        previous_progress: obj.manual_progress,
        new_progress: edit.new_progress ?? null,
        previous_status: obj.status,
        new_status: edit.new_status ?? null,
        note: edit.comment?.trim() || null,
      });

      if (edit.new_progress !== undefined && edit.new_progress !== obj.manual_progress) {
        // Canonical column names per the real schema: `new_value` (new
        // number), `previous_value` (audit). `workspace_id` isn't on
        // this table — RLS scopes via objective_id → objectives — so
        // we don't send it.
        timelineInserts.push(
          Promise.resolve(
            supabase.from('progress_logs').insert({
              user_id: profile.id,
              objective_id: objId,
              previous_value: obj.manual_progress,
              new_value: edit.new_progress,
              comment: edit.comment?.trim() || null,
            }),
          ),
        );
      }
      const parts: string[] = ['Check-in'];
      if (edit.new_status !== undefined && edit.new_status !== obj.status) {
        parts.push(`cambió estado a "${objectiveStatusChip(edit.new_status).label}"`);
      }
      if (edit.comment?.trim()) {
        parts.push(`— ${edit.comment.trim()}`);
      }
      if (parts.length > 1) {
        timelineInserts.push(
          Promise.resolve(
            supabase.from('comments').insert({
              user_id: profile.id,
              objective_id: objId,
              content: parts.join(' '),
            }),
          ),
        );
      }
    }

    const taskIds = Array.from(tasksToComplete);
    for (const taskId of taskIds) {
      // Task could live either in the team objectives OR in myAssignedTasks;
      // look up previous status from whichever source has it.
      const fromObj = objectives
        .flatMap((o) => o.tasks)
        .find((t) => t.id === taskId);
      const fromMine = myAssignedTasks.find((t) => t.id === taskId);
      const task = fromObj || fromMine;
      if (!task) continue;
      if (task.status === 'completed') continue;

      await supabase.from('tasks').update({ status: 'completed' }).eq('id', taskId);

      checkinEntryInserts.push({
        checkin_id: checkinId,
        task_id: taskId,
        previous_status: task.status,
        new_status: 'completed',
      });
    }

    if (checkinEntryInserts.length > 0) {
      await supabase.from('checkin_entries').insert(checkinEntryInserts);
    }
    await Promise.all(timelineInserts);

    setObjectiveEdits(new Map());
    setTasksToComplete(new Set());
    setThought('');
    setSavedToastId((n) => n + 1);
    await load();
    setSaving(false);
  }

  // Save button is rendered in-page (see the purple "Guardar check-in"
  // next to the daily title) so no topbar bridge is needed.

  const title = formatCheckinTitle(new Date());

  // Task list for the "new task" picker — any visible team objective.
  const pickableObjectives: Objective[] = useMemo(
    () => objectives.map((o) => o as Objective),
    [objectives],
  );

  if (!currentWorkspace) {
    return <div style={{ padding: '4rem', color: '#637381' }}>Cargando workspace...</div>;
  }

  return (
    <div>
      {/* Period hero — stats band pinned at the top of the check-in
          view. Only rendered when we have an active period (otherwise
          there's nothing meaningful to count). */}
      {activePeriod && (
        <CheckinHero
          periodName={activePeriod.name}
          periodStart={new Date(activePeriod.start_date)}
          periodEnd={new Date(activePeriod.end_date)}
          checkinsCount={checkinsCount}
        />
      )}

      {/* Day header — centered as a group on the page width (calendar
          badge + daily title block + Guardar button sit together,
          centered horizontally) rather than spreading to the left /
          right edges. Matches the design mock where the row reads as
          a single centered unit. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '3.2rem',
          marginBottom: '2.4rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.6rem' }}>
          {/* Calendar date badge — visual anchor for the daily title */}
          <CalendarDateBadge date={new Date()} />
          <div>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>{title}</h1>
            <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
              {activePeriod
                ? `Actualiza tus objetivos y tareas del periodo ${activePeriod.name}.`
                : 'Sin periodo activo'}
            </p>
          </div>
        </div>
        {/* Primary "Guardar check-in" action — purple, filled, with a
            check icon. Lives in the page header (to the right of the
            daily title block) per the design mock. The topbar
            suppresses its own middle CTA on /check-in to avoid a
            duplicate affordance. */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !activePeriod}
          aria-label="Reportar actualización"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.8rem',
            padding: '1.1rem 2rem',
            fontSize: '1.5rem',
            fontWeight: 600,
            color: 'white',
            backgroundColor: saving || !activePeriod ? '#8c92c4' : '#5c6ac4',
            border: 'none',
            borderRadius: '10px',
            cursor: saving || !activePeriod ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 2px rgba(15,24,48,0.08)',
            lineHeight: 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
          {saving ? 'Enviando…' : 'Reportar actualización'}
        </button>
      </div>

      {saveError && (
        <div style={{ padding: '1rem 1.2rem', backgroundColor: '#fbeae5', color: '#bf0711', borderRadius: '4px', marginBottom: '1.6rem', fontSize: '1.3rem' }}>
          {saveError}
        </div>
      )}
      {savedToastId > 0 && (
        <div
          key={savedToastId}
          className="anim-fade-in"
          style={{ padding: '1rem 1.2rem', backgroundColor: '#e3f1df', color: '#108043', borderRadius: '4px', marginBottom: '1.6rem', fontSize: '1.3rem' }}
        >
          Check-in guardado.
        </div>
      )}

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando objetivos...</p>
      ) : !activePeriod ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr minmax(260px, 30%)',
            gap: '2rem',
            alignItems: 'flex-start',
          }}
        >
          {/* Left column: per-KPI tables */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Section title — introduces the KPI-grouped tables as
                the "your department's objectives" block. Rendered here
                (rather than at the page level) so it tracks with the
                left column and doesn't sit above the Mis tareas card. */}
            <h2
              style={{
                fontSize: '1.8rem',
                fontWeight: 600,
                color: '#212b36',
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              Los objetivos de tu departamento
            </h2>
            {objectives.length === 0 ? (
              <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <p style={{ color: '#637381', fontSize: '1.4rem' }}>
                  No tienes objetivos asignados en este periodo.
                </p>
              </div>
            ) : (
              <>
                {kpis.map((kpi) => {
                  const rows = grouped.map.get(kpi.id) || [];
                  if (rows.length === 0) return null;
                  return (
                    <CheckinKpiTable
                      key={kpi.id}
                      kpiId={kpi.id}
                      kpiTitle={kpi.title}
                      rows={rows}
                      expanded={expanded}
                      onToggle={toggle}
                      objectiveEdits={objectiveEdits}
                      tasksToComplete={tasksToComplete}
                      onUpdateObjective={setEditingObjective}
                      onToggleTaskComplete={toggleTaskCompletion}
                      onOpenPanel={setPanelTarget}
                      onAddTaskForObjective={(oid) => setAddingTaskFor({ objectiveId: oid })}
                    />
                  );
                })}

                {grouped.orphans.length > 0 && (
                  <CheckinKpiTable
                    kpiId={null}
                    kpiTitle="Sin KPI asignado"
                    rows={grouped.orphans}
                    expanded={expanded}
                    onToggle={toggle}
                    objectiveEdits={objectiveEdits}
                    tasksToComplete={tasksToComplete}
                    onUpdateObjective={setEditingObjective}
                    onToggleTaskComplete={toggleTaskCompletion}
                    onOpenPanel={setPanelTarget}
                    onAddTaskForObjective={(oid) => setAddingTaskFor({ objectiveId: oid })}
                  />
                )}
              </>
            )}
          </div>

          {/* Right column: ¿En qué estás pensando? + Mis tareas +
              Actividad feed. Wrapper stacks them vertically. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Free-form thought captured as the check-in's summary —
                persisted to `checkins.summary` on save and surfaced on
                the activity timeline as the quote attached to the
                "hizo check-in" event. Background is transparent so the
                card blends with the page bg; the border + padding
                stay so it still reads as a discrete card. */}
            <div
              className="Polaris-Card"
              style={{
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'transparent',
                padding: '1.2rem 1.6rem',
              }}
            >
              <label
                htmlFor="checkin-thought"
                style={{
                  display: 'block',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  color: '#212b36',
                  marginBottom: '0.8rem',
                }}
              >
                ¿En qué estás pensando?
              </label>
              <textarea
                id="checkin-thought"
                value={thought}
                onChange={(e) => setThought(e.target.value)}
                rows={3}
                placeholder="Agrega una nota para tu check-in…"
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  fontSize: '1.3rem',
                  color: '#212b36',
                  border: '1px solid #dfe3e8',
                  borderRadius: '6px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.45,
                }}
              />
            </div>

            <MyTasksColumn
              tasks={myAssignedTasks}
              tasksToComplete={tasksToComplete}
              onToggleComplete={toggleTaskCompletion}
              onOpenTask={(t) => setPanelTarget({ type: 'task', id: t.id })}
              onOpenObjective={(oid) => setPanelTarget({ type: 'objective', id: oid })}
              onAddTask={() => setAddingTaskFor({ objectiveId: null })}
            />

            {/* Embedded activity timeline. Flat — no card bg — subtle
                top/bottom borders only so it reads as part of the page. */}
            <section aria-label="Actividad reciente">
              <div
                style={{
                  padding: '1rem 0 0.8rem',
                  borderBottom: '1px solid #edeff2',
                  marginBottom: '0.4rem',
                }}
              >
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#212b36' }}>
                  Actividad
                </h2>
                <p style={{ fontSize: '1.1rem', color: '#637381', marginTop: '0.2rem' }}>
                  Últimos movimientos del workspace
                </p>
              </div>
              <ActivityList
                events={activityEvents}
                loading={activityLoading}
                onOpen={handleActivityOpen}
                variant="embed"
              />
            </section>
          </div>
        </div>
      )}

      {editingObjective && (
        <ObjectiveUpdateModal
          objective={editingObjective}
          current={objectiveEdits.get(editingObjective.id) || {}}
          onClose={() => setEditingObjective(null)}
          onSave={(patch) => {
            applyObjectiveEdit(editingObjective.id, patch);
            setEditingObjective(null);
          }}
          onClear={() => {
            setObjectiveEdits((prev) => {
              const next = new Map(prev);
              next.delete(editingObjective.id);
              return next;
            });
            setEditingObjective(null);
          }}
        />
      )}

      {addingTaskFor && currentWorkspace && activePeriod && (
        <TaskForm
          objectiveId={addingTaskFor.objectiveId ?? undefined}
          allowObjectivePicker={addingTaskFor.objectiveId === null}
          pickableObjectives={pickableObjectives}
          workspaceId={currentWorkspace.id}
          periodId={activePeriod.id}
          onClose={() => setAddingTaskFor(null)}
          onSaved={() => {
            setAddingTaskFor(null);
            load();
          }}
        />
      )}

      <OkrDetailPanel
        target={panelTarget}
        departments={departments}
        canEdit={canEdit}
        onClose={() => setPanelTarget(null)}
        onChanged={load}
      />
    </div>
  );
}

// ---------- Left column ----------

interface MyTasksColumnProps {
  tasks: Array<Task & { objective: Objective | null }>;
  tasksToComplete: Set<string>;
  onToggleComplete: (t: Task) => void;
  onOpenTask: (t: Task) => void;
  onOpenObjective: (objectiveId: string) => void;
  onAddTask: () => void;
}

function MyTasksColumn({
  tasks,
  tasksToComplete,
  onToggleComplete,
  onOpenTask,
  onOpenObjective,
  onAddTask,
}: MyTasksColumnProps) {
  // Unfinished tasks (incl. queued-as-complete-but-not-yet-persisted)
  // always render before finished ones — that's the column's practical
  // focus: "what do I still need to do?" Within each bucket keep the
  // original order (oldest first).
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDone = a.status === 'completed' ? 1 : 0;
      const bDone = b.status === 'completed' ? 1 : 0;
      return aDone - bDone;
    });
  }, [tasks]);

  // Each row is ~8rem tall (varies with wrapped titles). Cap the
  // scrollable list at five rows of that typical height so tall task
  // lists don't push the activity timeline off the page.
  const MAX_ROWS = 5;
  const APPROX_ROW_HEIGHT = '8rem';

  return (
    // Background is transparent so the card blends with the page bg;
    // the border + inner padding remain so the list still reads as a
    // discrete card.
    <div
      className="Polaris-Card"
      style={{
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        backgroundColor: 'transparent',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.2rem 1.6rem',
          borderBottom: '1px solid #f1f2f4',
          backgroundColor: 'transparent',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#212b36' }}>Mis tareas</h2>
          <p style={{ fontSize: '1.1rem', color: '#637381', marginTop: '0.2rem' }}>
            {tasks.length} asignadas
          </p>
        </div>
        {/* Gray outlined pill — matches the new visual language where
            Actualizar is the one blue primary and everything else reads
            as secondary. */}
        <button
          type="button"
          onClick={onAddTask}
          style={{
            padding: '0.4rem 1rem',
            fontSize: '1.2rem',
            fontWeight: 500,
            color: '#637381',
            backgroundColor: 'white',
            border: '1px solid #dfe3e8',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          + Nueva tarea
        </button>
      </div>

      {tasks.length === 0 ? (
        <p style={{ padding: '2rem', color: '#637381', fontSize: '1.3rem', textAlign: 'center' }}>
          No tienes tareas asignadas.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            // Cap the visible height at ~5 rows; scroll beyond that.
            // Only kick in when we have more than MAX_ROWS tasks so
            // shorter lists sit at their natural height without an
            // unused scroll gutter.
            maxHeight:
              tasks.length > MAX_ROWS
                ? `calc(${APPROX_ROW_HEIGHT} * ${MAX_ROWS})`
                : undefined,
            overflowY: tasks.length > MAX_ROWS ? 'auto' : 'visible',
          }}
        >
          {sortedTasks.map((t) => {
            const queued = tasksToComplete.has(t.id);
            const isDone = t.status === 'completed';
            const chip = taskStatusChip(queued ? 'completed' : t.status);
            return (
              <li
                key={t.id}
                className="anim-row-in"
                // Row padding / divider preserved from the original card
                // shape. Background is transparent so the list floats on
                // the page bg like the rest of this column; `queued`
                // rows keep a faint lilac wash so a user who's about to
                // mark a task complete on save can see what's pending.
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.8rem',
                  padding: '1rem 1.6rem',
                  borderBottom: '1px solid #f4f6f8',
                  backgroundColor: queued ? '#f4f5fc' : 'transparent',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(t)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      font: 'inherit',
                      textAlign: 'left',
                      fontSize: '1.3rem',
                      fontWeight: 500,
                      color: isDone ? '#919eab' : '#212b36',
                      textDecoration: isDone ? 'line-through' : 'none',
                      cursor: 'pointer',
                      wordBreak: 'break-word',
                    }}
                  >
                    {t.title}
                  </button>
                  {t.objective ? (
                    <button
                      type="button"
                      onClick={() => onOpenObjective(t.objective!.id)}
                      title={`Abrir objetivo: ${t.objective.title}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        marginTop: '0.3rem',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        font: 'inherit',
                        fontSize: '1.1rem',
                        // Done rows get a lighter tone on the objective
                        // label so the whole secondary line reads as
                        // subdued along with the title.
                        color: isDone ? '#919eab' : '#637381',
                        cursor: 'pointer',
                        textAlign: 'left',
                        maxWidth: '100%',
                      }}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="6" />
                        <circle cx="12" cy="12" r="2" />
                      </svg>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Objetivo:{' '}
                        <span style={{ color: isDone ? '#919eab' : '#454f5b' }}>
                          {t.objective.title}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <span
                      style={{
                        display: 'block',
                        marginTop: '0.3rem',
                        fontSize: '1.1rem',
                        color: '#919eab',
                        fontStyle: 'italic',
                      }}
                    >
                      Sin objetivo
                    </span>
                  )}
                  <div style={{ marginTop: '0.4rem' }}>
                    <StaticChip chip={chip} />
                  </div>
                </div>
                {/* "Terminada" — rectangular replacement for the old
                    round check-circle, per the design update. Same gray
                    outlined style as + Nueva tarea / + Tarea so the
                    whole surface reads as a consistent secondary action
                    family. Disabled (kept visually the same, but
                    non-interactive) once the task is already
                    completed. */}
                <TaskCompleteButton
                  checked={queued || isDone}
                  disabled={isDone}
                  onClick={() => onToggleComplete(t)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Per-KPI table ----------

interface CheckinKpiTableProps {
  kpiId: string | null;
  kpiTitle: string;
  rows: ObjectiveWithTasks[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  objectiveEdits: Map<string, PendingObjectiveUpdate>;
  tasksToComplete: Set<string>;
  onUpdateObjective: (obj: ObjectiveWithTasks) => void;
  onToggleTaskComplete: (t: TaskRow) => void;
  onOpenPanel: (t: PanelTarget) => void;
  onAddTaskForObjective: (objectiveId: string) => void;
}

function CheckinKpiTable({
  kpiId,
  kpiTitle,
  rows,
  expanded,
  onToggle,
  objectiveEdits,
  tasksToComplete,
  onUpdateObjective,
  onToggleTaskComplete,
  onOpenPanel,
  onAddTaskForObjective,
}: CheckinKpiTableProps) {
  const headerCell: React.CSSProperties = {
    padding: '1rem 1.6rem',
    textAlign: 'left',
    fontSize: '1.2rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#637381',
    borderBottom: '1px solid #dfe3e8',
    backgroundColor: '#fafbfb',
  };
  const cellBase: React.CSSProperties = {
    padding: '1rem 1.6rem',
    borderBottom: '1px solid #f1f2f4',
    fontSize: '1.4rem',
    color: '#212b36',
    verticalAlign: 'middle',
  };

  return (
    <div
      className="Polaris-Card"
      style={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'white', overflow: 'hidden' }}
    >
      <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid #f1f2f4', backgroundColor: '#fafbfb' }}>
        {kpiId ? (
          <button
            type="button"
            onClick={() => onOpenPanel({ type: 'kpi', id: kpiId })}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              font: 'inherit',
              fontSize: '1.6rem',
              fontWeight: 600,
              color: '#212b36',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {kpiTitle}
          </button>
        ) : (
          <span style={{ fontSize: '1.6rem', fontWeight: 600, color: '#637381' }}>{kpiTitle}</span>
        )}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerCell, width: '45%' }}>Nombre</th>
            <th style={headerCell}>Estado</th>
            <th style={headerCell}>Progreso</th>
            <th style={{ ...headerCell, width: '170px' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((obj) => {
            const isExpanded = expanded.has(obj.id);
            const hasTasks = obj.tasks.length > 0;
            const edit = objectiveEdits.get(obj.id);
            const effectiveStatus = edit?.new_status ?? obj.status;
            const effectiveProgress =
              edit?.new_progress ?? calculateObjectiveProgress(obj, obj.tasks);
            const hasPending = Boolean(edit);
            const statusChip = objectiveStatusChip(effectiveStatus);

            return (
              <ObjectiveRowGroup key={obj.id}>
                <tr
                  className="anim-row-in"
                  onClick={hasTasks ? () => onToggle(obj.id) : undefined}
                  style={{
                    cursor: hasTasks ? 'pointer' : 'default',
                    backgroundColor: hasPending ? '#f4f5fc' : isExpanded ? '#f9fafb' : 'white',
                  }}
                >
                  <td style={cellBase}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Chevron expanded={isExpanded} visible={hasTasks} />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPanel({ type: 'objective', id: obj.id });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          margin: 0,
                          font: 'inherit',
                          fontSize: '1.4rem',
                          fontWeight: 600,
                          color: '#212b36',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        {obj.title}
                      </button>
                      {hasPending && (
                        <span
                          title="Pendiente de guardar"
                          aria-label="Pendiente de guardar"
                          style={{ display: 'inline-flex', alignItems: 'center', color: '#5c6ac4', flexShrink: 0 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={cellBase}>
                    <StaticChip chip={statusChip} />
                  </td>
                  <td style={cellBase}>
                    <MiniProgress value={effectiveProgress} />
                  </td>
                  <td style={cellBase}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddTaskForObjective(obj.id);
                        }}
                        aria-label="Agregar tarea"
                        style={{
                          padding: '0.3rem 0.7rem',
                          fontSize: '1.2rem',
                          color: '#637381',
                          backgroundColor: 'white',
                          border: '1px solid #dfe3e8',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        + Tarea
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateObjective(obj);
                        }}
                        // Blue outline + blue text. Keeps Actualizar as
                        // the stand-out primary action on the row without
                        // the heavy filled purple look we used before.
                        style={{
                          padding: '0.3rem 0.9rem',
                          fontSize: '1.2rem',
                          color: '#026fff',
                          backgroundColor: 'white',
                          border: '1px solid #026fff',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Actualizar
                      </button>
                    </div>
                  </td>
                </tr>

                {isExpanded &&
                  obj.tasks.map((t) => {
                    const queued = tasksToComplete.has(t.id);
                    const isDone = t.status === 'completed';
                    const chip = taskStatusChip(queued ? 'completed' : t.status);
                    return (
                      <tr
                        key={t.id}
                        className="anim-row-in"
                        style={{ backgroundColor: queued ? '#f4f5fc' : 'white' }}
                      >
                        <td style={cellBase}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', paddingLeft: '2.6rem' }}>
                            <span style={{ fontSize: '1.1rem', color: '#919eab' }}>↳</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenPanel({ type: 'task', id: t.id });
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                margin: 0,
                                font: 'inherit',
                                textAlign: 'left',
                                color: '#454f5b',
                                cursor: 'pointer',
                              }}
                            >
                              {t.title}
                            </button>
                            {queued && (
                              <span style={{ fontSize: '1.1rem', color: '#5c6ac4', backgroundColor: '#ede7ff', padding: '2px 8px', borderRadius: '10rem' }}>
                                Se marcará completada
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={cellBase}>
                          <StaticChip chip={chip} />
                        </td>
                        <td style={cellBase}>
                          <span style={{ color: '#919eab', fontSize: '1.2rem' }}>—</span>
                        </td>
                        <td style={cellBase}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <TaskCompleteButton
                              checked={queued || isDone}
                              disabled={isDone}
                              onClick={() => onToggleTaskComplete(t)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </ObjectiveRowGroup>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Fragment wrapper — tr elements must be direct siblings inside <tbody>. */
function ObjectiveRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ---------- Update modal ----------

interface ObjectiveUpdateModalProps {
  objective: ObjectiveWithTasks;
  current: PendingObjectiveUpdate;
  onClose: () => void;
  onSave: (patch: PendingObjectiveUpdate) => void;
  onClear: () => void;
}

function ObjectiveUpdateModal({ objective, current, onClose, onSave, onClear }: ObjectiveUpdateModalProps) {
  const [progress, setProgress] = useState<number>(
    current.new_progress ?? objective.manual_progress,
  );
  const [status, setStatus] = useState<ObjectiveStatus>(current.new_status ?? objective.status);
  const [comment, setComment] = useState(current.comment ?? '');

  const showManual =
    objective.progress_mode === 'manual' || objective.progress_mode === 'hybrid';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const patch: PendingObjectiveUpdate = {};
    if (showManual && progress !== objective.manual_progress) patch.new_progress = progress;
    if (status !== objective.status) patch.new_status = status;
    if (comment.trim()) patch.comment = comment.trim();

    if (
      patch.new_progress === undefined &&
      patch.new_status === undefined &&
      !patch.comment &&
      !current.new_progress &&
      !current.new_status &&
      !current.comment
    ) {
      onClose();
      return;
    }
    onSave(patch);
  }

  return (
    <AnimatedModal open={true} onClose={onClose} width={480}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>Actualizar objetivo</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
        </div>
        <p style={{ fontSize: '1.3rem', color: '#637381', marginBottom: '1.6rem' }}>{objective.title}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          {showManual && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '1.3rem', color: '#454f5b', fontWeight: 500 }}>Progreso manual</label>
                <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36' }}>{progress}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#5c6ac4' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '1.3rem', fontWeight: 500, marginBottom: '0.4rem', color: '#454f5b' }}>Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ObjectiveStatus)}
              style={{ width: '100%', padding: '0.6rem 1rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px', backgroundColor: 'white' }}
            >
              {OBJECTIVE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '1.3rem', fontWeight: 500, marginBottom: '0.4rem', color: '#454f5b' }}>Comentario</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Contexto adicional que se añadirá al timeline"
              style={{ width: '100%', padding: '0.6rem 1rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
            {(current.new_progress !== undefined || current.new_status !== undefined || current.comment) && (
              <button
                type="button"
                onClick={onClear}
                style={{ padding: '0.6rem 1.2rem', fontSize: '1.3rem', color: '#637381', backgroundColor: 'transparent', border: '1px solid #dfe3e8', borderRadius: '4px', cursor: 'pointer' }}
              >
                Descartar cambios
              </button>
            )}
            <button
              type="submit"
              style={{ marginLeft: 'auto', padding: '0.6rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Guardar en el check-in
            </button>
          </div>
        </div>
      </form>
    </AnimatedModal>
  );
}

// ---------- Small helpers ----------

const CHEVRON_RIGHT = 'M9 5l7 7-7 7';
const CHEVRON_DOWN = 'M19 9l-7 7-7-7';
function Chevron({ expanded, visible }: { expanded: boolean; visible: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#637381"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ visibility: visible ? 'visible' : 'hidden', flexShrink: 0 }}
    >
      <path d={expanded ? CHEVRON_DOWN : CHEVRON_RIGHT} />
    </svg>
  );
}

function StaticChip({ chip }: { chip: { label: string; bg: string; fg: string; dot: string } }) {
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
      <span style={{ width: '0.8rem', height: '0.8rem', borderRadius: '50%', backgroundColor: chip.dot }} />
      {chip.label}
    </span>
  );
}

function MiniProgress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  let fill = '#50b83c';
  if (pct < 40) fill = '#de3618';
  else if (pct < 70) fill = '#eec200';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: '12rem' }}>
      <div style={{ flex: 1, height: '0.6rem', borderRadius: '10rem', backgroundColor: '#e4e5e7', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: fill }} />
      </div>
      <span style={{ fontSize: '1.2rem', color: '#454f5b', minWidth: '3.2rem', textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

/**
 * Rectangular "Terminada" affordance, replaces the old circular check
 * icon across all task rows (Mis tareas column + nested rows in the
 * main per-KPI table). Gray outlined family (matches `+ Nueva tarea`,
 * `+ Tarea`). When the task is already completed the button swaps to a
 * green fill so completion state stays visually obvious without a
 * separate "Completada" chip doing the same work twice.
 */
function TaskCompleteButton({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={checked ? 'Completada' : 'Marcar completada'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.4rem 0.9rem',
        fontSize: '1.2rem',
        fontWeight: 500,
        color: checked ? '#108043' : '#637381',
        backgroundColor: checked ? '#e3f1df' : 'white',
        border: '1px solid ' + (checked ? '#bbe5b3' : '#dfe3e8'),
        borderRadius: '4px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.85 : 1,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {/* Checkbox icon — outline when pending, check-filled when done */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" />
        {checked && <path d="M8 12l3 3 5-6" />}
      </svg>
      Terminada
    </button>
  );
}

// ────────────── Check-in hero (period stats + motivational) ──────────────

/**
 * Full-width stats band that sits above the "Check-in del día …" title
 * on the check-in view. Values are derived from the active period plus
 * the total check-ins the current user has submitted in that period.
 *
 * Intentionally styled as a flat transparent section that floats on
 * the page background (matching the Objetivos hero treatment) so it
 * doesn't introduce a second card chrome on top of the existing ones.
 */
function CheckinHero({
  periodName,
  periodStart,
  periodEnd,
  checkinsCount,
}: {
  periodName: string;
  periodStart: Date;
  periodEnd: Date;
  checkinsCount: number;
}) {
  const now = new Date();
  const totalMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const elapsedMs = Math.max(
    0,
    Math.min(totalMs, now.getTime() - periodStart.getTime()),
  );
  const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
  const DAY = 86_400_000;
  const WEEK = 7 * DAY;
  const daysRemaining = Math.ceil(remainingMs / DAY);
  const weeksRemaining = Math.ceil(remainingMs / WEEK);
  const pctElapsed = Math.round((elapsedMs / totalMs) * 100);
  // "Llevas N checkins en M meses" — we round up so a half-month still
  // reads as the honest elapsed duration instead of rounding down to 0
  // on the first weeks of the period.
  const elapsedMonths = Math.max(1, Math.round(elapsedMs / (30 * DAY)));

  return (
    <section
      aria-label="Resumen del periodo"
      style={{
        textAlign: 'center',
        padding: '2.4rem 2rem',
        marginBottom: '2.4rem',
        borderBottom: '1px solid var(--color-border)',
        background: 'transparent',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: '3.2rem',
          fontWeight: 700,
          color: '#212b36',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
          maxWidth: '68ch',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        Te quedan <span style={{ color: '#5c6ac4' }}>{daysRemaining} días</span> para hacer la diferencia en {periodName}.
      </h1>

      <p
        style={{
          margin: '1.2rem auto 0',
          fontSize: '1.4rem',
          lineHeight: 1.55,
          color: '#637381',
          maxWidth: '66ch',
        }}
      >
        Llevas <strong style={{ color: '#212b36' }}>{checkinsCount} {checkinsCount === 1 ? 'checkin' : 'checkins'}</strong>
        {' en '}
        <strong style={{ color: '#212b36' }}>{elapsedMonths} {elapsedMonths === 1 ? 'mes' : 'meses'}</strong>.
        {' '}Los equipos que hacen check-in semanal cierran el trimestre{' '}
        <strong style={{ color: '#212b36' }}>31% encima del promedio</strong>.
      </p>

      {/* Stats row: weeks-remaining / %-elapsed / timeline bar.
          Lays out in a 3-cell grid so the bar hugs the right edge of
          the hero while the two counters sit in their own columns. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 1fr) minmax(120px, 1fr) minmax(200px, 1.4fr)',
          gap: '2.8rem',
          alignItems: 'center',
          justifyItems: 'center',
          maxWidth: '58rem',
          margin: '2.4rem auto 0',
        }}
      >
        <StatNumber value={weeksRemaining} unit="sem" label="Restantes" />
        <StatNumber value={pctElapsed} unit="%" label="Transcurrido" />
        <PeriodBar
          pctElapsed={pctElapsed}
          startLabel={formatShortDateEs(periodStart)}
          endLabel={formatShortDateEs(periodEnd)}
        />
      </div>
    </section>
  );
}

function StatNumber({
  value,
  unit,
  label,
}: {
  value: number;
  unit: string;
  label: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
        <span
          style={{
            fontSize: '3.6rem',
            fontWeight: 700,
            color: '#212b36',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: '1.3rem', color: '#637381', fontWeight: 500 }}>
          {unit}
        </span>
      </div>
      <span
        style={{
          marginTop: '0.4rem',
          fontSize: '1.05rem',
          fontWeight: 600,
          color: '#919eab',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function PeriodBar({
  pctElapsed,
  startLabel,
  endLabel,
}: {
  pctElapsed: number;
  startLabel: string;
  endLabel: string;
}) {
  const clamped = Math.max(0, Math.min(100, pctElapsed));
  return (
    <div style={{ width: '100%', maxWidth: '26rem' }}>
      <div
        style={{
          position: 'relative',
          height: '0.6rem',
          borderRadius: '999px',
          background: '#dfe3e8',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            right: 'auto',
            width: `${clamped}%`,
            background: '#5c6ac4',
            borderRadius: '999px',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.6rem',
          fontSize: '1.1rem',
          color: '#637381',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          letterSpacing: '0.08em',
        }}
      >
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

/**
 * Small calendar-icon badge — month abbreviation in a colored top
 * strip, big day number below. Sits next to the "Check-in del día …"
 * title to give the header a visual anchor.
 */
function CalendarDateBadge({ date }: { date: Date }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: '5.4rem',
        height: '5.4rem',
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '0 1px 2px rgba(15,24,48,0.05)',
      }}
    >
      <div
        style={{
          background: '#5c6ac4',
          color: 'white',
          fontSize: '1.0rem',
          fontWeight: 700,
          letterSpacing: '0.14em',
          padding: '0.25rem 0',
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
      >
        {MONTHS_ES_ABBR[date.getMonth()]}
      </div>
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          fontSize: '2.2rem',
          fontWeight: 700,
          color: '#212b36',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {date.getDate()}
      </div>
    </div>
  );
}
