import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

import { useModelAnimationController } from '@/features/model-viewer/animation/ModelAnimationContext'
import { type ModelAnimationController } from '@/features/model-viewer/animation/ModelAnimationController'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import { cloneSkinnedModel } from '@/shared/three/cloneSkinnedModel'
import { disposeClonedMaterials } from '@/shared/three/disposeClonedMaterials'
import { advanceMaterialEffects } from '@/shared/three/materialEffects'
import {
  createResourceManager,
  safeLoadingManager,
} from '@/shared/three/safeLoadingManager'
import {
  applyMaterialTextures,
  type MaterialTextureSets,
  usePerMaterialTextures,
} from '@/shared/three/textureSetMaterial'

import { buildStlModel } from '../../../../../asset-processor/lib/stlMesh.js'

export type { MaterialTextureSets } from '@/shared/three/textureSetMaterial'

// Stable empty clip list for formats that never carry animation, so it can sit
// in a dependency array without retriggering the clone effect every render.
const NO_ANIMATIONS: THREE.AnimationClip[] = []

interface TexturedModelProps {
  modelUrl: string
  fileExtension: string
  rotationSpeed: number
  materialTextureSets: MaterialTextureSets
  /** Relative-path -> URL map for a multi-file glTF's external resources. */
  resources?: Record<string, string>
}

// Shared props for per-format components
interface FormatComponentProps {
  modelUrl: string
  rotationSpeed: number
  materialTextureSets: MaterialTextureSets
  resources?: Record<string, string>
}

/**
 * Shared logic: clone model, apply per-material textures, scale and center
 */
function setupModel(
  model: THREE.Group | THREE.Object3D,
  animations: THREE.AnimationClip[] | undefined,
  materialTextureSets: MaterialTextureSets,
  loadedTextures: Record<string, THREE.Texture | null>,
  texturesReady: boolean,
  meshRef: React.RefObject<THREE.Group | null>,
  scaledRef: React.MutableRefObject<boolean>,
  animation: ModelAnimationController | null
) {
  if (!model || scaledRef.current) return

  const clonedModel = cloneSkinnedModel(model)

  applyMaterialTextures(
    clonedModel,
    materialTextureSets,
    loadedTextures,
    texturesReady
  )

  // Scale and position
  const box = new THREE.Box3().setFromObject(clonedModel)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const scale = 2 / maxDim

  // Multiply, don't replace: FBX bakes a non-1 unit-conversion scale into
  // the root and setScalar would drop it, collapsing the model.
  clonedModel.scale.multiplyScalar(scale)

  const scaledBox = new THREE.Box3().setFromObject(clonedModel)
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3())

  // Subtract (not assign): FBX bakes a non-zero translation into the root,
  // and overwriting it would offset the model from the camera target.
  clonedModel.position.x -= scaledCenter.x
  clonedModel.position.z -= scaledCenter.z
  clonedModel.position.y -= scaledBox.min.y

  if (meshRef.current) {
    disposeClonedMaterials(meshRef.current, model)
    meshRef.current.clear()
    meshRef.current.add(clonedModel)
  }

  // Hand the rendered clone (not the cached original) to the animation
  // controller so its single mixer drives exactly what is on screen.
  animation?.setRoot(clonedModel, animations)

  scaledRef.current = true
}

// OBJ Model with per-material textures
function OBJModelWithTextures({
  modelUrl,
  rotationSpeed,
  materialTextureSets,
}: FormatComponentProps) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)
  const { gl: renderer } = useThree()

  useFrame(state => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
    // Material effects run on any material in the clone that has them
    // installed; without effects this is a cheap traversal.
    if (meshRef.current) {
      advanceMaterialEffects(meshRef.current, state.clock.elapsedTime)
    }
  })

  const model = useLoader(OBJLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  const animation = useModelAnimationController()
  const animations = NO_ANIMATIONS
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    true
  )

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, materialTextureSets, texturesReady])

  useEffect(() => {
    setupModel(
      model,
      animations,
      materialTextureSets,
      loadedTextures,
      texturesReady,
      meshRef,
      scaledRef,
      animation
    )
  }, [
    model,
    animations,
    materialTextureSets,
    loadedTextures,
    texturesReady,
    animation,
  ])

  useEffect(() => {
    if (model) setModelObject(model)
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

// GLTF Model with per-material textures
function GLTFModelWithTextures({
  modelUrl,
  rotationSpeed,
  materialTextureSets,
  resources,
}: FormatComponentProps) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)
  const { gl: renderer } = useThree()

  useFrame(state => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
    // Material effects run on any material in the clone that has them
    // installed; without effects this is a cheap traversal.
    if (meshRef.current) {
      advanceMaterialEffects(meshRef.current, state.clock.elapsedTime)
    }
  })

  // See Model.tsx: a loose .gltf's relative buffer/texture URIs must resolve to the
  // version's auxiliary files, otherwise it loads as an empty scene.
  const manager = useMemo(() => createResourceManager(resources), [resources])
  const gltf = useLoader(GLTFLoader, modelUrl, loader => {
    loader.manager = manager
  })
  const model = gltf?.scene
  const animation = useModelAnimationController()
  const animations = gltf?.animations
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    false
  )

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, materialTextureSets, texturesReady])

  useEffect(() => {
    if (model)
      setupModel(
        model,
        animations,
        materialTextureSets,
        loadedTextures,
        texturesReady,
        meshRef,
        scaledRef,
        animation
      )
  }, [
    model,
    animations,
    materialTextureSets,
    loadedTextures,
    texturesReady,
    animation,
  ])

  useEffect(() => {
    if (model) setModelObject(model)
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

// FBX Model with per-material textures
function FBXModelWithTextures({
  modelUrl,
  rotationSpeed,
  materialTextureSets,
}: FormatComponentProps) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)
  const { gl: renderer } = useThree()

  useFrame(state => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
    // Material effects run on any material in the clone that has them
    // installed; without effects this is a cheap traversal.
    if (meshRef.current) {
      advanceMaterialEffects(meshRef.current, state.clock.elapsedTime)
    }
  })

  const model = useLoader(FBXLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  const animation = useModelAnimationController()
  const animations = model?.animations
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    true
  )

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, materialTextureSets, texturesReady])

  useEffect(() => {
    setupModel(
      model,
      animations,
      materialTextureSets,
      loadedTextures,
      texturesReady,
      meshRef,
      scaledRef,
      animation
    )
  }, [
    model,
    animations,
    materialTextureSets,
    loadedTextures,
    texturesReady,
    animation,
  ])

  useEffect(() => {
    if (model) setModelObject(model)
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

// STL Model with per-material textures. STLLoader returns raw BufferGeometry,
// so wrap it in a Mesh + Group before the shared setup applies textures.
function STLModelWithTextures({
  modelUrl,
  rotationSpeed,
  materialTextureSets,
}: FormatComponentProps) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)
  const { gl: renderer } = useThree()

  useFrame(state => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
    // Material effects run on any material in the clone that has them
    // installed; without effects this is a cheap traversal.
    if (meshRef.current) {
      advanceMaterialEffects(meshRef.current, state.clock.elapsedTime)
    }
  })

  const geometry = useLoader(STLLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  // Shared wrap; setupModel's per-material textures replace this material.
  const model = useMemo(() => buildStlModel(THREE, geometry), [geometry])
  const animation = useModelAnimationController()
  const animations = NO_ANIMATIONS
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    true
  )

  useEffect(() => {
    scaledRef.current = false
  }, [model, materialTextureSets, texturesReady])

  useEffect(() => {
    setupModel(
      model,
      animations,
      materialTextureSets,
      loadedTextures,
      texturesReady,
      meshRef,
      scaledRef,
      animation
    )
  }, [
    model,
    animations,
    materialTextureSets,
    loadedTextures,
    texturesReady,
    animation,
  ])

  useEffect(() => {
    if (model) setModelObject(model)
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

// 3MF Model with per-material textures
function ThreeMFModelWithTextures({
  modelUrl,
  rotationSpeed,
  materialTextureSets,
}: FormatComponentProps) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)
  const { gl: renderer } = useThree()

  useFrame(state => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
    // Material effects run on any material in the clone that has them
    // installed; without effects this is a cheap traversal.
    if (meshRef.current) {
      advanceMaterialEffects(meshRef.current, state.clock.elapsedTime)
    }
  })

  const model = useLoader(ThreeMFLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  const animation = useModelAnimationController()
  const animations = NO_ANIMATIONS
  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    true
  )

  useEffect(() => {
    scaledRef.current = false
  }, [modelUrl, materialTextureSets, texturesReady])

  useEffect(() => {
    setupModel(
      model,
      animations,
      materialTextureSets,
      loadedTextures,
      texturesReady,
      meshRef,
      scaledRef,
      animation
    )
  }, [
    model,
    animations,
    materialTextureSets,
    loadedTextures,
    texturesReady,
    animation,
  ])

  useEffect(() => {
    if (model) setModelObject(model)
    return () => setModelObject(null)
  }, [model, setModelObject])

  return <group ref={meshRef} />
}

export function TexturedModel({
  modelUrl,
  fileExtension,
  rotationSpeed,
  materialTextureSets,
  resources,
}: TexturedModelProps) {
  if (fileExtension === 'obj') {
    return (
      <OBJModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  if (fileExtension === 'fbx') {
    return (
      <FBXModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  if (fileExtension === 'gltf' || fileExtension === 'glb') {
    return (
      <GLTFModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
        resources={resources}
      />
    )
  }
  if (fileExtension === 'stl') {
    return (
      <STLModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  if (fileExtension === '3mf') {
    return (
      <ThreeMFModelWithTextures
        modelUrl={modelUrl}
        rotationSpeed={rotationSpeed}
        materialTextureSets={materialTextureSets}
      />
    )
  }
  return null
}
