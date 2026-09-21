'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCurrentMonthStart } from '@/lib/utils/dates';

/**
 * Whether the user has NOT saved a check-in yet this calendar month in the
 * workspace. Drives the badge on the mobile Check-in tab and the "Hoy" strip.
 * `null` while unknown (first load / no session).
 */
export function useCheckinPending(workspaceId: string | undefined, userId: string | undefined) {
  const [pending, setPending] = useState<boolean | null>(null);

  const refetch = useCallback(async () => {
    if (!workspaceId || !userId) return;
    const supabase = createClient();
    const { count, error } = await supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .gte('created_at', getCurrentMonthStart().toISOString());
    if (error) return;
    setPending((count ?? 0) === 0);
  }, [workspaceId, userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { pending, refetch };
}
