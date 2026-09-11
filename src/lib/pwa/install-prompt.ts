/**
 * Holds the deferred `beforeinstallprompt` event captured by <PwaProvider>
 * so any UI (the topbar user menu) can trigger the native install dialog.
 * Module-level because the event object cannot live in a serialisable store.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

export function setDeferredInstallPrompt(e: BeforeInstallPromptEvent | null): void {
  deferred = e;
}

export function hasDeferredInstallPrompt(): boolean {
  return deferred !== null;
}

/** Shows the browser install dialog. Resolves to true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  // The event is single-use: clear before awaiting so a double click can't re-prompt.
  deferred = null;
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice.outcome === 'accepted';
  } catch {
    return false;
  }
}

/**
 * Tells the SW to drop user-scoped caches (HTML/RSC + Supabase rows). Call on
 * logout so a shared device can't read the previous user's data offline.
 */
export function clearUserCaches(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_USER_CACHES' });
}
