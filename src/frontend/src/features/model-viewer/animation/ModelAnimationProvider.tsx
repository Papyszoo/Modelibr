import { type ReactNode, useEffect, useRef } from 'react'

import { ModelAnimationContext } from './ModelAnimationContext'
import { ModelAnimationController } from './ModelAnimationController'

/**
 * Holds the one animation controller for a viewer session. It lives outside the
 * canvas so both the scene (which registers the loaded clone) and the DOM
 * panels (which drive playback) share it.
 */
export function ModelAnimationProvider({ children }: { children: ReactNode }) {
  const controllerRef = useRef<ModelAnimationController | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = new ModelAnimationController()
  }
  const controller = controllerRef.current

  useEffect(() => {
    return () => controller.dispose()
  }, [controller])

  return (
    <ModelAnimationContext.Provider value={controller}>
      {children}
    </ModelAnimationContext.Provider>
  )
}
