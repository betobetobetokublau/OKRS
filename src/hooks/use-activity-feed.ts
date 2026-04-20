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
    const supabase = createClient();

    // ── Step 1: raw rows per source (no embedded joins except one cheap
    // inner-join on tasks.objective to filter by workspace). ─────────
    const [progressRes, commentsRes, objsRes, kpisRes, tasksRes, checkinsRes] = await Promise.all([
      supabase
        .from('progress_logs')
        .select('id, created_at, user_id, progress_value, kpi_id, objective_id, task_id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('comments')
        .select('id, created_at, user_id, content, kpi_id, objective_id')
        .order('created_at', { ascending: false })
        .limit(limit * 2), // fetch extra, workspace-filter in memory
      supabase
        .from('objectives')
        .select('id, title, created_at, workspace_id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('kpis')
        .select('id, title, created_at, workspace_id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('tasks')
        .select(
          'id, title, status, block_reason, created_at, objective:objectives!inner(id, title, workspace_id)',
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
    const kpiIds = new Set<string>();
    const objIds = new Set<string>();
    const taskIds = new Set<string>();

    const addUser = (v: unknown) => typeof v === 'string' && userIds.add(v);
    const addKpi = (v: unknown) => typeof v === 'string' && kpiIds.add(v);
    const addObj = (v: unknown) => typeof v === 'string' && objIds.add(v);
    const addTask = (v: unknown) => typeof v === 'string' && taskIds.add(v);

    (progressRes.data || []).forEach((r: any) => {
      addUser(r.user_id);
      addKpi(r.kpi_id);
      addObj(r.objective_id);
      addTask(r.task_id);
    });
    (commentsRes.data || []).forEach((r: any) => {
      addUser(r.user_id);
      addKpi(r.kpi_id);
      addObj(r.objective_id);
    });
    (checkinsRes.data || []).forEach((r: any) => {
      addUser(r.user_id);
    });

    // Objectives/KPIs we already loaded (the "created" streams) seed the
    // title maps for free — skip refetching them below.

    // ── Step 3: batch lookups for entity titles. Skipped when empty. ──
    const needProfiles = userIds.size > 0;
    const missingKpiIds = Array.from(kpiIds).filter(
      (id) => !(kpisRes.data || []).some((k: any) => k.id === id),
    );
    const missingObjIds = Array.from(objIds).filter(
      (id) => !(objsRes.data || []).some((o: any) => o.id === id),
    );

    const [profsRes, extraKpisRes, extraObjsRes, tasksLookupRes] = await Promise.all([
      needProfiles
        ? supabase.from('profiles').select('id, full_name').in('id', Array.from(userIds))
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      missingKpiIds.length
        ? supabase.from('kpis').select('id, title, workspace_id').in('id', missingKpiIds)
        : Promise.resolve({ data: [] as { id: string; title: string; workspace_id: string }[] }),
      missingObjIds.length
        ? supabase.from('objectives').select('id, title, workspace_id').in('id', missingObjIds)
        : Promise.resolve({ data: [] as { id: string; title: string; workspace_id: string }[] }),
      taskIds.size
        ? supabase.from('tasks').select('id, title').in('id', Array.from(taskIds))
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);

    // ── Step 4: build lookup maps. ───────────────────────────────────
    const profileByUserId = new Map<string, { id: string; full_name: string }>();
    (profsRes.data || []).forEach((p: { id: string; full_name: string }) =>
      profileByUserId.set(p.id, p),
    );

    const kpiById = new Map<string, { id: string; title: string; workspace_id: string }>();
    (kpisRes.data || []).forEach((k: any) =>
      kpiById.set(k.id, { id: k.id, title: k.title, workspace_id: k.workspace_id }),
    );
    (extraKpisRes.data || []).forEach((k: { id: string; title: string; workspace_id: string }) =>
      kpiById.set(k.id, k),
    );

    const objById = new Map<string, { id: string; title: string; workspace_id: string }>();
    (objsRes.data || []).forEach((o: any) =>
      objById.set(o.id, { id: o.id, title: o.title, workspace_id: o.workspace_id }),
    );
    (extraObjsRes.data || []).forEach((o: { id: string; title: string; workspace_id: string }) =>
      objById.set(o.id, o),
    );

    const taskById = new Map<string, { id: string; title: string }>();
    (tasksLookupRes.data || []).forEach((t: { id: string; title: string }) =>
      taskById.set(t.id, t),
    );

    // ── Step 5: transform into a unified event list. ─────────────────
    const out: ActivityEvent[] = [];
    const actorFor = (userId: string | null | undefined) =>
      userId ? profileByUserId.get(userId) ?? null : null;

    const refForKpi = (id: string | null | undefined): EntityRef | undefined => {
      if (!id) return undefined;
      const k = kpiById.get(id);
      if (!k) return undefined;
      return { type: 'kpi', id: k.id, title: k.title };
    };
    const refForObj = (id: string | null | undefined): EntityRef | undefined => {
      if (!id) return undefined;
      const o = objById.get(id);
      if (!o) return undefined;
      return { type: 'objective', id: o.id, title: o.title };
    };
    const refForTask = (id: string | null | undefined): EntityRef | undefined => {
      if (!id) return undefined;
      const t = taskById.get(id);
      if (!t) return undefined;
      return { type: 'task', id: t.id, title: t.title };
    };

    // Progress log → "X actualizó progreso de Y a N%"
    (progressRes.data || []).forEach((r: any) => {
      const target =
        refForTask(r.task_id) ?? refForObj(r.objective_id) ?? refForKpi(r.kpi_id);
      if (!target) return;
      out.push({
        id: `progress-${r.id}`,
        kind: 'progress_log',
        timestamp: r.created_at,
        actor: actorFor(r.user_id),
        target,
        progressPct: r.progress_value,
      });
    });

    // Comments → "X comentó en Y" + quote. Skip comments whose target
    // isn't in this workspace (in-memory workspace filter).
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

    // Objectives / KPIs created. No actor available (no created_by
    // column) so we render the action anonymously.
    (objsRes.data || []).forEach((r: any) => {
      out.push({
        id: `obj-created-${r.id}`,
        kind: 'objective_created',
        timestamp: r.created_at,
        actor: null,
        target: { type: 'objective', id: r.id, title: r.title },
      });
    });
    (kpisRes.data || []).forEach((r: any) => {
      out.push({
        id: `kpi-created-${r.id}`,
        kind: 'kpi_created',
        timestamp: r.created_at,
        actor: null,
        target: { type: 'kpi', id: r.id, title: r.title },
      });
    });

    // Tasks — creation + current status derived events (completion,
    // blocked). tasks table has no updated_at, so the status-event
    // timestamp is created_at (approximation until an audit trail lands).
    (tasksRes.data || []).forEach((r: any) => {
      const objective = Array.isArray(r.objective) ? r.objective[0] : r.objective;
      if (!objective) return;
      const parent: EntityRef = { type: 'objective', id: objective.id, title: objective.title };
      const target: EntityRef = { type: 'task', id: r.id, title: r.title };

      // Always emit a task_created event — plain and independent of
      // current status.
      out.push({
        id: `task-created-${r.id}`,
        kind: 'task_created',
        timestamp: r.created_at,
        actor: null,
        target,
        parent,
      });

      if (r.status === 'completed') {
        out.push({
          id: `task-completed-${r.id}`,
          kind: 'task_completed',
          timestamp: r.created_at,
          actor: null,
          target,
          parent,
        });
      } else if (r.status === 'blocked') {
        out.push({
          id: `task-blocked-${r.id}`,
          kind: 'task_blocked',
          timestamp: r.created_at,
          actor: null,
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
    setLoading(false);
  }, [workspaceId, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { events, loading, refetch: load };
}
