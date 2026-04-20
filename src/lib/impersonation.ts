'use client';

/**
 * Admin "view as user" impersonation state is scoped to a single browser
 * tab via sessionStorage. The only thing we persist between page loads is
 * the target user id; `use-workspace` re-fetches that user's profile and
 * user_workspace row on every hydration and applies them to the store.
 *
 * Why sessionStorage (not localStorage): impersonation must not leak
 * across browser restarts or into other tabs. Closing the tab resets the
 * admin to their own view — which is also what the user expects.
 */
const STORAGE_KEY = 'kublau:impersonate:user-id';

/** Return the impersonation target, or null if none. Safe to call during SSR. */
export function readImpersonationTarget(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Set (or clear, with null) the impersonation target. Safe during SSR. */
export function writeImpersonationTarget(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) sessionStorage.setItem(STORAGE_KEY, userId);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage can throw in private mode; silently fall through —
    // the admin will just lose impersonation on the next page load.
  }
}
