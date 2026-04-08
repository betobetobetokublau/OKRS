'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useNotificationStore } from '@/stores/notification-store';

export function useNotifications(userId: string | undefined, workspaceId: string | undefined) {
  const { setNotifications, markAsRead } = useNotificationStore();

  const fetchNotifications = useCallback(async () => {
    if (!userId || !workspaceId) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setNotifications(data);
  }, [userId, workspaceId, setNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
    markAsRead(notificationId);
  }, [markAsRead]);

  return { fetchNotifications, markNotificationAsRead };
}
