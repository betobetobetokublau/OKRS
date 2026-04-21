'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

/**
 * Unified activity feed — merges several event sources (progress logs,
 * comments, creations, task status changes, check-ins) into one timeline
 * ordered by timestamp desc. Per-workspace. No realtime yet; the hook
 * exposes `refetch()` so the consumer can refresh on panel open.
 *
 * Implementation note: every table is queried with ONLY its own columns.
 * We resolve related entities (profiles, kpis, objectives, tasks) in a
 * second pass via `.in('id', [...])` batches. That's because:
 *   - progress_logs.user_id / checkins.user_id FK into auth.users, not
 *     profiles, so PostgREST's embedded-join hint doesn't resolve.
 *   - Some deployments don't have comments→kpis / progress_logs→kpis
 *     FKs registered in PostgREST's schema cache, so embedded joins
 *     there fail with PGRST200.
 *   - tasks.updated_at doesn't exist in the current schema (we only
 *     have created_at), so we use created_at for status-change events
 *     as an approximation until a proper audit trail lands.
 */

export type ActivityEventKind =
  | 'progress_log'
  | 'comment'
  | 'objective_created'
  | 'kpi_created'
  | 'task_created'
  | 'task_completed'
  | 'task_blocked'
  | 'checkin'
  // Progress / status change persisted via a check-in entry. Drives the
  // missing "Alberto cambió estado a X" / "Alberto actualizó progreso a
  // N%" events the user was expecting after saving a check-in.
  | 'checkin_progress'
  | 'checkin_status';

export interface EntityRef {
  type: 'kpi' | 'objective' | 'task';
  id: string;
  title: string;
}

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  timestamp: string;
  actor: Pick<Profile, 'id' | 'full_name'> | null;
  target?: EntityRef;
  parent?: EntityRef;
  quote?: string;
  progressPct?: number;
  /** For `checkin_status` events — the human-readable status label the
   *  event switched TO (e.g. "En progreso"). The feed renderer shows
   *  it verbatim. */
  statusLabel?: string;
}

interface UseActivityFeedOptions {
  limit?: number;
}

/** Returns the first argument that's a finite number, else undefined. */
function pickNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  return undefined;
}

export function useActivityFeed(
  workspaceId: string | undefined,
  { limit = 50 }: UseActivityFeedOptions = {},
) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await loadActivity(workspaceId, limit, setEvents);
    } catch (err) {
      // Any query hiccup should empty the feed instead of bubbling into
      // the React tree and crashing the page.
      console.error('[use-activity-feed] load failed:', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { events, loading, refetch: load };
}

async function loadActivity(
  workspaceId: string,
  limit: number,
  setEvents: (events: ActivityEvent[]) => void,
) {
    const supabase = createClient();

    // ── Step 1: raw rows per source. SELECT * on progress_logs and
    // comments because their actual schema is narrower than the spec —
    // neither has workspace_id, and both only reference objective_id
    // (no kpi_id / task_id on progress_logs either). We rely on RLS to
    // scope them to the caller's workspace and additionally drop any
    // event whose objective isn't in objById (loaded below per the
    // current workspace). ──────────────────────────────────────────
    const [
      progressRes,
      commentsRes,
      objsRes,
      kpisRes,
      tasksRes,
      checkinsRes,
      checkinEntriesRes,
    ] = await Promise.all([
      supabase
        .from('progress_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit * 2),
      supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit * 2),
      supabase
        .from('objectives')
        // `created_by` may be absent on deployments that haven't run
        // 2026-04-21-created-by.sql yet. SELECT * so PostgREST returns
        // whatever columns exist; the code below reads `r.created_by`
        // defensively and falls back to `Alguien`.
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('kpis')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('tasks')
        // Include the whole task row so `created_by` travels along
        // when present. The embedded `objective` join keeps the parent
        // title / workspace scope filter working.
        .select(
          '*, objective:objectives!inner(id, title, workspace_id)',
        )
        .eq('objective.workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('checkins')
        .select('id, created_at, user_id, summary')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit),
      // Check-in entries are the per-row diff inside a check-in
      // session. Rows with a `new_progress` value become
      // `checkin_progress` events; rows with a `new_status` different
      // from `previous_status` become `checkin_status` events. The
      // embedded `checkin:checkins!inner(...)` join filters to the
      // current workspace and carries the actor's user_id through.
      supabase
        .from('checkin_entries')
        .select(
          '*, checkin:checkins!inner(id, user_id, workspace_id, created_at)',
        )
        .eq('checkin.workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit * 2),
    ]);

    // ── Step 2: collect IDs that need a title / name lookup. ─────────
    const userIds = new Set<string>();
    const objIds = new Set<string>();
    const kpiIds = new Set<string>();
    const taskIdsFromEntries = new Set<string>();

    const addUser = (v: unknown) => typeof v === 'string' && userIds.add(v);
    const addObj = (v: unknown) => typeof v === 'string' && objIds.add(v);
    const addKpi = (v: unknown) => typeof v === 'string' && kpiIds.add(v);

    (progressRes.data || []).forEach((r: any) => {
      addUser(r.user_id);
      addObj(r.objective_id);
      addKpi(r.kpi_id);
    });
    (commentsRes.data || []).forEach((r: any) => {
      addUser(r.user_id);
      addObj(r.objective_id);
      addKpi(r.kpi_id);
    });
    (checkinsRes.data || []).forEach((r: any) => {
      addUser(r.user_id);
    });
    // Objectives / KPIs / Tasks now carry `created_by` (see migration
    // 2026-04-21-created-by.sql). Harvest those ids so the same
    // profile-lookup batch resolves them too.
    (objsRes.data || []).forEach((r: any) => addUser(r.created_by));
    (kpisRes.data || []).forEach((r: any) => addUser(r.created_by));
    (tasksRes.data || []).forEach((r: any) => addUser(r.created_by));
    // Check-in entries — actor lives on the parent checkin row.
    (checkinEntriesRes.data || []).forEach((r: any) => {
      const ck = Array.isArray(r.checkin) ? r.checkin[0] : r.checkin;
      addUser(ck?.user_id);
      addObj(r.objective_id);
      if (typeof r.task_id === 'string') taskIdsFromEntries.add(r.task_id);
    });

    // ── Step 3: batch lookups for entity titles. Skipped when empty. ──
    // Objectives / KPIs / Tasks already loaded (the "created" streams)
    // seed the maps for free; we only fetch the ones referenced by
    // comments / progress_logs / checkin_entries that aren't already
    // in those lists.
    const needProfiles = userIds.size > 0;
    type MinimalObj = { id: string; title: string; workspace_id: string };
    type MinimalKpi = { id: string; title: string; workspace_id: string };
    const missingObjIds = Array.from(objIds).filter(
      (id) => !(objsRes.data || []).some((o: MinimalObj) => o.id === id),
    );
    const missingKpiIds = Array.from(kpiIds).filter(
      (id) => !(kpisRes.data || []).some((k: MinimalKpi) => k.id === id),
    );
    // Tasks referenced by check-in entries — we already know the
    // tasks loaded in `tasksRes` are in-workspace, so subtract those
    // first. What's left needs to be fetched; we'll filter to the
    // same workspace via the nested objective join.
    const missingTaskIds = Array.from(taskIdsFromEntries).filter(
      (id) => !(tasksRes.data || []).some((t: any) => t.id === id),
    );

    const [profsRes, extraObjsRes, extraKpisRes, extraTasksRes] = await Promise.all([
      needProfiles
        ? supabase.from('profiles').select('id, full_name').in('id', Array.from(userIds))
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      missingObjIds.length
        ? supabase.from('objectives').select('id, title, workspace_id').in('id', missingObjIds)
        : Promise.resolve({ data: [] as MinimalObj[] }),
      missingKpiIds.length
        ? supabase.from('kpis').select('id, title, workspace_id').in('id', missingKpiIds)
        : Promise.resolve({ data: [] as MinimalKpi[] }),
      missingTaskIds.length
        ? supabase
            .from('tasks')
            .select('id, title, objective:objectives!inner(id, title, workspace_id)')
            .in('id', missingTaskIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // ── Step 4: build lookup maps. ───────────────────────────────────
    const profileByUserId = new Map<string, { id: string; full_name: string }>();
    (profsRes.data || []).forEach((p: { id: string; full_name: string }) =>
      profileByUserId.set(p.id, p),
    );

    const objById = new Map<string, MinimalObj>();
    (objsRes.data || []).forEach((o: MinimalObj) => {
      if (!o?.id) return;
      objById.set(o.id, {
        id: o.id,
        title: o.title ?? '',
        workspace_id: o.workspace_id ?? '',
      });
    });
    (extraObjsRes.data || []).forEach((o: MinimalObj) => {
      // Only allow objectives in the current workspace into the lookup
      // map — RLS should block cross-workspace reads anyway, but this is
      // a defensive filter so comments/progress_logs events can't surface
      // under the wrong workspace.
      if (!o?.id || o.workspace_id !== workspaceId) return;
      objById.set(o.id, { id: o.id, title: o.title ?? '', workspace_id: o.workspace_id });
    });

    const kpiByIdMap = new Map<string, MinimalKpi>();
    (kpisRes.data || []).forEach((k: MinimalKpi) => {
      if (!k?.id) return;
      kpiByIdMap.set(k.id, {
        id: k.id,
        title: k.title ?? '',
        workspace_id: k.workspace_id ?? '',
      });
    });
    (extraKpisRes.data || []).forEach((k: MinimalKpi) => {
      if (!k?.id || k.workspace_id !== workspaceId) return;
      kpiByIdMap.set(k.id, { id: k.id, title: k.title ?? '', workspace_id: k.workspace_id });
    });

    // Task map: for checkin_entries that target tasks, we want the
    // title + a fallback parent objective link. Seed from tasksRes
    // (which already carries `objective:objectives!inner(...)`), top
    // up with extraTasksRes for ids not in that initial slice.
    const taskById = new Map<string, { id: string; title: string; objectiveId: string; objectiveTitle: string }>();
    const normalizeJoinedObj = (raw: any) =>
      Array.isArray(raw) ? raw[0] : raw;
    (tasksRes.data || []).forEach((t: any) => {
      if (!t?.id) return;
      const obj = normalizeJoinedObj(t.objective);
      if (!obj?.id) return;
      taskById.set(t.id, {
        id: t.id,
        title: t.title ?? '',
        objectiveId: obj.id,
        objectiveTitle: obj.title ?? '',
      });
    });
    (extraTasksRes.data || []).forEach((t: any) => {
      if (!t?.id) return;
      const obj = normalizeJoinedObj(t.objective);
      if (!obj?.id || obj.workspace_id !== workspaceId) return;
      taskById.set(t.id, {
        id: t.id,
        title: t.title ?? '',
        objectiveId: obj.id,
        objectiveTitle: obj.title ?? '',
      });
    });

    // ── Step 5: transform into a unified event list. ─────────────────
    const out: ActivityEvent[] = [];
    const actorFor = (userId: string | null | undefined) =>
      userId ? profileByUserId.get(userId) ?? null : null;

    const refForObj = (id: string | null | undefined): EntityRef | undefined => {
      if (!id) return undefined;
      const o = objById.get(id);
      if (!o) return undefined;
      return { type: 'objective', id: o.id, title: o.title ?? '' };
    };

    const refForKpi = (id: string | null | undefined): EntityRef | undefined => {
      if (!id) return undefined;
      const k = kpiByIdMap.get(id);
      if (!k) return undefined;
      return { type: 'kpi', id: k.id, title: k.title ?? '' };
    };

    // Progress log → "X actualizó progreso de Y a N%". Comments and
    // progress_logs can target EITHER an objective or a KPI (see
    // 2026-04-21-kpi-comments.sql). Prefer objective when both are
    // set, fall back to KPI otherwise, and drop rows that resolve to
    // neither. For the numeric field we accept any common name
    // (new_value is canonical; progress_value was an older spelling).
    (progressRes.data || []).forEach((r: any) => {
      const target = refForObj(r.objective_id) ?? refForKpi(r.kpi_id);
      if (!target) return;
      const pct = pickNumber(
        r.new_value,
        r.new_progress,
        r.progress_value,
        r.value,
        r.progress,
      );
      out.push({
        id: `progress-${r.id}`,
        kind: 'progress_log',
        timestamp: r.created_at,
        actor: actorFor(r.user_id),
        target,
        progressPct: pct,
      });
    });

    // Comments → "X comentó en Y" + quote. Same dual-target resolution
    // as progress logs; the in-memory workspace filter happens via the
    // ref helpers.
    (commentsRes.data || []).forEach((r: any) => {
      const target = refForObj(r.objective_id) ?? refForKpi(r.kpi_id);
      if (!target) return;
      out.push({
        id: `comment-${r.id}`,
        kind: 'comment',
        timestamp: r.created_at,
        actor: actorFor(r.user_id),
        target,
        quote: r.content,
      });
    });

    // Objectives / KPIs created. Attribute to `created_by` when the
    // migration 2026-04-21-created-by.sql has been applied; older rows
    // with a NULL value render as "Alguien" as before.
    (objsRes.data || []).forEach((r: any) => {
      if (!r?.id) return;
      out.push({
        id: `obj-created-${r.id}`,
        kind: 'objective_created',
        timestamp: r.created_at,
        actor: actorFor(r.created_by),
        target: { type: 'objective', id: r.id, title: r.title ?? '' },
      });
    });
    (kpisRes.data || []).forEach((r: any) => {
      if (!r?.id) return;
      out.push({
        id: `kpi-created-${r.id}`,
        kind: 'kpi_created',
        timestamp: r.created_at,
        actor: actorFor(r.created_by),
        target: { type: 'kpi', id: r.id, title: r.title ?? '' },
      });
    });

    // Tasks — creation + current status derived events (completion,
    // blocked). tasks table has no updated_at, so the status-event
    // timestamp is created_at (approximation until an audit trail lands).
    // All three task events share the same `created_by`-derived actor
    // until we have a per-status audit trail.
    (tasksRes.data || []).forEach((r: any) => {
      if (!r?.id) return;
      const objective = Array.isArray(r.objective) ? r.objective[0] : r.objective;
      if (!objective?.id) return;
      const parent: EntityRef = {
        type: 'objective',
        id: objective.id,
        title: objective.title ?? '',
      };
      const target: EntityRef = { type: 'task', id: r.id, title: r.title ?? '' };
      const actor = actorFor(r.created_by);

      out.push({
        id: `task-created-${r.id}`,
        kind: 'task_created',
        timestamp: r.created_at,
        actor,
        target,
        parent,
      });

      if (r.status === 'completed') {
        out.push({
          id: `task-completed-${r.id}`,
          kind: 'task_completed',
          timestamp: r.created_at,
          actor,
          target,
          parent,
        });
      } else if (r.status === 'blocked') {
        out.push({
          id: `task-blocked-${r.id}`,
          kind: 'task_blocked',
          timestamp: r.created_at,
          actor,
          target,
          parent,
          quote: r.block_reason || undefined,
        });
      }
    });

    // Check-ins
    (checkinsRes.data || []).forEach((r: any) => {
      out.push({
        id: `checkin-${r.id}`,
        kind: 'checkin',
        timestamp: r.created_at,
        actor: actorFor(r.user_id),
        quote: r.summary || undefined,
      });
    });

    // ── Check-in entries — one row per objective/task touched inside a
    // session. Each row can produce up to two events: a progress update
    // (when `new_progress` is present) and a status change (when
    // `new_status` differs from `previous_status`). This is what surfaces
    // "Alberto actualizó progreso a 75%" and "Alberto cambió estado a
    // En progreso" in the timeline after a check-in save.
    (checkinEntriesRes.data || []).forEach((r: any) => {
      if (!r?.id) return;
      const ck = Array.isArray(r.checkin) ? r.checkin[0] : r.checkin;
      const actor = actorFor(ck?.user_id);
      // The entry's timestamp is the row's own created_at (set the
      // moment the check-in saved). If absent fall back to the parent.
      const ts = r.created_at ?? ck?.created_at;
      const target = refForObj(r.objective_id) ?? refForTaskId(r.task_id);
      if (!target) return;

      if (typeof r.new_progress === 'number' && r.new_progress !== r.previous_progress) {
        out.push({
          id: `checkin-progress-${r.id}`,
          kind: 'checkin_progress',
          timestamp: ts,
          actor,
          target,
          progressPct: r.new_progress,
        });
      }
      if (typeof r.new_status === 'string' && r.new_status !== r.previous_status) {
        out.push({
          id: `checkin-status-${r.id}`,
          kind: 'checkin_status',
          timestamp: ts,
          actor,
          target,
          statusLabel: humanStatus(target.type, r.new_status),
        });
      }
    });

    // Sort desc by timestamp, clip.
    out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    setEvents(out.slice(0, limit));

    /** Helper: resolve a task id into a ref pointing at the task (we
     *  render status/progress events as "task 'X' en objetivo 'Y'").
     *  Returns undefined if the task's workspace/parent-objective isn't
     *  resolvable — the event is dropped rather than rendered without
     *  context. */
    function refForTaskId(id: string | null | undefined): EntityRef | undefined {
      if (!id) return undefined;
      const t = taskById.get(id);
      if (!t) return undefined;
      return { type: 'task', id: t.id, title: t.title || '' };
    }
}

/**
 * Map raw DB status values to the Spanish labels we surface in the UI.
 * Matches the `objectiveStatusChip` / `taskStatusChip` vocabulary used
 * elsewhere, kept as a small local table so the feed hook doesn't take
 * a dependency on the chip components.
 */
function humanStatus(targetType: 'kpi' | 'objective' | 'task', status: string): string {
  const objectiveLabels: Record<string, string> = {
    in_progress: 'En progreso',
    paused: 'Pausado',
    deprecated: 'Descartado',
    upcoming: 'Próximo',
  };
  const taskLabels: Record<string, string> = {
    pending: 'Pendiente',
    in_progress: 'En progreso',
    completed: 'Completada',
    blocked: 'Bloqueada',
  };
  const kpiLabels: Record<string, string> = {
    on_track: 'On track',
    at_risk: 'En riesgo',
    off_track: 'Fuera de curso',
    achieved: 'Completado',
  };
  const table =
    targetType === 'task' ? taskLabels : targetType === 'kpi' ? kpiLabels : objectiveLabels;
  return table[status] ?? status;
}
