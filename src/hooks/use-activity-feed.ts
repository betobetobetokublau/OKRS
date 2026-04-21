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
  | 'checkin';

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
    const [progressRes, commentsRes, objsRes, kpisRes, tasksRes, checkinsRes] = await Promise.all([
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
    ]);

    // ── Step 2: collect IDs that need a title / name lookup. ─────────
    const userIds = new Set<string>();
    const objIds = new Set<string>();

    const addUser = (v: unknown) => typeof v === 'string' && userIds.add(v);
    const addObj = (v: unknown) => typeof v === 'string' && objIds.add(v);

    (progressRes.data || []).forEach((r: any) => {
      addUser(r.user_id);
      addObj(r.objective_id);
    });
    (commentsRes.data || []).forEach((r: any) => {
      addUser(r.user_id);
      addObj(r.objective_id);
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

    // ── Step 3: batch lookups for entity titles. Skipped when empty. ──
    // Objectives already loaded (the "created" stream) seed objById for
    // free; we only fetch the ones referenced by progress_logs / comments
    // that aren't already in that list.
    const needProfiles = userIds.size > 0;
    type MinimalObj = { id: string; title: string; workspace_id: string };
    const missingObjIds = Array.from(objIds).filter(
      (id) => !(objsRes.data || []).some((o: MinimalObj) => o.id === id),
    );

    const [profsRes, extraObjsRes] = await Promise.all([
      needProfiles
        ? supabase.from('profiles').select('id, full_name').in('id', Array.from(userIds))
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      missingObjIds.length
        ? supabase.from('objectives').select('id, title, workspace_id').in('id', missingObjIds)
        : Promise.resolve({ data: [] as MinimalObj[] }),
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

    // Progress log → "X actualizó progreso de Y a N%". The real schema
    // only has objective_id — no kpi_id / task_id columns — and the
    // numeric field is new_value (with previous_value kept for audit).
    // Accept any common name so a future schema change doesn't break.
    // If none is a number, the event still renders but without the %.
    (progressRes.data || []).forEach((r: any) => {
      const target = refForObj(r.objective_id);
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

    // Comments → "X comentó en Y" + quote. Real schema has only
    // objective_id. The in-memory workspace filter happens via
    // refForObj — objById is keyed on the current workspace.
    (commentsRes.data || []).forEach((r: any) => {
      const target = refForObj(r.objective_id);
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

    // Sort desc by timestamp, clip.
    out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    setEvents(out.slice(0, limit));
}
