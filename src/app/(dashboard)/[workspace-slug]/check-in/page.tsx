'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { calculateObjectiveProgress } from '@/lib/utils/progress';
import {
  objectiveStatusChip,
  taskStatusChip,
  OBJECTIVE_STATUS_OPTIONS,
} from '@/components/okrs/status-chips';
import type { KPI, Objective, ObjectiveStatus, Task } from '@/types';

// ---------- Types ----------

interface TaskRow extends Task {}

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

function formatCheckinTitle(d: Date): string {
  return `Check-in del día ${d.getDate()} - ${MONTHS_ES[d.getMonth()]}`;
}

// ---------- Page ----------

export default function CheckinPage() {
  const { currentWorkspace, activePeriod, profile } = useWorkspaceStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedToastId, setSavedToastId] = useState(0);

  const [kpis, setKpis] = useState<KPI[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveWithTasks[]>([]);

  // Pending edits. Keyed by objective id / task id.
  const [objectiveEdits, setObjectiveEdits] = useState<Map<string, PendingObjectiveUpdate>>(
    new Map(),
  );
  const [tasksToComplete, setTasksToComplete] = useState<Set<string>>(new Set());

  // Expand state (per objective)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Modal state
  const [editingObjective, setEditingObjective] = useState<ObjectiveWithTasks | null>(null);

  const load = useCallback(async () => {
    if (!currentWorkspace?.id || !activePeriod?.id || !profile?.id) return;
    setLoading(true);

    const supabase = createClient();

    // 1) User's departments (to scope visibility by team).
    const { data: udData } = await supabase
      .from('user_departments')
      .select('department_id')
      .eq('user_id', profile.id);
    const myDeptIds = new Set((udData || []).map((r: { department_id: string }) => r.department_id));

    // 2) KPIs for the period in persisted order.
    const { data: kpiRows } = await supabase
      .from('kpis')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .eq('period_id', activePeriod.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    setKpis((kpiRows || []) as KPI[]);

    // 3) All objectives for the period + their tasks + department links + kpi links.
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

    // 4) Filter to objectives the user is responsible for OR linked to one of
    // the user's departments. Two users in the same group can each see (and
    // update) the shared objective.
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
      // If all fields are cleared, remove the entry.
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

    // 1) Create the checkin row.
    const { data: checkinData, error: checkinErr } = await supabase
      .from('checkins')
      .insert({
        user_id: profile.id,
        workspace_id: currentWorkspace.id,
        period_id: activePeriod.id,
      })
      .select('id')
      .single();

    if (checkinErr || !checkinData) {
      setSaveError(checkinErr?.message || 'No se pudo crear el check-in');
      setSaving(false);
      return;
    }
    const checkinId = checkinData.id as string;

    // 2) For each objective edit: apply to the objective, record a
    // checkin_entry, and post to the timeline via progress_logs / comments.
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

      // Timeline: one progress_log if progress changed, and one comment
      // summarising the update so status/comment-only updates are still
      // visible in the timeline.
      if (edit.new_progress !== undefined && edit.new_progress !== obj.manual_progress) {
        timelineInserts.push(
          Promise.resolve(
            supabase.from('progress_logs').insert({
              user_id: profile.id,
              period_id: activePeriod.id,
              workspace_id: currentWorkspace.id,
              objective_id: objId,
              progress_value: edit.new_progress,
              note: edit.comment?.trim() || null,
            }),
          ),
        );
      }
      const parts: string[] = ['Check-in'];
      if (edit.new_status !== undefined && edit.new_status !== obj.status) {
        parts.push(`cambió estado a "${objectiveStatusChip(edit.new_status).label}"`);
      }
      if (
        edit.new_progress !== undefined &&
        edit.new_progress !== obj.manual_progress &&
        !(edit.new_status !== undefined && edit.new_status !== obj.status)
      ) {
        // already captured by progress_logs; keep the comment focused on context.
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

    // 3) Tasks to mark complete.
    const taskIds = Array.from(tasksToComplete);
    for (const taskId of taskIds) {
      const parentObj = objectives.find((o) => o.tasks.some((t) => t.id === taskId));
      const task = parentObj?.tasks.find((t) => t.id === taskId);
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

    // Reset local state, reload fresh data.
    setObjectiveEdits(new Map());
    setTasksToComplete(new Set());
    setSavedToastId((n) => n + 1);
    await load();
    setSaving(false);
  }

  const title = formatCheckinTitle(new Date());

  if (!currentWorkspace) {
    return <div style={{ padding: '4rem', color: '#637381' }}>Cargando workspace...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>{title}</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            {activePeriod
              ? `Actualiza tus objetivos y tareas del periodo ${activePeriod.name}.`
              : 'Sin periodo activo'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !activePeriod}
          style={{
            padding: '0.8rem 1.6rem',
            fontSize: '1.4rem',
            fontWeight: 600,
            color: 'white',
            backgroundColor: saving || !activePeriod ? '#8c92c4' : '#5c6ac4',
            border: 'none',
            borderRadius: '4px',
            cursor: saving || !activePeriod ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Guardando...' : 'Guardar check-in'}
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
      ) : objectives.length === 0 ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>
            No tienes objetivos ni tareas asignadas para este periodo.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.4rem' }}>
          {kpis.map((kpi) => {
            const rows = grouped.map.get(kpi.id) || [];
            if (rows.length === 0) return null;
            return (
              <CheckinKpiTable
                key={kpi.id}
                kpiTitle={kpi.title}
                rows={rows}
                expanded={expanded}
                onToggle={toggle}
                objectiveEdits={objectiveEdits}
                tasksToComplete={tasksToComplete}
                onUpdateObjective={setEditingObjective}
                onToggleTaskComplete={toggleTaskCompletion}
              />
            );
          })}

          {grouped.orphans.length > 0 && (
            <CheckinKpiTable
              kpiTitle="Sin KPI asignado"
              rows={grouped.orphans}
              expanded={expanded}
              onToggle={toggle}
              objectiveEdits={objectiveEdits}
              tasksToComplete={tasksToComplete}
              onUpdateObjective={setEditingObjective}
              onToggleTaskComplete={toggleTaskCompletion}
            />
          )}
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
    </div>
  );
}

// ---------- Per-KPI table ----------

interface CheckinKpiTableProps {
  kpiTitle: string;
  rows: ObjectiveWithTasks[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  objectiveEdits: Map<string, PendingObjectiveUpdate>;
  tasksToComplete: Set<string>;
  onUpdateObjective: (obj: ObjectiveWithTasks) => void;
  onToggleTaskComplete: (t: TaskRow) => void;
}

function CheckinKpiTable({
  kpiTitle,
  rows,
  expanded,
  onToggle,
  objectiveEdits,
  tasksToComplete,
  onUpdateObjective,
  onToggleTaskComplete,
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
      <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid #f1f2f4', backgroundColor: '#fafbfb', fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>
        {kpiTitle}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerCell, width: '45%' }}>Nombre</th>
            <th style={headerCell}>Estado</th>
            <th style={headerCell}>Progreso</th>
            <th style={{ ...headerCell, width: '130px' }}></th>
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
                  onClick={hasTasks ? () => onToggle(obj.id) : undefined}
                  style={{
                    cursor: hasTasks ? 'pointer' : 'default',
                    backgroundColor: hasPending ? '#f4f5fc' : isExpanded ? '#f9fafb' : 'white',
                  }}
                >
                  <td style={cellBase}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Chevron expanded={isExpanded} visible={hasTasks} />
                      <span style={{ fontWeight: 600 }}>{obj.title}</span>
                      {hasPending && (
                        <span style={{ fontSize: '1.1rem', color: '#5c6ac4', backgroundColor: '#ede7ff', padding: '2px 8px', borderRadius: '10rem' }}>
                          Pendiente de guardar
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateObjective(obj);
                      }}
                      style={{
                        padding: '0.3rem 0.9rem',
                        fontSize: '1.2rem',
                        color: '#637381',
                        backgroundColor: 'transparent',
                        border: '1px solid #dfe3e8',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Actualizar
                    </button>
                  </td>
                </tr>

                {isExpanded &&
                  obj.tasks.map((t) => {
                    const queued = tasksToComplete.has(t.id);
                    const isDone = t.status === 'completed';
                    const chip = taskStatusChip(queued ? 'completed' : t.status);
                    return (
                      <tr key={t.id} style={{ backgroundColor: queued ? '#f4f5fc' : 'white' }}>
                        <td style={cellBase}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', paddingLeft: '2.6rem' }}>
                            <span style={{ fontSize: '1.1rem', color: '#919eab' }}>↳</span>
                            <span style={{ color: '#454f5b' }}>{t.title}</span>
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
                          <CheckButton
                            checked={queued || isDone}
                            disabled={isDone}
                            onClick={() => onToggleTaskComplete(t)}
                          />
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

/**
 * Fragment wrapper — the <tr> elements must be direct siblings inside the
 * <tbody>, so this is just React.Fragment forwarding children.
 */
function ObjectiveRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ---------- Modal ----------

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

    // If no changes at all and no prior pending edit, just close.
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
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="Polaris-Card" style={{ width: '480px', padding: '2.4rem', borderRadius: '12px' }}>
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
      </div>
    </div>
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

function CheckButton({
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
        width: '3rem',
        height: '3rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: '1px solid ' + (checked ? '#108043' : '#dfe3e8'),
        borderRadius: '50%',
        backgroundColor: checked ? '#e3f1df' : 'white',
        color: checked ? '#108043' : '#919eab',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    </button>
  );
}
