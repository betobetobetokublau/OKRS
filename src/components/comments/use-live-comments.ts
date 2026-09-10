'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface LiveTable {
  /** Table in the `supabase_realtime` publication (e.g. `comments`). */
  table: string;
  /** Postgres-changes filter, e.g. `task_id=eq.<uuid>`. */
  filter: string;
}

const DEBOUNCE_MS = 300;

/**
 * Subscribes to INSERTs on the given tables and calls `refetch` (debounced by
 * 300ms) whenever a row lands. Refetching — rather than patching state from
 * the payload — keeps the `profiles` joins correct with no extra code.
 *
 * One channel per hook instance; `channelName` must be unique per mounted
 * component (e.g. `task-comments-${taskId}`) so two instances never share a
 * channel and tear each other down.
 */
export function useLiveRefetch(channelName: string, tables: LiveTable[], refetch: () => void | Promise<unknown>) {
  // Keep the latest refetch without re-subscribing when its identity changes.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // Tables are usually passed as an inline literal; key on their content so a
  // new array identity per render does not rebuild the channel.
  const tablesKey = JSON.stringify(tables);

  useEffect(() => {
    const parsed = JSON.parse(tablesKey) as LiveTable[];
    if (parsed.length === 0) return;

    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refetchRef.current();
      }, DEBOUNCE_MS);
    };

    let channel = supabase.channel(channelName);
    for (const { table, filter } of parsed) {
      channel = channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table, filter },
        schedule,
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      // Supabase recommends `.unsubscribe()` BEFORE `removeChannel(...)` so the
      // channel's state machine tears down its socket and reconnect timer;
      // `removeChannel` alone can leave those lingering (see use-realtime.ts).
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [channelName, tablesKey]);
}
