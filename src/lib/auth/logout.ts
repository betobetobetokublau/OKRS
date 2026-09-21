import { createClient } from '@/lib/supabase/client';
import { forgetLastUser } from '@/lib/supabase/session';
import { clearUserCaches } from '@/lib/pwa/install-prompt';

/**
 * Signs out everywhere the session leaves traces: Supabase auth, the
 * `kublau:last-user` offline fallback, the middleware's `kublau-pwd-ok` cookie
 * and the service worker's user-scoped caches. Caller navigates to /login.
 */
export async function signOutEverywhere(): Promise<void> {
  forgetLastUser();
  const supabase = createClient();
  await supabase.auth.signOut();
  // Cookie was set by middleware; overwriting with Max-Age=0 on the same path expires it.
  document.cookie = 'kublau-pwd-ok=; Max-Age=0; Path=/; SameSite=Lax';
  clearUserCaches();
}
