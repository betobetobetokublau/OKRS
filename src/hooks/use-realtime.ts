'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useNotificationStore } from '@/stores/notification-store';
import type { Notification } from '@/types';

export function useRealtime(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Pull the action via `getState()` rather than closing over a
          // hook selector. Zustand actions are stable references, but the
          // useNotificationStore() destructure subscribes the consumer to
          // every store change — re-running the effect on each notification
          // would tear down + rebuild the channel and leak sockets.
          useNotificationStore.getState().addNotification(payload.new as Notification);
        }
      )
      .subscribe();

    return () => {
      // Supabase recommends calling `.unsubscribe()` BEFORE
      // `removeChannel(...)` so the channel's state machine tears down its
      // socket and reconnect timer; `removeChannel` alone only deregisters
      // the channel from the client and can leave those resources lingering.
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
