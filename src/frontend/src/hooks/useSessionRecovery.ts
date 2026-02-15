import { useCallback } from 'react'
import { useNavigationStore, getWindowId } from '@/stores/navigationStore'

/**
 * Hook that exposes session recovery capabilities.
 * Returns the list of recently closed windows and a function to restore one.
 */
export function useSessionRecovery() {
  const recentlyClosedWindows = useNavigationStore(s => s.recentlyClosedWindows)
  const restoreWindowAction = useNavigationStore(s => s.restoreWindow)

  const restoreWindow = useCallback(
    (index: number) => {
      const windowId = getWindowId()
      restoreWindowAction(index, windowId)
    },
    [restoreWindowAction]
  )

  return {
    recentlyClosedWindows,
    restoreWindow,
  }
}
