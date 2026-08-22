import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import type { SceneViewportQuality } from '../hooks/useSceneViewportQuality'
import {
  rankSceneResources,
  type SceneResourceCandidate,
} from '../lib/sceneResourcePriority'

interface SceneResourcePriorityProbeProps {
  candidates: SceneResourceCandidate[]
  qualityState: SceneViewportQuality
  onRank: (orderedKeys: string[]) => void
}

/**
 * Reads the camera the only place it can be read - inside the Canvas - and reports the
 * order the remaining resources should load in.
 *
 * Deliberately not a per-frame subscription. Ranking every frame would put sorting work
 * on the render loop this feature exists to protect, and the order only matters at the
 * moment the queue promotes something. Recomputing when the placement set changes and
 * when the camera stops moving covers both, and while the camera *is* moving promotions
 * are paused anyway.
 */
export function SceneResourcePriorityProbe({
  candidates,
  qualityState,
  onRank,
}: SceneResourcePriorityProbeProps): null {
  const camera = useThree(state => state.camera)

  useEffect(() => {
    if (qualityState === 'moving') {
      return
    }

    camera.updateMatrixWorld()
    onRank(rankSceneResources(candidates, camera))
  }, [camera, candidates, onRank, qualityState])

  return null
}
