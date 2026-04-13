import './DemoBanner.css'

import { useCallback, useEffect, useState } from 'react'

const BANNER_HEIGHT = '32px'

export function DemoBanner(): JSX.Element {
  const [resetting, setResetting] = useState(false)

  // Publish banner height so the layout can shrink to avoid overlap
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--demo-banner-height',
      BANNER_HEIGHT
    )
    return () => {
      document.documentElement.style.removeProperty('--demo-banner-height')
    }
  }, [])

  const handleReset = useCallback(async () => {
    if (resetting) return
    setResetting(true)
    try {
      // Close the IDB connection so deleteDatabase isn't blocked
      const { closeDb } = await import('@/mocks/db/demoDb')
      await closeDb()

      // Delete the demo IndexedDB
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('modelibr-demo')
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
        req.onblocked = () => resolve() // best effort
      })

      // Clear web storage
      localStorage.clear()
      sessionStorage.clear()

      // Reload the page to re-seed fresh demo data
      window.location.reload()
    } catch {
      setResetting(false)
    }
  }, [resetting])

  return (
    <div className="demo-banner" data-testid="demo-banner">
      <span className="demo-banner__text">
        Demo Mode — data is stored locally in your browser
      </span>
      <button
        className="demo-banner__reset"
        onClick={() => void handleReset()}
        disabled={resetting}
        data-testid="demo-banner-reset"
      >
        {resetting ? 'Resetting…' : 'Reset'}
      </button>
    </div>
  )
}
