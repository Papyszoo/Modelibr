import { useLoader, useThree } from '@react-three/fiber'
import { type JSX, Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

import { applyParameterMaterials } from '@/shared/three/parameterMaterial'
import {
  createGltfResourceManager,
  safeLoadingManager,
} from '@/shared/three/safeLoadingManager'
import {
  applyMaterialTextures,
  type MaterialTextureSets,
  usePerMaterialTextures,
} from '@/shared/three/textureSetMaterial'

import type { SceneAssetSource } from '../hooks/useSceneAssetSources'
import type { NodeDressing } from '../hooks/useSceneMaterials'
import { boundsOffset } from '../lib/sceneGeometry'
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
 *
 * A node's `material` binding overrides the source model's own materials, using
 * the same pipeline the model viewer and the worker's thumbnail render use, so
 * one texture set looks the same everywhere it is shown. Without it the canvas
 * drew the source model's original materials no matter what the document said,
 * and a scene an agent had dressed with `apply_material` looked nothing like
 * the scene that had been saved.
 */

interface SceneNodeObjectProps {
  node: SceneNode
  selected: boolean
  onSelect: (nodeId: string) => void
  /** Resolved file URL, format and glTF resources; undefined until they load. */
  source?: SceneAssetSource
  /** Everything dressing this node - texture sets and materials, by slot. */
  dressing?: NodeDressing
  /**
   * The referenced asset's own extent and origin convention, from the server's
   * derived facts. Null when it has never been extracted - the selection box is
   * then omitted rather than drawn at a made-up size.
   */
  sourceDimensions?: Vec3 | null
  originConvention?: string | null
  /** The measured origin fraction behind that convention; see `SceneNodeView`. */
  originInBounds?: Vec3 | null
  /**
   * Draw this node as its bounding volume instead of its mesh.
   *
   * Composition is judged on volumes, not on meshes: an object floating half its
   * height is glaring in a grey blockout and easy to miss in a lit, textured
   * render. It also costs nothing to draw - no mesh is loaded at all - which is
   * what makes a heavy scene navigable while it is still being laid out.
   */
  blockout?: boolean
  /** Reports an asset that could not be loaded, so the editor can flag it. */
  onLoadError: (nodeId: string, message: string) => void
  /**
   * Reports that this node has stopped loading, either way. The editor does not
   * need it - it draws a pending marker and lets the user watch. A headless
   * render does: it has to know when the scene is finished before it screenshots,
   * and "finished" includes the nodes that failed. Optional so the editor path
   * is unchanged.
   */
  onLoadSettled?: (nodeId: string, loaded: boolean) => void
}

export function SceneNodeObject({
  node,
  selected,
  onSelect,
  source,
  dressing,
  sourceDimensions = null,
  originConvention = null,
  originInBounds = null,
  blockout = false,
  onLoadError,
  onLoadSettled,
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
      {blockout ? (
        <>
          <BlockoutVolume
            bounds={node.primitive?.size ?? sourceDimensions}
            originConvention={node.primitive ? 'centered' : originConvention}
            originInBounds={node.primitive ? null : originInBounds}
          />
          {/* Nothing is loaded in blockout mode, so the node is already settled. */}
          <SettleSignal nodeId={node.id} loaded onSettled={onLoadSettled} />
        </>
      ) : node.primitive ? (
        <>
          <ScenePrimitiveMesh node={node} />
          {/* Geometry we build ourselves; there is nothing to wait for. */}
          <SettleSignal nodeId={node.id} loaded onSettled={onLoadSettled} />
        </>
      ) : (
        <SceneNodeErrorBoundary
          nodeId={node.id}
          resetKey={sourceLoadKey(source)}
          onError={(nodeId, message) => {
            onLoadError(nodeId, message)
            onLoadSettled?.(nodeId, false)
          }}
          onReset={() => clearCachedLoad(source)}
          fallback={<FailedMarker bounds={sourceDimensions} />}
        >
          <Suspense fallback={<PendingMarker bounds={sourceDimensions} />}>
            <SceneAssetMesh
              source={source}
              bounds={sourceDimensions}
              dressing={dressing}
            />
            {/*
              Inside the boundary on purpose: React commits a Suspense
              boundary's children together, so this effect cannot run until
              the mesh beside it has actually resolved. Gated on the source
              being present and done, because `SceneAssetMesh` returns a
              pending marker rather than suspending while the resource map is
              still on its way - without the guard a loose glTF would report
              itself settled one render before its `.bin` arrived.
            */}
            {source && !source.isLoading ? (
              <SettleSignal nodeId={node.id} loaded onSettled={onLoadSettled} />
            ) : null}
          </Suspense>
        </SceneNodeErrorBoundary>
      )}
      {selected ? (
        <SelectionOutline
          bounds={node.primitive?.size ?? sourceDimensions}
          originConvention={node.primitive ? 'centered' : originConvention}
          // Primitives are authored centered, like three.js builds them - the
          // same exception the server makes in SceneSpatial.Footprint.
          originInBounds={node.primitive ? null : originInBounds}
        />
      ) : null}
    </group>
  )
}

/**
 * Reports its node as settled, once, when it mounts. Renders nothing.
 *
 * A component rather than an effect in `SceneNodeObject` because *where* it sits
 * in the tree is the whole mechanism: mounted inside the Suspense boundary, it
 * cannot run before the geometry next to it has resolved.
 */
function SettleSignal({
  nodeId,
  loaded,
  onSettled,
}: {
  nodeId: string
  loaded: boolean
  onSettled?: (nodeId: string, loaded: boolean) => void
}): null {
  useEffect(() => {
    onSettled?.(nodeId, loaded)
  }, [nodeId, loaded, onSettled])

  return null
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
 * What this node is currently loading: the file, and the resources it resolves
 * against. A loose glTF that failed with no resource map is a different load
 * from the same file once its map has arrived, and the boundary uses that to
 * decide a retry is worth making.
 */
function sourceLoadKey(source?: SceneAssetSource): string {
  if (!source) {
    return ''
  }

  return `${source.url}|${Object.keys(source.resources).sort().join(',')}`
}

/**
 * Drops a cached load failure so a retry actually reaches the network.
 * `useLoader` caches by URL and caches rejections too, so without this a node
 * that failed once is served the same error for the life of the page.
 */
function clearCachedLoad(source?: SceneAssetSource): void {
  if (!source || source.kind !== 'mesh') {
    return
  }

  const loader = MESH_LOADERS[source.extension]
  if (loader) {
    useLoader.clear(loader, source.url)
  }
}

const MESH_LOADERS: Record<string, LoaderConstructor | undefined> = {
  glb: GLTFLoader,
  gltf: GLTFLoader,
  fbx: FBXLoader,
  obj: OBJLoader,
  stl: STLLoader,
}

type LoaderConstructor =
  | typeof GLTFLoader
  | typeof FBXLoader
  | typeof OBJLoader
  | typeof STLLoader

/** Dispatches to the loader for the asset's format. Props only - see the note above. */
function SceneAssetMesh({
  source,
  bounds,
  dressing,
}: {
  source?: SceneAssetSource
  bounds: Vec3 | null
  dressing?: NodeDressing
}): JSX.Element | null {
  if (!source || source.isLoading) {
    return <PendingMarker bounds={bounds} />
  }

  // A sprite or an environment map is one picture, not geometry: it is drawn as
  // a plane at the node's transform rather than pushed through a mesh loader
  // that would reach it as image bytes and fail to parse.
  if (source.kind === 'image') {
    return <ImagePlane url={source.url} bounds={bounds} />
  }

  switch (source.extension) {
    case 'glb':
    case 'gltf':
      return (
        <GltfMesh
          url={source.url}
          resources={source.resources}
          dressing={dressing}
        />
      )
    case 'fbx':
      return <FbxMesh url={source.url} dressing={dressing} />
    case 'obj':
      return <ObjMesh url={source.url} dressing={dressing} />
    case 'stl':
      return <StlMesh url={source.url} dressing={dressing} />
    default:
      // A format the viewer cannot load is shown as its bounds rather than
      // dropped - a node missing from the canvas reads as a failed placement.
      return <PendingMarker bounds={bounds} />
  }
}

function GltfMesh({
  url,
  resources,
  dressing,
}: {
  url: string
  resources: Record<string, string>
  dressing?: NodeDressing
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

  // flipY=false for glTF, matching the model viewer: glTF authors its UVs the
  // other way up, and getting this wrong turns every bound texture upside down.
  return <PlacedObject object={gltf.scene} dressing={dressing} flipY={false} />
}

function FbxMesh({
  url,
  dressing,
}: {
  url: string
  dressing?: NodeDressing
}): JSX.Element {
  // The safe manager stops format-internal texture paths ("chest_Specular.tga")
  // from being fetched against the file route, which 400s and kills the context.
  const fbx = useLoader(FBXLoader, url, loader => {
    loader.manager = safeLoadingManager
  })
  return <PlacedObject object={fbx} dressing={dressing} />
}

function ObjMesh({
  url,
  dressing,
}: {
  url: string
  dressing?: NodeDressing
}): JSX.Element {
  const obj = useLoader(OBJLoader, url, loader => {
    loader.manager = safeLoadingManager
  })
  return <PlacedObject object={obj} dressing={dressing} />
}

function StlMesh({
  url,
  dressing,
}: {
  url: string
  dressing?: NodeDressing
}): JSX.Element {
  const geometry = useLoader(STLLoader, url)

  // An STL carries no materials of its own, so it goes through the same clone +
  // apply path as every other format rather than a bespoke branch that a bound
  // texture set would not reach. The default material is the one it rendered
  // with before, for the (common) case of no binding - THREE.Mesh's own default
  // is unlit white, which would read as a lighting bug.
  const mesh = useMemo(
    () =>
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: '#b0b4bd',
          roughness: 0.6,
          metalness: 0.1,
        })
      ),
    [geometry]
  )

  return <PlacedObject object={mesh} dressing={dressing} />
}

/**
 * Clones the loaded object so the same asset placed forty times along a street
 * does not share one mutable Object3D between every placement, and applies the
 * node's bound texture set to the clone.
 *
 * Binding is scene-local, so it must land on the clone and never on the shared
 * source object - one dressed wall must not re-skin every other placement of
 * the same model, in this scene or in an open viewer tab.
 */
function PlacedObject({
  object,
  dressing,
  flipY = true,
}: {
  object: THREE.Object3D
  dressing?: NodeDressing
  flipY?: boolean
}): JSX.Element {
  const { gl: renderer } = useThree()

  // Keyed by the model's material slot name; the empty-string key is the node's
  // default binding, which dresses every slot no override names.
  const materialTextureSets: MaterialTextureSets = useMemo(
    () => dressing?.textureSets ?? {},
    [dressing]
  )
  const slotMaterials = useMemo(() => dressing?.materials ?? {}, [dressing])

  const { loadedTextures, texturesReady } = usePerMaterialTextures(
    materialTextureSets,
    renderer,
    flipY
  )

  const clone = useMemo(() => {
    const copy = object.clone(true)
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

    // Second, so the two layer predictably on a node that uses both: a tiling
    // material on the frame, a colour on the cushions. Parameter materials need
    // nothing loaded, so they appear on the first frame.
    applyParameterMaterials(copy, slotMaterials)

    return copy
  }, [
    object,
    materialTextureSets,
    slotMaterials,
    loadedTextures,
    texturesReady,
  ])

  // applyMaterialTextures allocates fresh materials on every rebuild, so the
  // superseded ones are released here. Only materials this clone introduced:
  // Object3D.clone SHARES materials (and geometry, and the loaded textures) with
  // the source object, so disposing indiscriminately would blank the original -
  // and with it every other placement of the same asset, plus any open viewer.
  useEffect(() => () => disposeClonedMaterials(clone, object), [clone, object])

  return <primitive object={clone} />
}

function collectMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>()
  root.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      if (material) {
        materials.add(material)
      }
    }
  })
  return materials
}

function disposeClonedMaterials(
  clone: THREE.Object3D,
  source: THREE.Object3D
): void {
  const shared = collectMaterials(source)
  for (const material of collectMaterials(clone)) {
    if (!shared.has(material)) {
      material.dispose()
    }
  }
}

/**
 * A flat picture standing in world space - how a sprite or an environment map
 * appears in a scene.
 *
 * Double-sided and alpha-tested: a sprite is usually a cut-out with
 * transparency, and one that vanished when the camera swung behind it would read
 * as a node that failed to load.
 */
function ImagePlane({
  url,
  bounds,
}: {
  url: string
  bounds: Vec3 | null | undefined
}): JSX.Element {
  const texture = useLoader(THREE.TextureLoader, url)

  // Bounds when the asset has been derived, otherwise the image's own aspect
  // ratio at one metre tall - a square placeholder would misreport its shape.
  const aspect = (texture.image?.width ?? 1) / (texture.image?.height ?? 1)
  const width = bounds?.x ?? aspect
  const height = bounds?.y ?? 1

  return (
    <mesh castShadow receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        map={texture}
        transparent
        alphaTest={0.01}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
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
 *
 * The offset comes from the shared helper so this box and the one blockout mode
 * draws describe the same volume - and both describe the box the server's
 * overlap check uses.
 */
function SelectionOutline({
  bounds,
  originConvention,
  originInBounds,
}: {
  bounds: Vec3 | null | undefined
  originConvention: string | null
  originInBounds: Vec3 | null
}): JSX.Element | null {
  if (!bounds) {
    return null
  }

  const [x, y, z] = boundsOffset(bounds, originConvention, originInBounds)

  return (
    <mesh position={[x, y, z]}>
      <boxGeometry args={[bounds.x * 1.02, bounds.y * 1.02, bounds.z * 1.02]} />
      <meshBasicMaterial color="#5b9dff" wireframe transparent opacity={0.8} />
    </mesh>
  )
}

/**
 * A node drawn as the volume it occupies: a solid, shaded box at the asset's
 * real bounds, sitting where the asset's origin puts it.
 *
 * Solid rather than wireframe on purpose - the wireframe markers already mean
 * "loading" and "failed", and a third wireframe box would make a blocked-out
 * scene unreadable. Shaded rather than flat because a flat silhouette hides the
 * one thing this mode exists to show: which volume is in front of which.
 *
 * A node whose asset has never been derived has no bounds to draw, and gets a
 * unit box marked out in a different colour rather than being dropped - a hole
 * where an object should be reads as a failed placement.
 */
function BlockoutVolume({
  bounds,
  originConvention,
  originInBounds,
}: {
  bounds: Vec3 | null | undefined
  originConvention: string | null
  originInBounds: Vec3 | null
}): JSX.Element {
  const known = bounds ?? { x: 1, y: 1, z: 1 }
  const [x, y, z] = boundsOffset(known, originConvention, originInBounds)

  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[known.x, known.y, known.z]} />
      <meshStandardMaterial
        color={bounds ? '#9aa1ac' : '#c08a5a'}
        roughness={0.9}
        metalness={0}
      />
    </mesh>
  )
}
