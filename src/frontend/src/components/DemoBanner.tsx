import './DemoBanner.css'

import { useCallback, useEffect, useState } from 'react'

const BANNER_HEIGHT = '32px'

const DEMO_LIMITATIONS = [
  'Blender Integration — .blend file uploads and model extraction',
  'SSL Certificate — HTTPS certificate management',
  'WebDAV — network drive connectivity for asset access',
  'Server-side Asset Processing — GPU-powered thumbnail rendering',
  'File Deduplication — hash-based storage optimization',
  'SignalR Real-time Updates — live processing status notifications',
]

export function DemoBanner(): JSX.Element {
  const [resetting, setResetting] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

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
    <>
      <div className="demo-banner" data-testid="demo-banner">
        <span className="demo-banner__text">
          Demo Mode — data is stored locally in your browser
        </span>
        <button
          className="demo-banner__action"
          onClick={() => setShowInfo(true)}
          data-testid="demo-banner-info"
        >
          ℹ Info
        </button>
        <button
          className="demo-banner__action"
          onClick={() => void handleReset()}
          disabled={resetting}
          data-testid="demo-banner-reset"
        >
          {resetting ? 'Resetting…' : '↺ Reset'}
        </button>
      </div>

      {showInfo && (
        <div
          className="demo-info-overlay"
          onClick={() => setShowInfo(false)}
          data-testid="demo-info-overlay"
        >
          <div
            className="demo-info-dialog"
            onClick={e => e.stopPropagation()}
            data-testid="demo-info-dialog"
          >
            <div className="demo-info-dialog__header">
              <h3>Demo Mode Limitations</h3>
              <button
                className="demo-info-dialog__close"
                onClick={() => setShowInfo(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="demo-info-dialog__description">
              The following features require a running Modelibr server and are
              not available in the browser-only demo:
            </p>
            <ul className="demo-info-dialog__list">
              {DEMO_LIMITATIONS.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
