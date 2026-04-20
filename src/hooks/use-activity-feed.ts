'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

/**
 * Unified activity feed — merges several event sources (progress logs,
 * comments, creations, task status changes, check-ins) into one timeline
 * ordered by timestamp desc. Per-workspace. No realtime yet; the hook
 * exposes `refetch()` so the consumer can refresh on panel open.
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

    // Fetch events first — user names are resolved in a second pass
    // because progress_logs.user_id and checkins.user_id both FK into
    // auth.users (not profiles), so PostgREST's embedded-join syntax
    // can't resolve profiles via the hint. RLS scopes most of these to
    // the caller's workspace already; we pass workspace_id where we can.
    const [progressRes, commentsRes, objsRes, kpisRes, tasksRes, checkinsRes] = await Promise.all([
      supabase
        .from('progress_logs')
        .select(
          'id, created_at, user_id, progress_value, kpi_id, objective_id, task_id, kpi:kpis(id, title), objective:objectives(id, title), task:tasks(id, title)',
        )
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('comments')
        .select(
          'id, created_at, user_id, content, kpi_id, objective_id, kpi:kpis(id, title, workspace_id), objective:objectives(id, title, workspace_id)',
        )
        // We filter to the current workspace in-memory via the joined
        // entity's workspace_id — comments don't carry workspace_id
        // directly, and OR-across-joins is awkward in PostgREST.
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('objectives')
        .select('id, title, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('kpis')
        .select('id, title, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('tasks')
        .select(
          'id, title, status, block_reason, created_at, updated_at, objective:objectives!inner(id, title, workspace_id)',
        )
        .eq('objective.workspace_id', workspaceId)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase
        .from('checkins')
        .select('id, created_at, user_id, summary')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Collect every user_id that shows up in any event source, then
    // batch-fetch their profiles in one query.
    const userIds = new Set<string>();
    (progressRes.data || []).forEach((r: any) => r.user_id && userIds.add(r.user_id));
    (commentsRes.data || []).forEach((r: any) => r.user_id && userIds.add(r.user_id));
    (checkinsRes.data || []).forEach((r: any) => r.user_id && userIds.add(r.user_id));

    const profileByUserId = new Map<string, Pick<Profile, 'id' | 'full_name'>>();
    if (userIds.size > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(userIds));
      (profs || []).forEach((p: { id: string; full_name: string }) =>
        profileByUserId.set(p.id, p),
      );
    }
    const actorFor = (userId: string | null | undefined) =>
      userId ? profileByUserId.get(userId) ?? null : null;

    const out: ActivityEvent[] = [];

    // Progress log → "X actualizó progreso de Y a N%"
    (progressRes.data || []).forEach((r: any) => {
      const target = pickEntity(r);
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

    // Comments → "X comentó en Y" + quote
    (commentsRes.data || []).forEach((r: any) => {
      // Root filter by workspace: at least one joined entity must be in this workspace
      const kpi = pickOne(r.kpi);
      const obj = pickOne(r.objective);
      const entityInWs =
        (kpi && kpi.workspace_id === workspaceId) ||
        (obj && obj.workspace_id === workspaceId);
      if (!entityInWs) return;
      const target: EntityRef | undefined = obj
        ? { type: 'objective', id: obj.id, title: obj.title }
        : kpi
        ? { type: 'kpi', id: kpi.id, title: kpi.title }
        : undefined;
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

    // Creations — no actor available (no created_by column today). We
    // still show the event with an anonymous actor so the timeline
    // doesn't go silent on new entity creation.
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

    // Tasks — creation, completion, and blocked.
    (tasksRes.data || []).forEach((r: any) => {
      const objective = pickOne(r.objective);
      if (!objective) return;
      const parent: EntityRef = { type: 'objective', id: objective.id, title: objective.title };
      const target: EntityRef = { type: 'task', id: r.id, title: r.title };

      // task_created: emit only if the task is recent and hasn't moved off
      // 'pending' — otherwise we duplicate with completed/blocked below.
      if (r.status === 'pending' || r.created_at === r.updated_at) {
        out.push({
          id: `task-created-${r.id}`,
          kind: 'task_created',
          timestamp: r.created_at,
          actor: null,
          target,
          parent,
        });
      }

      if (r.status === 'completed') {
        out.push({
          id: `task-completed-${r.id}`,
          kind: 'task_completed',
          timestamp: r.updated_at || r.created_at,
          actor: null,
          target,
          parent,
        });
      } else if (r.status === 'blocked') {
        out.push({
          id: `task-blocked-${r.id}`,
          kind: 'task_blocked',
          timestamp: r.updated_at || r.created_at,
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

// ─────────── helpers ───────────

/** Supabase's nested-select returns either an object or a 1-item array
 *  depending on version. Normalize to a single object (or null). */
function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return (value as T | null) ?? null;
}

function pickEntity(r: any): EntityRef | undefined {
  const task = pickOne(r.task);
  if (task && r.task_id) return { type: 'task', id: task.id, title: task.title };
  const obj = pickOne(r.objective);
  if (obj && r.objective_id) return { type: 'objective', id: obj.id, title: obj.title };
  const kpi = pickOne(r.kpi);
  if (kpi && r.kpi_id) return { type: 'kpi', id: kpi.id, title: kpi.title };
  return undefined;
}
