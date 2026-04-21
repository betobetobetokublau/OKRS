import { create } from 'zustand';

/**
 * Lightweight bridge between the check-in page and the topbar so the
 * "Guardar check-in" button can sit in the global topbar without the
 * topbar knowing anything about the page's state.
 *
 * The check-in page registers its save handler on mount and tears it
 * down on unmount; the topbar only knows "is there a handler, and if
 * so is it currently saving?" and invokes it.
 */
interface CheckinSaveState {
  handler: (() => void | Promise<void>) | null;
  saving: boolean;
  /** True when the check-in page has nothing pending to save. Lets the
   *  topbar disable the button so users don't fire empty saves. */
  disabled: boolean;
  registerHandler: (
    h: (() => void | Promise<void>) | null,
    opts?: { saving?: boolean; disabled?: boolean },
  ) => void;
  setSaving: (saving: boolean) => void;
  setDisabled: (disabled: boolean) => void;
}

export const useCheckinSaveStore = create<CheckinSaveState>((set) => ({
  handler: null,
  saving: false,
  disabled: false,
  registerHandler: (handler, opts) =>
    set({
      handler,
      saving: opts?.saving ?? false,
      disabled: opts?.disabled ?? false,
    }),
  setSaving: (saving) => set({ saving }),
  setDisabled: (disabled) => set({ disabled }),
}));
