import { useEffect, useRef } from 'react'
import {
  useNavigationStore,
  getWindowId,
  getNavigationChannel,
  broadcastNavigation,
  NavigationBroadcast,
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

        case 'STATE_SYNC':
          // Another window requests a fresh read — store already synced via
          // localStorage events; nothing else needed.
          break
      }
    }

    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  }, [removeTabFromWindow, addTabToWindow])

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
