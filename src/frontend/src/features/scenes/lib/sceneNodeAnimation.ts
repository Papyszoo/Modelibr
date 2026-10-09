import * as THREE from 'three'

import type { SceneAnimation } from '../types'

/**
 * The per-node animation runtime for a cloned model scene.
 *
 * Extracted from `SceneNodeObject` so the mixer wiring - which is real three.js
 * behaviour, not JSX - can be driven in tests against the committed animated
 * fixtures. The component is then a thin wrapper: create the runtime on the
 * clone, call `advance` or `setTime` from `useFrame`.
 *
 * The two hard rules this file exists to keep:
 *
 * - **One mixer per node clone.** Two instances of one rigged model in a scene
 *   are two performances; a mixer created on the shared loaded object would
 *   drive both copies into the same pose.
 * - **Deterministic renders.** In the `?render=scene` bootstrap a mixer must
 *   not advance by the wall clock - the render page passes its own `t` and the
 *   node is posed at exactly that time (plus its configured start offset), so
 *   the same scene photographed twice is the same picture.
 */

/**
 * The clips a loaded model carries. glTF and FBX expose them on the loaded
 * object; OBJ and STL have none.
 */
export type SceneNodeClips = THREE.AnimationClip[] | undefined

/**
 * Missing clips already reported, keyed by source + clip name. A missing clip
 * is a data mismatch the caller fixes once - warning per node instance would
 * bury the console the first warning was meant to make readable.
 */
const warnedMissingClips = new Set<string>()

export interface SceneNodeAnimationRuntime {
  mixer: THREE.AnimationMixer
  action: THREE.AnimationAction
  /** Live clock: advance the clip by the real frame delta. */
  advance(deltaSeconds: number): void
  /**
   * Pose the clip at `seconds` after the configured `timeOffset`, independent
   * of how much real time passed between calls. `t = 0` is the timeOffset pose.
   */
  setTime(seconds: number): void
}

/**
 * Builds the animation for one cloned node.
 *
 * Returns null when the node declares no animation, or names a clip the model
 * does not carry - in that case the node renders static and the miss is
 * reported once (see `warnedMissingClips`). Never throws: an animation that
 * cannot be resolved must not take the whole node, and with it the scene,
 * down.
 */
export function createSceneNodeAnimation(
  root: THREE.Object3D,
  clips: SceneNodeClips,
  animation: SceneAnimation | null | undefined,
  warnKey: string
): SceneNodeAnimationRuntime | null {
  if (!animation) {
    return null
  }

  const clip = (clips ?? []).find(
    candidate => candidate.name === animation.clip
  )
  if (!clip) {
    const key = `${warnKey}::${animation.clip}`
    if (!warnedMissingClips.has(key)) {
      warnedMissingClips.add(key)
      console.warn(
        `Scene node animation: clip '${animation.clip}' is not on this model; the node renders static.`
      )
    }
    return null
  }

  const mixer = new THREE.AnimationMixer(root)
  const action = mixer.clipAction(clip)
  const loop = animation.loop ?? true
  const timeOffset = Math.max(animation.timeOffset ?? 0, 0)

  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
  // A clip that plays once and then releases its bindings snaps back to the
  // rest pose - which reads as the animation failing at the end. Hold the last
  // frame instead.
  action.clampWhenFinished = !loop
  action.setEffectiveTimeScale(animation.speed ?? 1)

  // Park the action at its offset before the first frame, so a still frame
  // that never gets an update already shows the pose the document asked for.
  action.time = timeOffset
  action.play()
  mixer.update(0)

  return {
    mixer,
    action,
    advance: delta => mixer.update(delta),
    setTime: seconds => {
      // Reset, re-park at the offset and evaluate once. `reset` also
      // re-activates an action a finished non-looping clip deactivated, so a
      // scrub back into the clip works instead of staying stuck at its end.
      action.reset()
      action.time = timeOffset
      action.play()
      mixer.update(Math.max(seconds, 0))
    },
  }
}

/**
 * Applies absolute shape-key weights to every mesh in a cloned scene, by the
 * model's own morph-target names.
 *
 * Weights are absolute, not offsets, and a name the model does not carry is
 * ignored rather than fatal: the document is allowed to describe a model more
 * completely than this particular mesh can be posed, and one stale name must
 * not blank the whole node.
 */
export function applyShapeKeyWeights(
  root: THREE.Object3D,
  weights: Record<string, number> | null | undefined
): void {
  if (!weights) {
    return
  }

  const entries = Object.entries(weights)
  if (entries.length === 0) {
    return
  }

  root.traverse(child => {
    const mesh = child as THREE.Mesh
    if (
      !mesh.isMesh ||
      !mesh.morphTargetDictionary ||
      !mesh.morphTargetInfluences
    ) {
      return
    }

    for (const [name, weight] of entries) {
      const index = mesh.morphTargetDictionary[name]
      if (index === undefined || index >= mesh.morphTargetInfluences.length) {
        continue
      }

      mesh.morphTargetInfluences[index] = Math.min(Math.max(weight, 0), 1)
    }
  })
}
