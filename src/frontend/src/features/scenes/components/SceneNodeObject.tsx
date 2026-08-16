import { useLoader } from '@react-three/fiber'
import { type JSX, Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

import {
  createGltfResourceManager,
  safeLoadingManager,
} from '@/shared/three/safeLoadingManager'

import type { SceneAssetSource } from '../hooks/useSceneAssetSources'
import type { SceneNode, Vec3 } from '../types'
import { SceneNodeErrorBoundary } from './SceneNodeErrorBoundary'

/**
 * One node rendered in the scene.
 *
 * Everything this needs arrives as props. Nothing in here may use a React
 * context from the surrounding app - react-three-fiber renders the canvas
 * subtree through its own reconciler root, so the QueryClient and friends are
 * not reachable from inside it. Fetching happens in `useSceneAssetSources`,
 * outside `<Canvas>`.
 *
 * Loaded geometry is placed at the transform the document gives it and **not**
 * normalised. The model viewer deliberately scales every model to a consistent
 * preview size; doing that here would throw away the only thing a scene is
 * about - that a lamp post is four metres and a coffee cup is eight
 * centimetres, and that the server's overlap and scale checks were computed
 * against those numbers.
 */

interface SceneNodeObjectProps {
  node: SceneNode
  selected: boolean
  onSelect: (nodeId: string) => void
  /** Resolved file URL, format and glTF resources; undefined until they load. */
  source?: SceneAssetSource
  /**
   * The referenced asset's own extent and origin convention, from the server's
   * derived facts. Null when it has never been extracted - the selection box is
   * then omitted rather than drawn at a made-up size.
   */
  sourceDimensions?: Vec3 | null
  originConvention?: string | null
  /** Reports an asset that could not be loaded, so the editor can flag it. */
  onLoadError: (nodeId: string, message: string) => void
}

export function SceneNodeObject({
  node,
  selected,
  onSelect,
  source,
  sourceDimensions = null,
  originConvention = null,
  onLoadError,
}: SceneNodeObjectProps): JSX.Element | null {
  if (!node.visible) {
    return null
  }

  const { position, rotationEuler, scale } = node.transform

  return (
    <group
      position={[position.x, position.y, position.z]}
      rotation={[
        THREE.MathUtils.degToRad(rotationEuler.x),
        THREE.MathUtils.degToRad(rotationEuler.y),
        THREE.MathUtils.degToRad(rotationEuler.z),
      ]}
      scale={[scale.x, scale.y, scale.z]}
      onClick={event => {
        event.stopPropagation()
        onSelect(node.id)
      }}
    >
      {node.primitive ? (
        <ScenePrimitiveMesh node={node} />
      ) : (
        <SceneNodeErrorBoundary
          nodeId={node.id}
          onError={onLoadError}
          fallback={<FailedMarker bounds={sourceDimensions} />}
        >
          <Suspense fallback={<PendingMarker bounds={sourceDimensions} />}>
            <SceneAssetMesh source={source} bounds={sourceDimensions} />
          </Suspense>
        </SceneNodeErrorBoundary>
      )}
      {selected ? (
        <SelectionOutline
          bounds={node.primitive?.size ?? sourceDimensions}
          originConvention={node.primitive ? 'centered' : originConvention}
        />
      ) : null}
    </group>
  )
}

function ScenePrimitiveMesh({ node }: { node: SceneNode }): JSX.Element | null {
  const primitive = node.primitive
  if (!primitive) {
    return null
  }

  const size = primitive.size ?? { x: 1, y: 1, z: 1 }

  return (
    <mesh castShadow receiveShadow>
      {primitive.shape === 'box' ? (
        <boxGeometry args={[size.x, size.y, size.z]} />
      ) : primitive.shape === 'plane' ? (
        <planeGeometry args={[size.x, size.z]} />
      ) : primitive.shape === 'sphere' ? (
        <sphereGeometry args={[size.x / 2, 32, 16]} />
      ) : primitive.shape === 'cylinder' ? (
        <cylinderGeometry args={[size.x / 2, size.x / 2, size.y, 32]} />
      ) : (
        <coneGeometry args={[size.x / 2, size.y, 32]} />
      )}
      <meshStandardMaterial color="#8a8f98" roughness={0.8} metalness={0.05} />
    </mesh>
  )
}

/** Dispatches to the loader for the asset's format. Props only - see the note above. */
function SceneAssetMesh({
  source,
  bounds,
}: {
  source?: SceneAssetSource
  bounds: Vec3 | null
}): JSX.Element | null {
  if (!source || source.isLoading) {
    return <PendingMarker bounds={bounds} />
  }

  switch (source.extension) {
    case 'glb':
    case 'gltf':
      return <GltfMesh url={source.url} resources={source.resources} />
    case 'fbx':
      return <FbxMesh url={source.url} />
    case 'obj':
      return <ObjMesh url={source.url} />
    case 'stl':
      return <StlMesh url={source.url} />
    default:
      // A format the viewer cannot load is shown as its bounds rather than
      // dropped - a node missing from the canvas reads as a failed placement.
      return <PendingMarker bounds={bounds} />
  }
}

function GltfMesh({
  url,
  resources,
}: {
  url: string
  resources: Record<string, string>
}): JSX.Element {
  // A loose .gltf stores its buffers and textures as relative URIs. They resolve
  // against the version-file route, 404, and the loader then fails on the
  // missing .bin with no geometry to show. This map points them at the
  // auxiliary files the import stored.
  const manager = useMemo(
    () => createGltfResourceManager(resources),
    [resources]
  )
  const gltf = useLoader(GLTFLoader, url, loader => {
    loader.manager = manager
  })

  return <PlacedObject object={gltf.scene} />
}

function FbxMesh({ url }: { url: string }): JSX.Element {
  // The safe manager stops format-internal texture paths ("chest_Specular.tga")
  // from being fetched against the file route, which 400s and kills the context.
  const fbx = useLoader(FBXLoader, url, loader => {
    loader.manager = safeLoadingManager
  })
  return <PlacedObject object={fbx} />
}

function ObjMesh({ url }: { url: string }): JSX.Element {
  const obj = useLoader(OBJLoader, url, loader => {
    loader.manager = safeLoadingManager
  })
  return <PlacedObject object={obj} />
}

function StlMesh({ url }: { url: string }): JSX.Element {
  const geometry = useLoader(STLLoader, url)

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#b0b4bd" roughness={0.6} metalness={0.1} />
    </mesh>
  )
}

/**
 * Clones the loaded object so the same asset placed forty times along a street
 * does not share one mutable Object3D between every placement.
 */
function PlacedObject({ object }: { object: THREE.Object3D }): JSX.Element {
  const clone = useMemo(() => {
    const copy = object.clone(true)
    copy.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return copy
  }, [object])

  return <primitive object={clone} />
}

/** Placeholder sized to the asset's real bounds when they are known. */
function markerSize(bounds: Vec3 | null | undefined): [number, number, number] {
  return bounds ? [bounds.x, bounds.y, bounds.z] : [1, 1, 1]
}

/** Shown while an asset loads, and for formats the viewer cannot open. */
function PendingMarker({
  bounds,
}: {
  bounds: Vec3 | null | undefined
}): JSX.Element {
  return (
    <mesh>
      <boxGeometry args={markerSize(bounds)} />
      <meshBasicMaterial color="#4b5563" wireframe />
    </mesh>
  )
}

/**
 * Shown in place of an asset that failed to load. Occupying the node's real
 * bounds keeps the rest of the scene readable - a hole where a building should
 * be is more confusing than a marked-out one.
 */
function FailedMarker({
  bounds,
}: {
  bounds: Vec3 | null | undefined
}): JSX.Element {
  return (
    <mesh>
      <boxGeometry args={markerSize(bounds)} />
      <meshBasicMaterial color="#ef4444" wireframe />
    </mesh>
  )
}

/**
 * A wireframe box around the selected node, sized from the server's derived
 * bounds. Omitted entirely when those bounds are unknown: a unit cube drawn
 * around a lamp post would tell the user something false about its size.
 */
function SelectionOutline({
  bounds,
  originConvention,
}: {
  bounds: Vec3 | null | undefined
  originConvention: string | null
}): JSX.Element | null {
  if (!bounds) {
    return null
  }

  // Where the box sits relative to the node's origin, matching the server's
  // own reading: an unclassified origin is treated as centered, exactly as
  // SceneSpatial.OriginOffset does, so the outline and the overlap check
  // describe the same box.
  const center =
    originConvention === 'bottom-center'
      ? ([0, bounds.y / 2, 0] as const)
      : originConvention === 'corner'
        ? ([bounds.x / 2, bounds.y / 2, bounds.z / 2] as const)
        : ([0, 0, 0] as const)

  return (
    <mesh position={[center[0], center[1], center[2]]}>
      <boxGeometry args={[bounds.x * 1.02, bounds.y * 1.02, bounds.z * 1.02]} />
      <meshBasicMaterial color="#5b9dff" wireframe transparent opacity={0.8} />
    </mesh>
  )
}
