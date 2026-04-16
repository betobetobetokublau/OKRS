'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateObjectiveProgress, calculateKpiProgress } from '@/lib/utils/progress';
import type { KPI, Objective, Task } from '@/types';

export interface ObjectiveWithTasks extends Objective {
  tasks: Task[];
}

export interface KPIWithObjectives extends KPI {
  objectives: ObjectiveWithTasks[];
}

/**
 * Loads the full 3-level OKR hierarchy: KPIs → Objectives → Tasks.
 * - KPIs are sorted by `sort_order ASC, created_at ASC`.
 * - Objectives come through the `kpi_objectives` junction (an objective can
 *   appear under multiple KPIs).
 * - `computed_progress` for objectives and KPIs is derived client-side from
 *   tasks / linked objectives (see calculateObjectiveProgress/calculateKpiProgress).
 * - On refetch, the `loading` flag is NOT toggled — consumers keep their current
 *   rendered state (expanded rows, side panels) while we silently refresh in
 *   the background. Only the very first fetch shows the loading state.
 */
export function useOkrs(workspaceId: string | undefined, periodId: string | undefined) {
  const [kpis, setKpis] = useState<KPIWithObjectives[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const fetchOkrs = useCallback(async () => {
    if (!workspaceId || !periodId) return;

    // Only show the loading state on the very first fetch. Subsequent refetches
    // should swap data under the existing UI so the user keeps their expanded
    // rows and any open side panel.
    if (!hasLoadedOnce.current) {
      setLoading(true);
    }
    const supabase = createClient();

    // 1) KPIs for the period, ordered
    const { data: kpiRows } = await supabase
      .from('kpis')
      .select(`
        *,
        responsible_user:profiles!kpis_responsible_user_id_fkey(*),
        responsible_department:departments!kpis_responsible_department_id_fkey(*)
      `)
      .eq('workspace_id', workspaceId)
      .eq('period_id', periodId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!kpiRows || kpiRows.length === 0) {
      setKpis([]);
      hasLoadedOnce.current = true;
      setLoading(false);
      return;
    }

    // 2) Objectives for the period with tasks
    const { data: objectiveRows } = await supabase
      .from('objectives')
      .select(`
        *,
        responsible_user:profiles!objectives_responsible_user_id_fkey(*),
        responsible_department:departments!objectives_responsible_department_id_fkey(*),
        tasks(*)
      `)
      .eq('workspace_id', workspaceId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: true });

    // Derive computed_progress per objective from its tasks
    const objectivesById = new Map<string, ObjectiveWithTasks>();
    (objectiveRows || []).forEach((o) => {
      const obj = o as ObjectiveWithTasks;
      const tasks = obj.tasks || [];
      obj.computed_progress = calculateObjectiveProgress(obj, tasks);
      objectivesById.set(obj.id, obj);
    });

    // 3) Junction links
    const kpiIds = kpiRows.map((k) => k.id);
    const { data: linkRows } = await supabase
      .from('kpi_objectives')
      .select('kpi_id, objective_id')
      .in('kpi_id', kpiIds);

    const objectivesByKpi = new Map<string, ObjectiveWithTasks[]>();
    (linkRows || []).forEach((link) => {
      const obj = objectivesById.get(link.objective_id);
      if (!obj) return;
      const arr = objectivesByKpi.get(link.kpi_id) || [];
      arr.push(obj);
      objectivesByKpi.set(link.kpi_id, arr);
    });

    // 4) Assemble and derive computed_progress per KPI from its objectives
    const assembled: KPIWithObjectives[] = kpiRows.map((k) => {
      const kpi = k as KPI;
      const linkedObjectives = objectivesByKpi.get(kpi.id) || [];
      const kpiProgress = calculateKpiProgress(
        kpi,
        linkedObjectives.map((obj) => ({ objective: obj, tasks: obj.tasks || [] })),
      );
      return {
        ...kpi,
        computed_progress: kpiProgress,
        objectives: linkedObjectives,
      };
    });

    setKpis(assembled);
    hasLoadedOnce.current = true;
    setLoading(false);
  }, [workspaceId, periodId]);

  useEffect(() => {
    // Reset the load flag when the workspace/period changes so we show the
    // loading state for a fresh workspace.
    hasLoadedOnce.current = false;
    fetchOkrs();
  }, [fetchOkrs]);

  /**
   * Apply a new sort order locally and persist it for all affected KPIs.
   * Accepts the reordered array of KPI ids (index = new sort_order).
   */
  const persistOrder = useCallback(async (orderedIds: string[]) => {
    // Optimistic local update
    setKpis((prev) => {
      const byId = new Map(prev.map((k) => [k.id, k]));
      const next: KPIWithObjectives[] = [];
      orderedIds.forEach((id, idx) => {
        const k = byId.get(id);
        if (k) next.push({ ...k, sort_order: idx });
      });
      // Append any KPIs that were not in the ordered list (shouldn't happen, defensive)
      prev.forEach((k) => {
        if (!orderedIds.includes(k.id)) next.push(k);
      });
      return next;
    });

    const supabase = createClient();
    // Persist sort_order for each KPI. Updates can run in parallel.
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('kpis').update({ sort_order: idx }).eq('id', id),
      ),
    );
  }, []);

  return { kpis, loading, refetch: fetchOkrs, persistOrder };
}
