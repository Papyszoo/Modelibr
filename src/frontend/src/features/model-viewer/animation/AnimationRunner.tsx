import { useFrame } from '@react-three/fiber'

import { useModelAnimationController } from './ModelAnimationContext'

/**
 * The single place the mixer is advanced. Rendered inside the Canvas so it can
 * hook `useFrame`; it renders nothing itself.
 */
export function AnimationRunner() {
  const controller = useModelAnimationController()

  useFrame((_, delta) => {
    // Clamped: R3F's clock delta is wall-clock, so a hidden tab or a long main-
    // thread stall hands the mixer one huge step. On a looping clip that wraps
    // it to an arbitrary phase; a clip advanced 30 s in one frame is not
    // playback. The cap keeps a resumed frame from skipping the animation.
    controller?.update(Math.min(delta, 0.1))
  })

  return null
}
