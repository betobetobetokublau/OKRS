'use client';

import { useEffect } from 'react';
import { useOfflineStore } from '@/stores/offline-store';

/**
 * Routes to pre-cache for offline browsing: the sections a member opens
 * daily. Board pages are added by the caller (one per visible board).
 */
export function workspaceRoutes(slug: string, boardIds: string[]): string[] {
  const base = `/${slug}`;
  const fixed = [
    base,
    `${base}/check-in`,
    `${base}/objetivos`,
    `${base}/tableros`,
    `${base}/mis-tareas`,
    `${base}/okrs`,
    `${base}/kpis`,
  ];
  return [...fixed, ...boardIds.map((id) => `${base}/tableros/${id}`)];
}

/** Ask the active service worker to cache these routes (HTML + RSC). No-op without SW. */
export async function warmRoutes(urls: string[]): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const worker = reg?.active ?? navigator.serviceWorker.controller;
  if (!worker) return false;
  worker.postMessage({ type: 'WARM_ROUTES', urls });
  return true;
}

/**
 * Warms the workspace routes once per session when online, and again after
 * every reconnection (so pages you never opened still work offline later).
 */
export function useWarmRoutes(slug: string | undefined, boardIds: string[]) {
  const online = useOfflineStore((s) => s.online);
  const key = boardIds.join(',');
  useEffect(() => {
    if (!slug || !online) return;
    const t = setTimeout(() => {
      void warmRoutes(workspaceRoutes(slug, key ? key.split(',') : []));
    }, 2500); // let the page's own requests finish first
    return () => clearTimeout(t);
  }, [slug, online, key]);
}
