import { useEffect, useRef } from 'react'

import {
  getNavigationChannel,
  getWindowId,
  type NavigationBroadcast,
  useNavigationStore,
} from '@/stores/navigationStore'

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
          // The closing tab archives itself on pagehide and the storage-
          // event listener below propagates that change to this tab. The
          // broadcast remains as a hint but doesn't need any action here.
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
  // Zustand `persist` writes to localStorage on every action but doesn't
  // pick up changes a peer browser tab makes. Without this listener, this
  // tab's in-memory `activeWindows` is forever a snapshot from mount and
  // we'd never learn that peer tab B exists — making the WINDOW_CLOSED
  // handler unable to archive it. The `storage` event fires only when
  // *another* tab modifies localStorage (not when this tab does), so
  // calling `rehydrate()` here doesn't loop on our own writes.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'modelibr_navigation') return
      void useNavigationStore.persist.rehydrate()
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
      removeWindow(id)
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [removeWindow])

  return windowId
}
