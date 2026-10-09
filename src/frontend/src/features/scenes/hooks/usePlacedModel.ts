import { useEffect, useMemo, useRef } from 'react'
import type * as THREE from 'three'

import { cloneSkinnedModel } from '@/shared/three/cloneSkinnedModel'
import {
  applyParameterMaterials,
  type SlotMaterials,
} from '@/shared/three/parameterMaterial'
import {
  applyMaterialTextures,
  type MaterialTextureSets,
} from '@/shared/three/textureSetMaterial'

import {
  applyShapeKeyWeights,
  createSceneNodeAnimation,
  restoreRestPose,
  type SceneNodeAnimationRuntime,
  type SceneNodeClips,
} from '../lib/sceneNodeAnimation'
import type { SceneNode } from '../types'

export interface UsePlacedModelArgs {
  object: THREE.Object3D
  /** The clips the loaded model carries, for the node's `animation` to name. */
  clips?: SceneNodeClips
  animation?: SceneNode['animation']
  shapeKeys?: SceneNode['shapeKeys']
  materialTextureSets: MaterialTextureSets
  slotMaterials: SlotMaterials
  loadedTextures: Record<string, THREE.Texture | null>
  texturesReady: boolean
  /** The scene node's id; the one-time "clip not found" warning is keyed by it. */
  nodeId: string
}

export interface PlacedModel {
  /** The scene-local copy the node draws, rebuilt only when the load or dressing changes. */
  clone: THREE.Object3D
  /** The node's animation runtime, or null while the node renders static. */
  nodeAnimation: SceneNodeAnimationRuntime | null
}

/**
 * The clone + animation lifecycle for one placed node.
 *
 * Extracted from `PlacedObject` so the two hard rules about re-rendering - a
 * shape-key drag must not rebuild the node, and switching an animation off must
 * restore the rest pose - can be driven in tests without a WebGL canvas.
 *
 * - **A clone is expensive and its identity is the mixer's identity.** It is
 *   rebuilt only when the load or the dressing actually changes, never for a
 *   per-frame influence like a shape-key weight.
 * - **Removing an animation is not the same as never having had one.** The
 *   stopped mixer leaves its last pose on the clone, so the rest pose is
 *   restored in place rather than by cloning again.
 */
export function usePlacedModel({
  object,
  clips,
  animation,
  shapeKeys,
  materialTextureSets,
  slotMaterials,
  loadedTextures,
  texturesReady,
  nodeId,
}: UsePlacedModelArgs): PlacedModel {
  const clone = useMemo(() => {
    const copy = cloneSkinnedModel(object)
    copy.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    if (Object.keys(materialTextureSets).length > 0) {
      // Until the channels load this leaves the source materials in place, so a
      // node fades into its bound material rather than flashing untextured.
      applyMaterialTextures(
        copy,
        materialTextureSets,
        loadedTextures,
        texturesReady
      )
    }

    // After textures, so the two layer predictably on a node that uses both: a
    // tiling material on the frame, a colour on the cushions.
    applyParameterMaterials(copy, slotMaterials)

    return copy
  }, [
    object,
    materialTextureSets,
    slotMaterials,
    loadedTextures,
    texturesReady,
  ])

  // Shape keys are an influence on the clone, not part of what the clone *is*.
  // Applied here rather than in the clone memo so dragging a slider does not
  // clone the model again, rebuild its mixer and restart the clip on every
  // step. A playing clip still wins for the targets its own tracks carry,
  // because it writes those on each `useFrame` advance after this.
  useEffect(() => {
    applyShapeKeyWeights(clone, shapeKeys)
  }, [clone, shapeKeys])

  // One mixer per node clone: two instances of one rigged model are two
  // performances, and a mixer created on the shared loaded object would pose
  // both copies from whichever instance was set up last.
  const nodeAnimation = useMemo(
    () => createSceneNodeAnimation(clone, clips, animation, nodeId),
    [clone, clips, animation, nodeId]
  )

  // Stop the mixer with the clone it drives; a superseded clone must not keep
  // writing into bindings nothing shows any more.
  useEffect(
    () => () => {
      nodeAnimation?.mixer.stopAllAction()
    },
    [nodeAnimation]
  )

  // Read the latest weights without making the restore effect re-run on every
  // slider step (which would stop a playing clip through the cleanup above).
  const shapeKeysRef = useRef(shapeKeys)
  shapeKeysRef.current = shapeKeys

  // A clone that stops being animated keeps the last pose the clip wrote unless
  // it is reset. `nodeAnimation` reaching null from a live one is exactly that
  // moment - the node changed to no animation, or to a clip this model does not
  // carry - and the clone already on screen is reset in place.
  const previousRuntime = useRef<SceneNodeAnimationRuntime | null>(null)
  useEffect(() => {
    const wasAnimated = previousRuntime.current !== null
    previousRuntime.current = nodeAnimation
    if (wasAnimated && nodeAnimation === null) {
      restoreRestPose(clone, shapeKeysRef.current)
    }
  }, [clone, nodeAnimation])

  return { clone, nodeAnimation }
}
