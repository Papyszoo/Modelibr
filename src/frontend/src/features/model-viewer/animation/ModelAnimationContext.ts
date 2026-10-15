import { createContext, useContext } from 'react'

import { type ModelAnimationController } from './ModelAnimationController'

/**
 * Shares the viewer's animation controller between the DOM panels and the
 * scene inside the canvas. Null when there is no viewer around (e.g. a model
 * info window opened on its own), so consumers degrade to rendering nothing.
 */
export const ModelAnimationContext =
  createContext<ModelAnimationController | null>(null)

export function useModelAnimationController(): ModelAnimationController | null {
  return useContext(ModelAnimationContext)
}
