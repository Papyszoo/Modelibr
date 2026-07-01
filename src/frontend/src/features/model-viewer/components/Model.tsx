import { Box } from '@react-three/drei'
import { useFrame, useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import { safeLoadingManager } from '@/shared/three/safeLoadingManager'
import { THREEJS_SUPPORTED_FORMATS } from '@/utils/fileUtils'

import { buildStlModel } from '../../../../../asset-processor/lib/stlMesh.js'

/**
 * Shared presentation logic for every loader: rotate, clone, optionally
 * override materials, scale to a consistent size and sit the model on the
 * floor. Each per-format component calls its own loader hook (so React's
 * rules of hooks are respected) and hands the resulting Object3D here.
 */
function useRenderedModel(
  model: THREE.Object3D | undefined | null,
  rotationSpeed: number,
  preserveMaterials: boolean
) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)

  // Rotate the model with configurable speed
  useFrame(() => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
  })

  // Reset the scaled flag when the model changes
  useEffect(() => {
    scaledRef.current = false
  }, [model])

  useEffect(() => {
    if (model && !scaledRef.current) {
      // Clone the model to prevent scene conflicts when same model is used in multiple panels
      const clonedModel = model.clone()

      // Apply a basic TSL-style material with enhanced properties
      clonedModel.traverse(child => {
        if (child.isMesh) {
          if (!preserveMaterials) {
            child.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color(0.7, 0.7, 0.9),
              metalness: 0.3,
              roughness: 0.4,
              envMapIntensity: 1.0,
            })
          }
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      // Calculate bounding box and scale the model to consistent size
      const box = new THREE.Box3().setFromObject(clonedModel)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 2 / maxDim

      // Scale the model first
      // Multiply, don't replace: some loaders (notably FBX) bake a non-1
      // unit-conversion scale into the root. setScalar would drop that and
      // shrink the model to ~1/100 of intended size.
      clonedModel.scale.multiplyScalar(scale)

      // Recalculate bounding box after scaling
      const scaledBox = new THREE.Box3().setFromObject(clonedModel)
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3())

      // Position model so it's centered in X and Z, but bottom is at y=0 (floor level)
      // Subtract (not assign): FBX bakes a non-zero translation into the root,
      // and overwriting it would offset the model from the camera target.
      clonedModel.position.x -= scaledCenter.x
      clonedModel.position.z -= scaledCenter.z
      clonedModel.position.y -= scaledBox.min.y

      // Store the cloned model in the ref
      if (meshRef.current) {
        // Clear previous children
        meshRef.current.clear()
        // Add cloned model
        meshRef.current.add(clonedModel)
      }

      scaledRef.current = true
    }
  }, [model, preserveMaterials])

  useEffect(() => {
    if (model) {
      setModelObject(model)
    }
    return () => setModelObject(null)
  }, [model, setModelObject])

  return meshRef
}

// Separate components for each model type to avoid conditional hooks
function OBJModel({
  modelUrl,
  rotationSpeed,
  preserveMaterials = false,
}: {
  modelUrl: string
  rotationSpeed: number
  preserveMaterials?: boolean
}) {
  const model = useLoader(OBJLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  const meshRef = useRenderedModel(model, rotationSpeed, preserveMaterials)

  return <group ref={meshRef} />
}

function GLTFModel({
  modelUrl,
  rotationSpeed,
  preserveMaterials = false,
}: {
  modelUrl: string
  rotationSpeed: number
  preserveMaterials?: boolean
}) {
  const gltf = useLoader(GLTFLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  const meshRef = useRenderedModel(
    gltf?.scene,
    rotationSpeed,
    preserveMaterials
  )

  return <group ref={meshRef} />
}

function FBXModel({
  modelUrl,
  rotationSpeed,
  preserveMaterials = false,
}: {
  modelUrl: string
  rotationSpeed: number
  preserveMaterials?: boolean
}) {
  const model = useLoader(FBXLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  const meshRef = useRenderedModel(model, rotationSpeed, preserveMaterials)

  return <group ref={meshRef} />
}

// STLLoader returns raw BufferGeometry (no scene graph, no materials), so wrap
// it in a Mesh + Group before handing it to the shared rendering logic.
function STLModel({
  modelUrl,
  rotationSpeed,
  preserveMaterials = false,
}: {
  modelUrl: string
  rotationSpeed: number
  preserveMaterials?: boolean
}) {
  const geometry = useLoader(STLLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  // Shared builder (also used by the worker thumbnail) wraps the raw geometry
  // and surfaces any binary-STL vertex colors. The material only survives in
  // "Embedded" mode — the default path overrides it in useRenderedModel.
  const model = useMemo(() => buildStlModel(THREE, geometry), [geometry])
  const meshRef = useRenderedModel(model, rotationSpeed, preserveMaterials)

  return <group ref={meshRef} />
}

function ThreeMFModel({
  modelUrl,
  rotationSpeed,
  preserveMaterials = false,
}: {
  modelUrl: string
  rotationSpeed: number
  preserveMaterials?: boolean
}) {
  const model = useLoader(ThreeMFLoader, modelUrl, loader => {
    loader.manager = safeLoadingManager
  })
  const meshRef = useRenderedModel(model, rotationSpeed, preserveMaterials)

  return <group ref={meshRef} />
}

function PlaceholderModel({ rotationSpeed }: { rotationSpeed: number }) {
  const meshRef = useRef()

  // Rotate the model with configurable speed
  useFrame(() => {
    if (meshRef.current && rotationSpeed > 0) {
      meshRef.current.rotation.y += rotationSpeed
    }
  })

  return (
    <Box ref={meshRef} args={[1, 1, 1]}>
      <meshStandardMaterial
        color="#8B5CF6"
        metalness={0.5}
        roughness={0.2}
        envMapIntensity={1.0}
      />
    </Box>
  )
}

// Derive the dotless extension list from the single source of truth so adding a
// loader (e.g. stl/3mf) in fileUtils automatically keeps this dispatch in sync.
const KNOWN_FORMATS = THREEJS_SUPPORTED_FORMATS.map(ext => ext.slice(1))

export function Model({
  modelUrl,
  fileExtension,
  rotationSpeed = 0.002,
  preserveMaterials = false,
}: {
  modelUrl: string
  fileExtension: string
  rotationSpeed?: number
  preserveMaterials?: boolean
}) {
  return (
    <Suspense fallback={<LoadingPlaceholder />}>
      {fileExtension === 'obj' && (
        <OBJModel
          modelUrl={modelUrl}
          rotationSpeed={rotationSpeed}
          preserveMaterials={preserveMaterials}
        />
      )}
      {fileExtension === 'fbx' && (
        <FBXModel
          modelUrl={modelUrl}
          rotationSpeed={rotationSpeed}
          preserveMaterials={preserveMaterials}
        />
      )}
      {(fileExtension === 'gltf' || fileExtension === 'glb') && (
        <GLTFModel
          modelUrl={modelUrl}
          rotationSpeed={rotationSpeed}
          preserveMaterials={preserveMaterials}
        />
      )}
      {fileExtension === 'stl' && (
        <STLModel
          modelUrl={modelUrl}
          rotationSpeed={rotationSpeed}
          preserveMaterials={preserveMaterials}
        />
      )}
      {fileExtension === '3mf' && (
        <ThreeMFModel
          modelUrl={modelUrl}
          rotationSpeed={rotationSpeed}
          preserveMaterials={preserveMaterials}
        />
      )}
      {!KNOWN_FORMATS.includes(fileExtension) && (
        <PlaceholderModel rotationSpeed={rotationSpeed} />
      )}
    </Suspense>
  )
}
