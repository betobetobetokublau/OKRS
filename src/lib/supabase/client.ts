import { createBrowserClient } from '@supabase/ssr';
import { offlineAwareFetch } from '@/lib/offline/fetch';

function build() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Every PostgREST mutation goes through the offline outbox wrapper
      // (queued in IndexedDB while offline, replayed on reconnect).
      global: { fetch: offlineAwareFetch },
    }
  );
}

// Inferred from `build()` (not `ReturnType<typeof createBrowserClient>`) so the
// library's generic defaults (`Database = any`) survive and call sites keep
// their loosely-typed `.from(...)` results.
type BrowserClient = ReturnType<typeof build>;

let browserClient: BrowserClient | undefined;

/**
 * Browser Supabase client. `createClient()` is called from ~100 components;
 * in the browser it returns one cached instance so auth listeners, realtime
 * sockets and the offline fetch wrapper aren't duplicated per component.
 * (`@supabase/ssr` already memoises in the browser; the explicit cache makes
 * that contract visible here and independent of the library's heuristics.)
 */
export function createClient(): BrowserClient {
  if (typeof window === 'undefined') return build();
  browserClient ??= build();
  return browserClient;
}
