import { useEffect, useRef } from 'react'

import {
  broadcastNavigation,
  getNavigationChannel,
  getWindowId,
  type NavigationBroadcast,
  useNavigationStore,
} from '@/stores/navigationStore'

/**
 * Read the persisted navigation state directly from localStorage and
 * push it into the in-memory Zustand store. Used by both the storage
 * event listener (peer tab wrote something) and the WINDOW_CLOSED
 * broadcast listener (peer tab just pagehid'd) — they're redundant
 * triggers, and we want either one to wake the in-memory state up
 * even if the other got dropped by the browser.
 */
function syncFromLocalStorage(): void {
  try {
    const raw = localStorage.getItem('modelibr_navigation')
    if (!raw) return
    const parsed = JSON.parse(raw) as {
      state?: {
        activeWindows?: Record<string, unknown>
        recentlyClosedTabs?: unknown[]
        recentlyClosedWindows?: unknown[]
      }
    }
    const persisted = parsed?.state
    if (!persisted) return
    type State = ReturnType<typeof useNavigationStore.getState>
    useNavigationStore.setState({
      activeWindows: (persisted.activeWindows ?? {}) as State['activeWindows'],
      recentlyClosedTabs: (persisted.recentlyClosedTabs ??
        []) as State['recentlyClosedTabs'],
      recentlyClosedWindows: (persisted.recentlyClosedWindows ??
        []) as State['recentlyClosedWindows'],
    })
  } catch {
    /* malformed payload — ignore */
  }
}

/**
 * Initialises the current browser tab as a unique "window" in the navigation
 * store. Must be called once at the root of the app (e.g. in App.tsx or
 * SplitterLayout).
 *
 * Responsibilities:
 * 1. Generate / recover a stable windowId via sessionStorage.
 * 2. Reclaim a self-archived entry (refresh path) before registering.
 * 3. Register the window in the Zustand store (default tabs on first visit).
 * 4. Listen for BroadcastChannel messages from other windows.
 * 5. On pagehide → move our own window state into recentlyClosedWindows.
 * 6. Run stale-window garbage collection on mount.
 */
export function useWindowInit(): string {
  const windowId = getWindowId()
  const windowIdRef = useRef(windowId)

  const initWindow = useNavigationStore(s => s.initWindow)
  const reclaimWindow = useNavigationStore(s => s.reclaimWindow)
  const removeTabFromWindow = useNavigationStore(s => s.removeTabFromWindow)
  const addTabToWindow = useNavigationStore(s => s.addTabToWindow)
  const removeWindow = useNavigationStore(s => s.removeWindow)
  const gcStaleWindows = useNavigationStore(s => s.gcStaleWindows)
  const touchWindow = useNavigationStore(s => s.touchWindow)

  // ── 1. Reclaim / Init / GC on mount ─────────────────────────────────
  useEffect(() => {
    const id = windowIdRef.current
    // If a previous instance of this tab pagehid'd into the archive,
    // pull its state back out before initWindow runs (initWindow would
    // otherwise overwrite the archived tabs with a default state).
    reclaimWindow(id)
    initWindow(id)
    gcStaleWindows()

    // Touch periodically to prevent GC while window is open
    const interval = setInterval(() => touchWindow(id), 5 * 60 * 1000) // every 5 min

    return () => clearInterval(interval)
  }, [reclaimWindow, initWindow, gcStaleWindows, touchWindow])

  // ── 2. BroadcastChannel listener ────────────────────────────────────
  useEffect(() => {
    const id = windowIdRef.current
    const channel = getNavigationChannel()

    const handler = (event: MessageEvent<NavigationBroadcast>) => {
      const msg = event.data
      if (!msg || !msg.type) return

      switch (msg.type) {
        case 'TAB_MOVED':
          // If this window is the source, remove the tab
          if (msg.sourceWindowId === id) {
            removeTabFromWindow(id, msg.tab.id)
          }
          // If this window is the target, add the tab
          if (msg.targetWindowId === id) {
            addTabToWindow(id, msg.tab)
          }
          break

        case 'WINDOW_CLOSED':
          // The closing tab self-archives via localStorage during its
          // pagehide handler. The `storage` event listener below
          // usually picks that change up, but cross-tab `storage`
          // delivery can be unreliable during browser unload — Chrome
          // in particular has been observed to occasionally not fire
          // it for writes from a closing tab. Treat the broadcast as a
          // second, redundant trigger to re-read localStorage.
          if (msg.windowId !== id) {
            syncFromLocalStorage()
          }
          break

        case 'STATE_SYNC':
          // Another window requests a fresh read — store already synced via
          // localStorage events; nothing else needed.
          break
      }
    }

    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  }, [removeTabFromWindow, addTabToWindow])

  // ── 2b. Cross-tab localStorage sync ─────────────────────────────────
  //
  // Zustand `persist` writes to localStorage on every action but never
  // reads back peer browser tabs' writes — each tab's in-memory store
  // stays at its mount-time snapshot otherwise, and a peer tab's
  // pagehide-archive into recentlyClosedWindows would never reach this
  // tab. The `storage` event fires only when *another* tab modifies
  // localStorage (not when this tab does), so writing back from inside
  // the handler can't loop on our own writes.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'modelibr_navigation') return
      syncFromLocalStorage()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── 3. pagehide → self-archive into recentlyClosedWindows ───────────
  //
  // `pagehide` fires on both refresh and close (with `event.persisted`
  // false for "truly discarded", true for bfcache). We archive ourselves
  // unconditionally on non-persisted unloads — that's the only way the
  // "last open window closes" case can survive, because there's no peer
  // tab to do the archive for us.
  //
  // Refresh isn't broken by this because the next mount will call
  // `reclaimWindow(id)` BEFORE `initWindow(id)`: when the same windowId
  // (preserved by sessionStorage) comes back, we pull our state out of
  // the archive and back into activeWindows. If the same windowId does
  // NOT come back (real close), the entry stays in recentlyClosedWindows
  // and shows up in the Sessions strip the next time any tab opens.
  useEffect(() => {
    const id = windowIdRef.current

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return
      // 1. Self-archive into recentlyClosedWindows via localStorage so
      //    the data survives even when nobody is listening.
      removeWindow(id)
      // 2. Broadcast a hint. Other tabs already get the `storage` event
      //    when we write above, but `storage` delivery during page
      //    unload has been observed to drop in Chromium; the broadcast
      //    is a redundant kick that makes the receiver re-read.
      broadcastNavigation({ type: 'WINDOW_CLOSED', windowId: id })
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [removeWindow])

  return windowId
}
