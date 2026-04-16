'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateObjectiveProgress } from '@/lib/utils/progress';
import type { Objective, Task, KPI } from '@/types';

export interface ObjectiveRow extends Objective {
  tasks: Task[];
  linked_kpis: KPI[];
}

/**
 * Loads all objectives for a period with:
 *   - their tasks (for expand-to-show),
 *   - the KPIs they are linked to (for the KPI column),
 *   - a client-side `computed_progress` derived from tasks.
 *
 * Like `useOkrs`, subsequent refetches do NOT toggle `loading` so the user
 * keeps any open expanded rows / side panel while data refreshes underneath.
 */
export function useObjectivesTable(workspaceId: string | undefined, periodId: string | undefined) {
  const [rows, setRows] = useState<ObjectiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const fetchRows = useCallback(async () => {
    if (!workspaceId || !periodId) return;
    if (!hasLoadedOnce.current) setLoading(true);
    const supabase = createClient();

    const { data: objectiveRows } = await supabase
      .from('objectives')
      .select(`
        *,
        responsible_user:profiles!objectives_responsible_user_id_fkey(*),
        responsible_department:departments!objectives_responsible_department_id_fkey(*),
        tasks(*, assigned_user:profiles!tasks_assigned_user_id_fkey(*))
      `)
      .eq('workspace_id', workspaceId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false });

    if (!objectiveRows || objectiveRows.length === 0) {
      setRows([]);
      hasLoadedOnce.current = true;
      setLoading(false);
      return;
    }

    const objIds = objectiveRows.map((o) => o.id);

    // Fetch junction + kpi info in one go
    const { data: linkRows } = await supabase
      .from('kpi_objectives')
      .select('objective_id, kpi:kpis(*)')
      .in('objective_id', objIds);

    const kpisByObj = new Map<string, KPI[]>();
    // Supabase's TS inference flattens the nested `kpi` into an array in some
    // versions; accept either shape defensively.
    (linkRows || []).forEach((r: any) => {
      const kpi: KPI | null = Array.isArray(r.kpi) ? (r.kpi[0] ?? null) : r.kpi;
      if (!kpi) return;
      const arr = kpisByObj.get(r.objective_id) || [];
      arr.push(kpi);
      kpisByObj.set(r.objective_id, arr);
    });

    const assembled: ObjectiveRow[] = objectiveRows.map((o) => {
      const obj = o as ObjectiveRow;
      const tasks = obj.tasks || [];
      obj.computed_progress = calculateObjectiveProgress(obj, tasks);
      obj.linked_kpis = kpisByObj.get(obj.id) || [];
      return obj;
    });

    setRows(assembled);
    hasLoadedOnce.current = true;
    setLoading(false);
  }, [workspaceId, periodId]);

  useEffect(() => {
    hasLoadedOnce.current = false;
    fetchRows();
  }, [fetchRows]);

  return { rows, loading, refetch: fetchRows };
}
