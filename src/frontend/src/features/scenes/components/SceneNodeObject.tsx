import { useLoader } from '@react-three/fiber'
import { type JSX, Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

import { useModelByIdQuery } from '@/features/model-viewer/api/queries'
import { getFileExtension } from '@/utils/fileUtils'

import { getSceneNodeFileUrl } from '../api/scenesApi'
import type { SceneNode, Vec3 } from '../types'

/**
 * One node rendered in the scene.
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
  /**
   * The referenced asset's own extent and origin convention, from the server's
   * derived facts. Null when it has never been extracted - the selection box is
   * then omitted rather than drawn at a made-up size.
   */
  sourceDimensions?: Vec3 | null
  originConvention?: string | null
}

export function SceneNodeObject({
  node,
  selected,
  onSelect,
  sourceDimensions = null,
  originConvention = null,
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
        <Suspense fallback={<PendingMarker />}>
          <SceneAssetMesh node={node} />
        </Suspense>
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

/**
 * Resolves the pinned version's file and hands it to the loader for its format.
 *
 * The format comes from the model's renderable file rather than being guessed
 * from the URL: the version-file endpoint serves bytes at a path that carries
 * no extension.
 */
function SceneAssetMesh({ node }: { node: SceneNode }): JSX.Element | null {
  const asset = node.asset
  const { data: model } = useModelByIdQuery({
    modelId: String(asset?.assetId ?? ''),
    queryConfig: { enabled: Boolean(asset) },
  })

  if (!asset || asset.versionId == null || !model) {
    return null
  }

  const renderable =
    model.files?.find(file => file.isRenderable) ?? model.files?.[0]
  if (!renderable) {
    return null
  }

  const extension = getFileExtension(renderable.originalFileName)
  const url = getSceneNodeFileUrl(asset.assetId, asset.versionId)

  switch (extension) {
    case 'glb':
    case 'gltf':
      return <GltfMesh url={url} />
    case 'fbx':
      return <FbxMesh url={url} />
    case 'obj':
      return <ObjMesh url={url} />
    case 'stl':
      return <StlMesh url={url} />
    default:
      // A format the viewer cannot load is shown as its bounds rather than
      // dropped - a node missing from the canvas reads as a failed placement.
      return <PendingMarker />
  }
}

function GltfMesh({ url }: { url: string }): JSX.Element {
  const gltf = useLoader(GLTFLoader, url)
  return <PlacedObject object={gltf.scene} />
}

function FbxMesh({ url }: { url: string }): JSX.Element {
  const fbx = useLoader(FBXLoader, url)
  return <PlacedObject object={fbx} />
}

function ObjMesh({ url }: { url: string }): JSX.Element {
  const obj = useLoader(OBJLoader, url)
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

/** Shown while an asset loads, and for formats the viewer cannot open. */
function PendingMarker(): JSX.Element {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#4b5563" wireframe />
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
