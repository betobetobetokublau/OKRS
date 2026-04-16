'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { KPI, Objective, Task } from '@/types';

export interface ObjectiveWithTasks extends Objective {
  tasks: Task[];
}

export interface KPIWithObjectives extends KPI {
  objectives: ObjectiveWithTasks[];
}

/**
 * Loads the full 3-level OKR hierarchy: KPIs → Objectives → Tasks.
 * Objectives come through the `kpi_objectives` junction table.
 * An objective may appear under multiple KPIs (many-to-many).
 */
export function useOkrs(workspaceId: string | undefined, periodId: string | undefined) {
  const [kpis, setKpis] = useState<KPIWithObjectives[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOkrs = useCallback(async () => {
    if (!workspaceId || !periodId) return;
    setLoading(true);
    const supabase = createClient();

    // 1) Load KPIs for the period
    const { data: kpiRows } = await supabase
      .from('kpis')
      .select(`
        *,
        responsible_user:profiles!kpis_responsible_user_id_fkey(*),
        responsible_department:departments!kpis_responsible_department_id_fkey(*)
      `)
      .eq('workspace_id', workspaceId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: true });

    if (!kpiRows || kpiRows.length === 0) {
      setKpis([]);
      setLoading(false);
      return;
    }

    // 2) Load all objectives for the period, with their tasks
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

    const objectivesById = new Map<string, ObjectiveWithTasks>();
    (objectiveRows || []).forEach((o) => {
      objectivesById.set(o.id, o as ObjectiveWithTasks);
    });

    // 3) Load junction links
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

    const assembled: KPIWithObjectives[] = kpiRows.map((k) => ({
      ...(k as KPI),
      objectives: objectivesByKpi.get(k.id) || [],
    }));

    setKpis(assembled);
    setLoading(false);
  }, [workspaceId, periodId]);

  useEffect(() => {
    fetchOkrs();
  }, [fetchOkrs]);

  return { kpis, loading, refetch: fetchOkrs };
}
