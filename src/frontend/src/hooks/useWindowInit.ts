import { useEffect, useRef } from 'react'

import {
  broadcastNavigation,
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
 * 2. Register the window in the Zustand store (creates default tabs on first visit).
 * 3. Listen for BroadcastChannel messages from other windows.
 * 4. On beforeunload → move the window state to recentlyClosedWindows.
 * 5. Run stale-window garbage collection on mount.
 */
export function useWindowInit(): string {
  const windowId = getWindowId()
  const windowIdRef = useRef(windowId)

  const initWindow = useNavigationStore(s => s.initWindow)
  const removeTabFromWindow = useNavigationStore(s => s.removeTabFromWindow)
  const addTabToWindow = useNavigationStore(s => s.addTabToWindow)
  const removeWindow = useNavigationStore(s => s.removeWindow)
  const gcStaleWindows = useNavigationStore(s => s.gcStaleWindows)
  const touchWindow = useNavigationStore(s => s.touchWindow)

  // ── 1. Init & GC on mount ───────────────────────────────────────────
  useEffect(() => {
    const id = windowIdRef.current
    initWindow(id)
    gcStaleWindows()

    // Touch periodically to prevent GC while window is open
    const interval = setInterval(() => touchWindow(id), 5 * 60 * 1000) // every 5 min

    return () => clearInterval(interval)
  }, [initWindow, gcStaleWindows, touchWindow])

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

        case 'WINDOW_CLOSED': {
          // Another window pagehid'd. `pagehide` fires on refresh too, not
          // just on close — if we archived immediately, refreshing a peer
          // tab would dump its state into our Sessions strip and the peer
          // would come back with default tabs. Defer the archive long
          // enough for any re-init storage event to land, then re-check
          // the peer's lastActiveAt: if it advanced, peer refreshed and we
          // skip; otherwise the peer is truly gone and we archive it.
          if (msg.windowId === id) break
          const closedId = msg.windowId
          const snapshotAt =
            useNavigationStore.getState().activeWindows[closedId]
              ?.lastActiveAt ?? null
          window.setTimeout(() => {
            // Re-read localStorage first — peer pages may have written
            // their `initWindow` entry that this tab's in-memory store
            // hasn't picked up yet (persist doesn't sync between tabs).
            // The storage-event listener below handles this in real time,
            // but the deferred check has to be defensive.
            void useNavigationStore.persist.rehydrate()
            const ws = useNavigationStore.getState().activeWindows[closedId]
            if (!ws) return
            // If snapshot was null (we didn't know about the peer at
            // broadcast time) but we do now: archive — we may have just
            // learned about its initial state. If the snapshot was
            // populated and lastActiveAt has advanced: it's a refresh,
            // skip.
            if (snapshotAt && ws.lastActiveAt !== snapshotAt) return
            removeWindow(closedId)
          }, 1500)
          break
        }

        case 'STATE_SYNC':
          // Another window requests a fresh read — store already synced via
          // localStorage events; nothing else needed.
          break
      }
    }

    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  }, [removeTabFromWindow, addTabToWindow, removeWindow])

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

  // ── 3. pagehide → archive window (only on actual tab close) ──────────
  // NOTE: We intentionally do NOT use 'beforeunload' here because it fires
  // on page refresh as well, which would archive the window state and
  // destroy tab persistence. The GC (STALE_WINDOW_MS = 24h) handles
  // cleaning up abandoned windows instead. We only archive on pagehide
  // when the page is being truly discarded (not entering bfcache).
  useEffect(() => {
    const id = windowIdRef.current

    const handlePageHide = (event: PageTransitionEvent) => {
      // event.persisted === true means the page MAY be restored from bfcache.
      // We skip cleanup in that case. For genuine closes, persisted is false,
      // but so is a normal refresh. Since we cannot distinguish close from
      // refresh, we let GC handle stale windows and only broadcast the event.
      if (!event.persisted) {
        broadcastNavigation({ type: 'WINDOW_CLOSED', windowId: id })
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [])

  return windowId
}
