'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { KPI } from '@/types';

export function useKpis(workspaceId: string | undefined, periodId: string | undefined) {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKpis = useCallback(async () => {
    if (!workspaceId || !periodId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('kpis')
      .select(`
        *,
        responsible_user:profiles!kpis_responsible_user_id_fkey(*),
        responsible_department:departments!kpis_responsible_department_id_fkey(*)
      `)
      .eq('workspace_id', workspaceId)
      .eq('period_id', periodId)
      .order('created_at', { ascending: false });

    if (data) setKpis(data as KPI[]);
    setLoading(false);
  }, [workspaceId, periodId]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  return { kpis, loading, refetch: fetchKpis };
}
