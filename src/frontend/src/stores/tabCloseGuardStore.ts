import { create } from 'zustand'

/**
 * What a tab was asked when the user tried to close it.
 *
 * `Save and close` is deliberately a separate answer from `Discard`: a tab that
 * can be saved and a tab that cannot both need to close, and collapsing them into
 * one "are you sure" turns a saveable tab into a lost one.
 */
export type TabCloseDecision = 'save-and-close' | 'discard' | 'cancel'

/**
 * A tab's answer to "may I close?".
 *
 * Resolves `'cancel'` when the user backs out, and a decision otherwise. The
 * guard is expected to have already performed the save when it answers
 * `'save-and-close'`, so the dock can close the tab unconditionally afterwards -
 * that ordering is what stops a failed save from closing a tab holding unsaved
 * work.
 */
export type TabCloseGuard = () => Promise<TabCloseDecision>

interface TabCloseGuardState {
  guards: Record<string, TabCloseGuard>
  /** Registers a guard for a tab and returns the function that removes it. */
  register: (tabId: string, guard: TabCloseGuard) => () => void
  unregister: (tabId: string) => void
  /** The guard for a tab, if one is installed. */
  get: (tabId: string) => TabCloseGuard | undefined
  /**
   * Every guard currently installed, keyed by tab.
   *
   * The dock's window close needs this: the requirement is that closing the app
   * with several dirty tabs asks about each of them rather than saving one and
   * silently dropping the rest.
   */
  all: () => Record<string, TabCloseGuard>
  reset: () => void
}

/**
 * Close guards, outside React.
 *
 * A module store rather than context because the dock's close path is not a
 * component: the tab bar's X, the drag guard and the window teardown all reach it
 * through plain callbacks, and threading a provider through each of them would
 * put a React context in the middle of a decision that has to be answerable
 * during teardown.
 */
export const useTabCloseGuardStore = create<TabCloseGuardState>((set, get) => ({
  guards: {},
  register: (tabId, guard) => {
    set(state => ({ guards: { ...state.guards, [tabId]: guard } }))
    return () => {
      // Only clear it if it is still this guard: a remount registers a new one,
      // and a late cleanup from the old instance must not remove it.
      if (get().guards[tabId] === guard) {
        get().unregister(tabId)
      }
    }
  },
  unregister: tabId =>
    set(state => {
      const { [tabId]: _removed, ...guards } = state.guards
      return { guards }
    }),
  get: tabId => get().guards[tabId],
  all: () => get().guards,
  reset: () => set({ guards: {} }),
}))
