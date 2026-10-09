import { create } from 'zustand'
import type { HookStubEntry } from './active-stubs.algorithm'

export interface HookStubsState {
  /** By hook name. A hook with no entry is not stubbed. */
  entries: Record<string, HookStubEntry>
}

export interface HookStubsActions {
  setEnabled: (name: string, enabled: boolean) => void
  setText:    (name: string, text: string) => void
}

/**
 * The stubs the person set for this session's sample runs (issue #201): a hook whose stub is on answers
 * with its value instead of being called, which is how a run skips a slow or paid callout. Kept for the
 * session only; a stub is not part of a recipe.
 */
export const useHookStubsStore = create<HookStubsState & HookStubsActions>(set => ({
  entries:    {},
  setEnabled: (name, enabled) => {
    set(state => ({ entries: { ...state.entries, [name]: { text: state.entries[name]?.text ?? 'null', enabled } } }))
  },
  setText: (name, text) => {
    set(state => ({ entries: { ...state.entries, [name]: { enabled: state.entries[name]?.enabled ?? false, text } } }))
  },
}))
