import type { SupabaseClient, User } from '@supabase/supabase-js';

const LAST_USER_KEY = 'kublau:last-user';

/**
 * Current user WITHOUT a network round-trip when possible.
 *
 * `auth.getUser()` always calls `/auth/v1/user`; offline that throws and every
 * screen that awaited it (workspace bootstrap, comment composer…) hung on its
 * spinner. Order of preference:
 *   1. `auth.getSession()` — locally stored session, no network while valid.
 *   2. `auth.getUser()` — network; fresh tab or expired-but-online.
 *   3. Offline & expired: the auth lib returns no session (refresh failed).
 *      Fall back to the last known user mirrored in localStorage so cached
 *      pages keep rendering; RLS still guards real reads, and queued writes
 *      replay later with a fresh token (see lib/offline/sync).
 */
export async function getCurrentUser(supabase: SupabaseClient): Promise<User | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return remember(data.session.user);
  } catch {
    /* fall through */
  }
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) return remember(data.user);
  } catch {
    /* fall through */
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return readLastUser();
  return null;
}

function remember(user: User): User {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: user.id, email: user.email ?? null }));
  } catch {
    /* storage unavailable */
  }
  return user;
}

function readLastUser(): User | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; email?: string | null };
    if (!parsed.id) return null;
    // Minimal shape; callers only use `id` (and occasionally `email`).
    return { id: parsed.id, email: parsed.email ?? undefined, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } as User;
  } catch {
    return null;
  }
}

/** Called on logout so a shared device doesn't keep the previous identity. */
export function forgetLastUser() {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* ignore */
  }
}
