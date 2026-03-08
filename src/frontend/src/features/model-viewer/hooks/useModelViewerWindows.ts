import { useCallback, useState } from 'react'

type WindowName =
  | 'info'
  | 'thumbnail'
  | 'hierarchy'
  | 'settings'
  | 'uvMap'
  | 'textureSet'
  | 'version'

interface WindowVisibility {
  info: boolean
  thumbnail: boolean
  hierarchy: boolean
  settings: boolean
  uvMap: boolean
  textureSet: boolean
  version: boolean
}

export interface ModelViewerWindows {
  visibility: WindowVisibility
  toggle: (window: WindowName) => void
  close: (window: WindowName) => void
}

/**
 * Manages the visibility state of all floating windows in the ModelViewer.
 * Replaces 7 individual useState pairs with a single consolidated hook.
 */
export function useModelViewerWindows(): ModelViewerWindows {
  const [visibility, setVisibility] = useState<WindowVisibility>({
    info: false,
    thumbnail: false,
    hierarchy: false,
    settings: false,
    uvMap: false,
    textureSet: false,
    version: false,
  })

  const toggle = useCallback((window: WindowName) => {
    setVisibility(prev => ({ ...prev, [window]: !prev[window] }))
  }, [])

  const close = useCallback((window: WindowName) => {
    setVisibility(prev => ({ ...prev, [window]: false }))
  }, [])

  return { visibility, toggle, close }
}
