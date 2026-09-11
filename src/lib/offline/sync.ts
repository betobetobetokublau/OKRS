'use client';

/**
 * Replays the offline outbox against Supabase once connectivity returns.
 *
 * Sequential, oldest-first, using the *raw* `fetch` (never the Supabase
 * client's wrapped fetch — that would re-queue on failure). Auth headers are
 * re-attached from the live session at replay time, so nothing sensitive is
 * ever persisted alongside the queued request.
 */
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useOfflineStore } from '@/stores/offline-store';
import { isOffline, type OutboxEntry } from './outbox';
import { clear, count, list, remove } from './outbox-db';

export type AuthHeadersProvider = () => Promise<Record<string, string>>;

/** Thrown by the auth provider when we can't get a usable token right now. */
export class NoSessionError extends Error {
  constructor(message = 'No active session') {
    super(message);
    this.name = 'NoSessionError';
  }
}

/**
 * Default provider: `getSession()` works offline (session lives in
 * cookies/localStorage) but a token *refresh* needs the network. If the token
 * is expired and refresh fails we throw so the caller treats it like a network
 * error (keep the queue, retry later) rather than dropping the writes.
 */
export async function supabaseAuthHeaders(): Promise<Record<string, string>> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new NoSessionError('NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new NoSessionError(error?.message ?? 'session unavailable');
  }
  return {
    apikey: anonKey,
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

/** Best-effort extraction of PostgREST's `{ message }` from an error body. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText;
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const msg = (parsed as { message?: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
    return text.slice(0, 200);
  } catch {
    return res.statusText;
  }
}

async function refreshPendingCount(): Promise<void> {
  useOfflineStore.getState().setPendingCount(await count());
}

async function replayOne(entry: OutboxEntry, auth: Record<string, string>): Promise<Response> {
  return fetch(entry.url, {
    method: entry.method,
    headers: {
      ...entry.headers,
      ...auth,
      // Lets us correlate a replayed request with its outbox entry in logs.
      'x-kublau-outbox-id': entry.id,
    },
    body: entry.body ?? undefined,
  });
}

async function run(getAuthHeaders: AuthHeadersProvider): Promise<void> {
  const store = useOfflineStore.getState();
  const entries = await list();
  store.setPendingCount(entries.length);
  if (entries.length === 0 || isOffline()) return;

  store.setSyncing(true);
  try {
    let auth: Record<string, string>;
    try {
      auth = await getAuthHeaders();
    } catch {
      // No token right now (expired + refresh failed, or logged out). Treat
      // like a network error: keep everything and try again later.
      return;
    }

    for (const entry of entries) {
      let res: Response;
      try {
        res = await replayOne(entry, auth);
      } catch {
        // Network died mid-replay. Stop here; later entries may depend on
        // this one (e.g. PATCH on a row created by an earlier POST).
        break;
      }

      if (res.ok) {
        await remove(entry.id);
      } else if (res.status === 401) {
        // Token rejected — most likely expired while we were offline and the
        // refresh hasn't landed yet. Transient: retry on the next pass.
        break;
      } else if (res.status >= 400 && res.status < 500) {
        // The server understood and refused (RLS, constraint, conflict).
        // Retrying won't help; drop it and tell the user.
        await remove(entry.id);
        useOfflineStore.getState().addFailure({
          id: entry.id,
          label: entry.label,
          error: `${res.status} ${await errorMessage(res)}`,
          at: new Date().toISOString(),
        });
      } else {
        // 5xx / anything else: server-side trouble, keep and retry later.
        break;
      }
      await refreshPendingCount();
    }
  } finally {
    useOfflineStore.getState().setSyncing(false);
    await refreshPendingCount();
  }
}

let inflight: Promise<void> | null = null;

/**
 * Replay the outbox. Concurrent calls (online event + interval + manual)
 * share one in-flight promise so entries are never sent twice in parallel.
 */
export function replayOutbox(
  getAuthHeaders: AuthHeadersProvider = supabaseAuthHeaders
): Promise<void> {
  if (inflight) return inflight;
  inflight = run(getAuthHeaders).finally(() => {
    inflight = null;
  });
  return inflight;
}

const RETRY_INTERVAL_MS = 60_000;

declare global {
  interface Window {
    __kublauOutbox?: {
      list: () => Promise<OutboxEntry[]>;
      clear: () => Promise<void>;
      replay: () => Promise<void>;
    };
  }
}

/** Console helper, development only: `window.__kublauOutbox.list()` etc. */
function installDevTools(): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (typeof window === 'undefined' || window.__kublauOutbox) return;
  window.__kublauOutbox = {
    list,
    clear: async () => {
      await clear();
      await refreshPendingCount();
    },
    replay: () => replayOutbox(),
  };
}

/**
 * Mount once per page (workspace layout). Seeds `pendingCount`, replays when
 * mounted online, on every `online` event, and every 60s while something is
 * pending (belt and braces: `online` is unreliable behind captive portals).
 */
export function useOfflineSync(): void {
  useEffect(() => {
    installDevTools();

    let cancelled = false;
    void count().then((n) => {
      if (!cancelled) useOfflineStore.getState().setPendingCount(n);
    });
    if (!isOffline()) void replayOutbox();

    const onOnline = () => {
      void replayOutbox();
    };
    window.addEventListener('online', onOnline);

    const timer = window.setInterval(() => {
      if (useOfflineStore.getState().pendingCount > 0 && !isOffline()) {
        void replayOutbox();
      }
    }, RETRY_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, []);
}
