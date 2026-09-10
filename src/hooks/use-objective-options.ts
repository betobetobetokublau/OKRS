'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Department, Objective } from '@/types';

/**
 * Objectives of the active period grouped by department, for `<select>`
 * pickers (`<optgroup>` per department). An objective belongs to a group for
 * its `responsible_department_id` AND for every linked `objective_departments`
 * row, so it can appear under several departments. Objectives with no
 * department at all land in a trailing "Sin departamento" group.
 */
export interface ObjectiveOptionGroup {
  /** null = "Sin departamento". */
  department: Department | null;
  objectives: Objective[];
}

export const NO_DEPARTMENT_LABEL = 'Sin departamento';

export function groupObjectivesByDepartment(
  objectives: Objective[],
  departments: Department[],
  links: Array<{ objective_id: string; department_id: string }>,
): ObjectiveOptionGroup[] {
  const byDept = new Map<string, Objective[]>();
  const orphans: Objective[] = [];
  const linkedDeptIds = new Map<string, Set<string>>();
  for (const l of links) {
    const set = linkedDeptIds.get(l.objective_id) ?? new Set<string>();
    set.add(l.department_id);
    linkedDeptIds.set(l.objective_id, set);
  }
  for (const o of objectives) {
    const ids = new Set<string>(linkedDeptIds.get(o.id) ?? []);
    if (o.responsible_department_id) ids.add(o.responsible_department_id);
    if (ids.size === 0) {
      orphans.push(o);
      continue;
    }
    for (const id of Array.from(ids)) {
      const arr = byDept.get(id) ?? [];
      arr.push(o);
      byDept.set(id, arr);
    }
  }
  const byTitle = (a: Objective, b: Objective) => a.title.localeCompare(b.title, 'es');
  const groups: ObjectiveOptionGroup[] = departments
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .filter((d) => byDept.has(d.id))
    .map((d) => ({ department: d, objectives: (byDept.get(d.id) ?? []).sort(byTitle) }));
  if (orphans.length > 0) groups.push({ department: null, objectives: orphans.sort(byTitle) });
  return groups;
}

export function useObjectiveOptions(workspaceId: string | undefined, periodId: string | undefined) {
  const [groups, setGroups] = useState<ObjectiveOptionGroup[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!workspaceId) {
      setGroups([]);
      setObjectives([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let objQuery = supabase.from('objectives').select('*').eq('workspace_id', workspaceId);
    if (periodId) objQuery = objQuery.eq('period_id', periodId);
    const [objRes, deptRes] = await Promise.all([
      objQuery.order('title', { ascending: true }),
      supabase.from('departments').select('*').eq('workspace_id', workspaceId),
    ]);
    const objs = (objRes.data || []) as Objective[];
    const depts = (deptRes.data || []) as Department[];
    const ids = objs.map((o) => o.id);
    const linkRes = ids.length
      ? await supabase.from('objective_departments').select('objective_id, department_id').in('objective_id', ids)
      : { data: [] as Array<{ objective_id: string; department_id: string }> };
    setObjectives(objs);
    setGroups(
      groupObjectivesByDepartment(
        objs,
        depts,
        (linkRes.data || []) as Array<{ objective_id: string; department_id: string }>,
      ),
    );
    setLoading(false);
  }, [workspaceId, periodId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { groups, objectives, loading, refetch };
}
