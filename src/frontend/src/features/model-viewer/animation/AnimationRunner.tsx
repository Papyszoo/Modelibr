import { useFrame } from '@react-three/fiber'

import { useModelAnimationController } from './ModelAnimationContext'

/**
 * The single place the mixer is advanced. Rendered inside the Canvas so it can
 * hook `useFrame`; it renders nothing itself.
 */
export function AnimationRunner() {
  const controller = useModelAnimationController()

  useFrame((_, delta) => {
    controller?.update(delta)
  })

  return null
}
