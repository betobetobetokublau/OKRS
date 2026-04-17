'use client';

import { create } from 'zustand';

const STORAGE_KEY = 'kublau.sidebar.collapsed';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Shared collapsed-state for the sidebar. Persisted to localStorage so the
 * choice survives reloads.
 */
export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: readInitial(),
  toggle: () =>
    set((s) => {
      const next = !s.collapsed;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
      return { collapsed: next };
    }),
  setCollapsed: (v) =>
    set(() => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
      return { collapsed: v };
    }),
}));
