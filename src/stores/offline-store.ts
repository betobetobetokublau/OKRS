import { create } from 'zustand';

/**
 * Connectivity + offline-outbox status shared between the network layer
 * (which queues writes while offline and replays them) and the UI banner.
 */
export interface OfflineFailure {
  id: string;
  /** Human-readable description of the queued request, e.g. "PATCH tasks". */
  label: string;
  error: string;
  at: string;
}

interface OfflineState {
  /** navigator.onLine mirrored into React state. */
  online: boolean;
  /** Requests waiting in the outbox (IndexedDB). */
  pendingCount: number;
  /** A replay is in progress. */
  syncing: boolean;
  /** Replays that failed permanently (4xx) — surfaced to the user. */
  failures: OfflineFailure[];
  /** Service worker has a new version waiting. */
  updateAvailable: boolean;
  /** Browser fired `beforeinstallprompt`; the app can offer "Instalar app". */
  installable: boolean;
  setOnline: (online: boolean) => void;
  setPendingCount: (n: number) => void;
  setSyncing: (syncing: boolean) => void;
  addFailure: (f: OfflineFailure) => void;
  clearFailures: () => void;
  setUpdateAvailable: (v: boolean) => void;
  setInstallable: (v: boolean) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  online: true,
  pendingCount: 0,
  syncing: false,
  failures: [],
  updateAvailable: false,
  installable: false,
  setOnline: (online) => set({ online }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setSyncing: (syncing) => set({ syncing }),
  addFailure: (f) => set((s) => ({ failures: [f, ...s.failures].slice(0, 20) })),
  clearFailures: () => set({ failures: [] }),
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
  setInstallable: (installable) => set({ installable }),
}));
