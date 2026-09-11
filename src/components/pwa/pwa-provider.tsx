'use client';

import { useEffect } from 'react';
import { useOfflineStore } from '@/stores/offline-store';
import { setDeferredInstallPrompt, type BeforeInstallPromptEvent } from '@/lib/pwa/install-prompt';
import { OfflineBanner } from './offline-banner';
import { useConnectivityProbe } from './use-connectivity-probe';

/**
 * Registers /sw.js (dev and prod — dev is needed to test the offline shell),
 * mirrors connectivity + SW update state into the offline store and captures
 * the install prompt. Rendered once in the root layout.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const setOnline = useOfflineStore((s) => s.setOnline);
  const setUpdateAvailable = useOfflineStore((s) => s.setUpdateAvailable);
  const setInstallable = useOfflineStore((s) => s.setInstallable);

  // Connectivity — browser events are the fast path; the real truth comes from
  // the probe loop below (see useConnectivityProbe).
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  useConnectivityProbe();

  // Install prompt
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
      setInstallable(true);
    };
    const onInstalled = () => {
      setDeferredInstallPrompt(null);
      setInstallable(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [setInstallable]);

  // Service worker registration + update detection
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const watchInstalling = (reg: ServiceWorkerRegistration) => {
      const worker = reg.installing;
      if (!worker) return;
      const onState = () => {
        // "installed" with an existing controller = a new version is waiting
        // behind the live one (first install has no controller → no banner).
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          setUpdateAvailable(true);
        }
      };
      worker.addEventListener('statechange', onState);
      cleanups.push(() => worker.removeEventListener('statechange', onState));
    };

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (cancelled) return;
        if (reg.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
        watchInstalling(reg);
        const onUpdateFound = () => watchInstalling(reg);
        reg.addEventListener('updatefound', onUpdateFound);
        cleanups.push(() => reg.removeEventListener('updatefound', onUpdateFound));
      })
      .catch((err: unknown) => {
        // Registration failing must never break the app (e.g. CSP, http origin).
        console.warn('[pwa] service worker registration failed', err);
      });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [setUpdateAvailable]);

  return (
    <>
      <OfflineBanner />
      {children}
    </>
  );
}
