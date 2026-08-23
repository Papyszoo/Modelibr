import { useLoader, useThree } from '@react-three/fiber'
import {
  type JSX,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

import { applyParameterMaterials } from '@/shared/three/parameterMaterial'
import { createResourceManager } from '@/shared/three/safeLoadingManager'
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
  /**
   * This node fills a slot whose decision is still open.
   *
   * Drawn in the viewport, not only listed in the choices panel, because an
   * unresolved slot is a hole in the scene: the object standing there is a
   * proposal nobody has agreed to, and a scene that looks finished while three
   * of its decisions are still open is how an agent's pick becomes the answer
   * by default.
   */
  undecided?: boolean
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
  undecided = false,
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
        <SceneNodeAsset
          nodeId={node.id}
          source={source}
          bounds={sourceDimensions}
          originConvention={originConvention}
          originInBounds={originInBounds}
          dressing={dressing}
          onLoadError={onLoadError}
          onLoadSettled={onLoadSettled}
        />
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
      {undecided && !selected ? (
        <UndecidedOutline
          bounds={node.primitive?.size ?? sourceDimensions}
          originConvention={node.primitive ? 'centered' : originConvention}
          originInBounds={node.primitive ? null : originInBounds}
        />
      ) : null}
    </group>
  )
}

/**
 * The loading branch of a node that references a library asset.
 *
 * Separate from `SceneNodeObject` because it holds state and that component returns early
 * for a hidden node. It owns the two-step swap the viewport needs: the geometry resolving
 * is not the moment the node is ready, because the first frame that draws it still pays
 * for shader compilation. Bounds therefore stay mounted until the renderer reports the
 * material set compiled, and only then is the node reported settled - which is also what
 * releases the next resource, so one node's compile cannot land in the same long task as
 * the next node's parse.
 */
function SceneNodeAsset({
  nodeId,
  source,
  bounds,
  originConvention,
  originInBounds,
  dressing,
  onLoadError,
  onLoadSettled,
}: {
  nodeId: string
  source?: SceneAssetSource
  bounds: Vec3 | null
  originConvention: string | null
  originInBounds: Vec3 | null
  dressing?: NodeDressing
  onLoadError: (nodeId: string, message: string) => void
  onLoadSettled?: (nodeId: string, loaded: boolean) => void
}): JSX.Element {
  // Keyed by the load rather than a bare boolean: swapping a slot candidate reuses this
  // component, and a stale `true` would report the new asset ready before it had loaded.
  const loadKey = sourceLoadKey(source)
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const onReady = useCallback(() => setReadyKey(loadKey), [loadKey])
  const ready = readyKey === loadKey

  return (
    <SceneNodeErrorBoundary
      nodeId={nodeId}
      resetKey={loadKey}
      onError={(erroredNodeId, message) => {
        onLoadError(erroredNodeId, message)
        onLoadSettled?.(erroredNodeId, false)
      }}
      onReset={() => clearCachedLoad(source)}
      fallback={
        <FailedMarker
          bounds={bounds}
          originConvention={originConvention}
          originInBounds={originInBounds}
        />
      }
    >
      <Suspense
        fallback={
          <PendingMarker
            bounds={bounds}
            originConvention={originConvention}
            originInBounds={originInBounds}
          />
        }
      >
        <SceneAssetMesh
          source={source}
          bounds={bounds}
          originConvention={originConvention}
          originInBounds={originInBounds}
          dressing={dressing}
          onReady={onReady}
        />
        {/*
          The download has finished but the object is not on screen yet. Without this the
          node would vanish between the Suspense fallback unmounting and compilation
          finishing, which reads as an asset that failed to load.
        */}
        {!ready ? (
          <PendingMarker
            bounds={bounds}
            originConvention={originConvention}
            originInBounds={originInBounds}
          />
        ) : null}
        {/*
          Inside the boundary on purpose: React commits a Suspense boundary's children
          together, so this effect cannot run until the mesh beside it has actually
          resolved. Gated on the source being present and done, because `SceneAssetMesh`
          returns a pending marker rather than suspending while the resource map is still
          on its way - without the guard a loose glTF would report itself settled one
          render before its `.bin` arrived.
        */}
        {source && !source.isLoading && ready ? (
          <SettleSignal nodeId={nodeId} loaded onSettled={onLoadSettled} />
        ) : null}
      </Suspense>
    </SceneNodeErrorBoundary>
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

/** Reports a node with nothing to compile as ready, once, when it mounts. */
function ReadySignal({ onReady }: { onReady: () => void }): null {
  useEffect(() => {
    onReady()
  }, [onReady])

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
      {/*
        The primitive's own colour when it declares one - a room shell that comes
        back neutral grey is a room shell nobody can tell the floor from the walls
        in. Falls back to blockout grey, which is what an unstated colour means.
      */}
      <meshStandardMaterial
        color={primitive.color ?? '#8a8f98'}
        roughness={0.8}
        metalness={0.05}
      />
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

  return `${source.url}|${Object.keys(source.resources).sort().join(',')}|${source.error ?? ''}`
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

/**
 * How long a node waits for its shaders before it is shown anyway.
 *
 * Long enough that ordinary compilation finishes inside it, short enough that one
 * pathological material cannot hold the serial resource queue open indefinitely.
 */
const COMPILE_WAIT_MS = 2000

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
  originConvention,
  originInBounds,
  dressing,
  onReady,
}: {
  source?: SceneAssetSource
  bounds: Vec3 | null
  originConvention: string | null
  originInBounds: Vec3 | null
  dressing?: NodeDressing
  /** Called once this node is compiled and on screen; see `SceneNodeAsset`. */
  onReady: () => void
}): JSX.Element | null {
  if (!source || source.isLoading) {
    return (
      <PendingMarker
        bounds={bounds}
        originConvention={originConvention}
        originInBounds={originInBounds}
      />
    )
  }

  if (source.error) {
    throw new Error(source.error)
  }

  // A sprite or an environment map is one picture, not geometry: it is drawn as
  // a plane at the node's transform rather than pushed through a mesh loader
  // that would reach it as image bytes and fail to parse.
  if (source.kind === 'image') {
    return <ImagePlane url={source.url} bounds={bounds} onReady={onReady} />
  }

  switch (source.extension) {
    case 'glb':
    case 'gltf':
      return (
        <GltfMesh
          url={source.url}
          resources={source.resources}
          dressing={dressing}
          onReady={onReady}
        />
      )
    case 'fbx':
      return (
        <FbxMesh
          url={source.url}
          resources={source.resources}
          dressing={dressing}
          onReady={onReady}
        />
      )
    case 'obj':
      return (
        <ObjMesh
          url={source.url}
          resources={source.resources}
          dressing={dressing}
          onReady={onReady}
        />
      )
    case 'stl':
      return <StlMesh url={source.url} dressing={dressing} onReady={onReady} />
    default:
      // A format the viewer cannot load is shown as its bounds rather than
      // dropped - a node missing from the canvas reads as a failed placement.
      // There is nothing to compile, so it is ready as soon as it is drawn.
      return (
        <>
          <PendingMarker
            bounds={bounds}
            originConvention={originConvention}
            originInBounds={originInBounds}
          />
          <ReadySignal onReady={onReady} />
        </>
      )
  }
}

function GltfMesh({
  url,
  resources,
  dressing,
  onReady,
}: {
  url: string
  resources: Record<string, string>
  dressing?: NodeDressing
  onReady: () => void
}): JSX.Element {
  // A loose .gltf stores its buffers and textures as relative URIs. They resolve
  // against the version-file route, 404, and the loader then fails on the
  // missing .bin with no geometry to show. This map points them at the
  // auxiliary files the import stored.
  const manager = useMemo(() => createResourceManager(resources), [resources])
  const gltf = useLoader(GLTFLoader, url, loader => {
    loader.manager = manager
  })

  // flipY=false for glTF, matching the model viewer: glTF authors its UVs the
  // other way up, and getting this wrong turns every bound texture upside down.
  return (
    <PlacedObject
      object={gltf.scene}
      dressing={dressing}
      flipY={false}
      onReady={onReady}
    />
  )
}

function FbxMesh({
  url,
  resources,
  dressing,
  onReady,
}: {
  url: string
  resources: Record<string, string>
  dressing?: NodeDressing
  onReady: () => void
}): JSX.Element {
  // An FBX names its textures the way the artist's machine had them
  // ("chest_Specular.tga", sometimes a whole Windows path). Those resolve
  // against the file route and 400, so they used to be rewritten to a
  // transparent pixel unconditionally - which is why an FBX rendered
  // untextured in a scene, always. The map points them at the sibling files
  // the import stored; anything it cannot place still falls back to the pixel.
  const manager = useMemo(() => createResourceManager(resources), [resources])
  const fbx = useLoader(FBXLoader, url, loader => {
    loader.manager = manager
  })
  return <PlacedObject object={fbx} dressing={dressing} onReady={onReady} />
}

function ObjMesh({
  url,
  resources,
  dressing,
  onReady,
}: {
  url: string
  resources: Record<string, string>
  dressing?: NodeDressing
  onReady: () => void
}): JSX.Element {
  const manager = useMemo(() => createResourceManager(resources), [resources])
  const obj = useLoader(OBJLoader, url, loader => {
    loader.manager = manager
  })
  return <PlacedObject object={obj} dressing={dressing} onReady={onReady} />
}

function StlMesh({
  url,
  dressing,
  onReady,
}: {
  url: string
  dressing?: NodeDressing
  onReady: () => void
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

  return <PlacedObject object={mesh} dressing={dressing} onReady={onReady} />
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
  onReady,
}: {
  object: THREE.Object3D
  dressing?: NodeDressing
  flipY?: boolean
  onReady: () => void
}): JSX.Element | null {
  const { gl: renderer, scene, camera } = useThree()

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

  // Compiled before it is mounted, not on the frame that first draws it.
  //
  // Adding a ready object to the scene graph moves its shader compilation and texture
  // upload into the next render, which is the long task the user sees as the viewport
  // locking up. `compileAsync` does that work against the live scene's lights while the
  // node is still drawn as bounds, and where the driver supports parallel shader
  // compilation it happens off the main thread entirely.
  //
  // A compile that fails, or one that never reports itself finished, still swaps. three
  // polls the programs for readiness on a timer, so a driver that never flips that flag
  // would leave this node invisible *and* hold the whole resource queue behind it - a
  // worse failure than a node that renders with a program still warming up.
  const [compiled, setCompiled] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    let cancelled = false
    let waitTimer: number | null = null
    const swap = (): void => {
      if (cancelled) {
        return
      }
      if (waitTimer !== null) {
        window.clearTimeout(waitTimer)
        waitTimer = null
      }
      setCompiled(clone)
      onReady()
    }

    clone.updateMatrixWorld(true)
    try {
      const compiling = renderer.compileAsync?.(clone, camera, scene)
      if (compiling) {
        waitTimer = window.setTimeout(swap, COMPILE_WAIT_MS)
        compiling.then(swap, swap)
      } else {
        swap()
      }
    } catch {
      swap()
    }

    return () => {
      cancelled = true
      if (waitTimer !== null) {
        window.clearTimeout(waitTimer)
      }
    }
  }, [camera, clone, onReady, renderer, scene])

  return compiled === clone ? <primitive object={clone} /> : null
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
  onReady,
}: {
  url: string
  bounds: Vec3 | null | undefined
  onReady: () => void
}): JSX.Element {
  const texture = useLoader(THREE.TextureLoader, url)

  // Bounds when the asset has been derived, otherwise the image's own aspect
  // ratio at one metre tall - a square placeholder would misreport its shape.
  const aspect = (texture.image?.width ?? 1) / (texture.image?.height ?? 1)
  const width = bounds?.x ?? aspect
  const height = bounds?.y ?? 1

  return (
    <>
      {/* One plane and one texture; there is no material set to precompile. */}
      <ReadySignal onReady={onReady} />
      <mesh castShadow receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={texture}
          transparent
          alphaTest={0.01}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  )
}

/** Placeholder sized to the asset's real bounds when they are known. */
function markerSize(bounds: Vec3 | null | undefined): [number, number, number] {
  return bounds ? [bounds.x, bounds.y, bounds.z] : [1, 1, 1]
}

/** Shown while an asset loads, and for formats the viewer cannot open. */
function PendingMarker({
  bounds,
  originConvention,
  originInBounds,
}: {
  bounds: Vec3 | null | undefined
  originConvention?: string | null
  originInBounds?: Vec3 | null
}): JSX.Element {
  const size = bounds ?? { x: 1, y: 1, z: 1 }
  const offset = bounds
    ? boundsOffset(size, originConvention ?? null, originInBounds ?? null)
    : ([0, 0, 0] as const)

  return (
    <mesh position={offset}>
      <boxGeometry args={markerSize(size)} />
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
  originConvention,
  originInBounds,
}: {
  bounds: Vec3 | null | undefined
  originConvention?: string | null
  originInBounds?: Vec3 | null
}): JSX.Element {
  const size = bounds ?? { x: 1, y: 1, z: 1 }
  const offset = bounds
    ? boundsOffset(size, originConvention ?? null, originInBounds ?? null)
    : ([0, 0, 0] as const)

  return (
    <mesh position={offset}>
      <boxGeometry args={markerSize(size)} />
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
 * An amber box around a node whose slot is still open.
 *
 * Deliberately the same shape as the selection outline and a different colour,
 * so "you are looking at this" and "nobody has agreed to this yet" read as two
 * facts about one node rather than competing for the same affordance. Yields to
 * the selection outline when both apply - two concentric wireframes say less
 * than one.
 *
 * Like the selection box it is omitted when the asset's bounds are unknown: a
 * made-up cube around a lamp post would state something false about its size.
 */
function UndecidedOutline({
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
      <boxGeometry args={[bounds.x * 1.04, bounds.y * 1.04, bounds.z * 1.04]} />
      {/* Scene content, not chrome - three.js materials take a colour, not a token. */}
      <meshBasicMaterial color="#f59e0b" wireframe transparent opacity={0.7} />
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
