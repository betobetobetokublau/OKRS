'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Objective } from '@/types';

export function useObjectives(workspaceId: string | undefined, periodId: string | undefined) {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchObjectives = useCallback(async () => {
    if (!workspaceId || !periodId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('objectives')
      .select(`
        *,
        responsible_user:profiles!objectives_responsible_user_id_fkey(*),
        responsible_department:departments!objectives_responsible_department_id_fkey(*),
        tasks(*)
      `)
      .eq('workspace_id', workspaceId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false });

    if (data) setObjectives(data as Objective[]);
    setLoading(false);
  }, [workspaceId, periodId]);

  useEffect(() => {
    fetchObjectives();
  }, [fetchObjectives]);

  return { objectives, loading, refetch: fetchObjectives };
}
