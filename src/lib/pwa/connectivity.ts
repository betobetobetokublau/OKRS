/**
 * Real connectivity check. `navigator.onLine` only says whether the OS has a
 * network interface up — captive portals, dead Wi-Fi and flaky mobile links
 * all report `true`. So the banner probes our own origin instead.
 */
export const PROBE_INTERVAL_S = 10;
export const PROBE_TIMEOUT_MS = 4000;

export async function probeConnectivity(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`/api/ping?t=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Seconds → "10 s" style label used by the banner countdown. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${s} s`;
}
