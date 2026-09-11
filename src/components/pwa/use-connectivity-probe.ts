'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useOfflineStore } from '@/stores/offline-store';
import { probeConnectivity, PROBE_INTERVAL_S } from '@/lib/pwa/connectivity';

/**
 * While offline: count down PROBE_INTERVAL_S seconds, probe `/api/ping`, and
 * either flip back online (dispatching a synthetic `online` event so the
 * outbox replays and listeners refetch) or restart the countdown. The banner
 * shows the countdown and can call `retryNow()` to skip it.
 *
 * Nothing here blocks the UI: cached pages/data stay browsable the whole time.
 */
export function useConnectivityProbe() {
  const online = useOfflineStore((s) => s.online);
  const setOnline = useOfflineStore((s) => s.setOnline);
  const setRetryIn = useOfflineStore((s) => s.setRetryIn);
  const setProbing = useOfflineStore((s) => s.setProbing);
  const inFlight = useRef(false);

  const probe = useCallback(async () => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setProbing(true);
    try {
      const ok = await probeConnectivity();
      if (ok) {
        setOnline(true);
        setRetryIn(0);
        // Same signal the browser would emit — wakes the outbox replay and
        // any component listening for reconnection.
        window.dispatchEvent(new Event('online'));
      } else {
        setRetryIn(PROBE_INTERVAL_S);
      }
      return ok;
    } finally {
      inFlight.current = false;
      setProbing(false);
    }
  }, [setOnline, setRetryIn, setProbing]);

  useEffect(() => {
    if (online) {
      setRetryIn(0);
      return;
    }
    setRetryIn(PROBE_INTERVAL_S);
    const tick = setInterval(() => {
      const next = useOfflineStore.getState().retryIn - 1;
      if (next <= 0) {
        void probe();
      } else {
        setRetryIn(next);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [online, probe, setRetryIn]);

  return probe;
}

/** Manual "Reintentar ahora" — safe to call from anywhere. */
export async function retryConnectivityNow(): Promise<boolean> {
  const { setOnline, setRetryIn, setProbing } = useOfflineStore.getState();
  setProbing(true);
  try {
    const ok = await probeConnectivity();
    if (ok) {
      setOnline(true);
      setRetryIn(0);
      window.dispatchEvent(new Event('online'));
    } else {
      setRetryIn(PROBE_INTERVAL_S);
    }
    return ok;
  } finally {
    setProbing(false);
  }
}
