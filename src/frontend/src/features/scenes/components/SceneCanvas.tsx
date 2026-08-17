import './SceneCanvas.css'

import { Environment, Grid, OrbitControls } from '@react-three/drei'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { type JSX, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader'

import {
  sceneAssetSourceKey,
  useSceneAssetSources,
} from '../hooks/useSceneAssetSources'
import { useSceneMaterials } from '../hooks/useSceneMaterials'
import type {
  SceneDocument,
  SceneEnvironment,
  SceneLight,
  SceneNodeView,
} from '../types'
import { SceneNodeObject } from './SceneNodeObject'

interface SceneCanvasProps {
  /** The draft being edited - the source of truth for what is drawn. */
  document: SceneDocument
  /**
   * The server's derived facts for each node, from the last read. Kept separate
   * from the draft because moving a node does not change how big its asset is,
   * so the editor should not have to wait for a round trip to keep drawing it
   * correctly.
   */
  nodeFacts: Map<string, SceneNodeView>
  selectedNodeId: string | null
  onSelectNode: (nodeId: string | null) => void
  /** Reports an asset that could not be loaded, so the editor can flag the node. */
  onNodeLoadError: (nodeId: string, message: string) => void
  /**
   * Reports each node settling, loaded or failed. Only the headless render view
   * needs it, to know when the scene is finished before it screenshots.
   */
  onNodeLoadSettled?: (nodeId: string, loaded: boolean) => void
  /**
   * Where to look from. The editor leaves this off and gets the default
   * three-quarter view with orbit controls; a render is framed by its caller.
   */
  camera?: SceneCameraSpec
  /** Off for a render - the grid is an editing aid, not part of the scene. */
  showGrid?: boolean
  /** Off for a render: no orbit controls, no click-to-select. */
  interactive?: boolean
  /**
   * Draw every node as its bounding volume instead of its mesh.
   *
   * How a composition is judged before it is dressed: an object floating half
   * its height is glaring among grey volumes and easy to miss in a lit,
   * textured render. No geometry is loaded in this mode either, which is what
   * makes a large scene navigable while it is still being laid out.
   */
  blockout?: boolean
}

/** A camera placement. `target` defaults to the origin, `fov` to the editor's 50. */
export interface SceneCameraSpec {
  position: [number, number, number]
  target?: [number, number, number]
  fov?: number
}

const DEFAULT_CAMERA: SceneCameraSpec = {
  position: [12, 9, 12],
  target: [0, 0, 0],
  fov: 50,
}

export function SceneCanvas({
  document,
  nodeFacts,
  selectedNodeId,
  onSelectNode,
  onNodeLoadError,
  onNodeLoadSettled,
  camera = DEFAULT_CAMERA,
  showGrid = true,
  interactive = true,
  blockout = false,
}: SceneCanvasProps): JSX.Element {
  // Resolved out here on purpose: react-three-fiber renders the canvas subtree
  // through its own reconciler root, so the app's React context - the
  // QueryClient included - is not reachable from inside <Canvas>. Fetching in
  // there fails at the first hook and the node simply never appears.
  const sources = useSceneAssetSources(document)
  const materials = useSceneMaterials(document)

  // Resolved out here with everything else - the environment map is a library
  // asset, so its URL comes from a query the canvas subtree cannot run.
  const environmentMap = document.environment?.environmentMap
  const environmentMapUrl = environmentMap
    ? (sources.get(sceneAssetSourceKey(environmentMap))?.url ?? null)
    : null

  return (
    <div className="scene-canvas" data-testid="scene-canvas">
      <Canvas
        shadows
        camera={{
          position: camera.position,
          fov: camera.fov ?? DEFAULT_CAMERA.fov,
        }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={Math.min(window.devicePixelRatio, 2)}
        onPointerMissed={interactive ? () => onSelectNode(null) : undefined}
      >
        <SceneCameraAim target={camera.target ?? [0, 0, 0]} />

        {showGrid ? (
          <Grid
            args={[40, 40]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#4b5563"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#6b7280"
            fadeDistance={80}
            followCamera={false}
            infiniteGrid
          />
        ) : null}

        <SceneEnvironmentRig
          environment={document.environment ?? null}
          mapUrl={environmentMapUrl}
        />

        <SceneDocumentLights lights={document.lights} />

        {document.nodes.map(node => {
          const facts = nodeFacts.get(node.id)
          return (
            <SceneNodeObject
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              onSelect={onSelectNode}
              source={
                node.asset
                  ? sources.get(sceneAssetSourceKey(node.asset))
                  : undefined
              }
              materialTextureSet={materials.get(node.id)}
              sourceDimensions={facts?.sourceDimensions ?? null}
              originConvention={facts?.originConvention ?? null}
              originInBounds={facts?.originInBounds ?? null}
              blockout={blockout}
              onLoadError={onNodeLoadError}
              onLoadSettled={onNodeLoadSettled}
            />
          )
        })}

        {interactive ? (
          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        ) : null}
      </Canvas>
    </div>
  )
}

/**
 * Points the camera at a target.
 *
 * A no-op in the editor, where `OrbitControls` owns the camera and its own
 * target already defaults to the origin. It matters for a render, which has no
 * controls: without this the camera keeps the orientation the Canvas gave it, so
 * moving it to frame a scene would just look at the same direction from a
 * different place.
 */
function SceneCameraAim({
  target,
}: {
  target: [number, number, number]
}): null {
  const camera = useThree(state => state.camera)
  const [x, y, z] = target

  useEffect(() => {
    camera.lookAt(x, y, z)
    camera.updateProjectionMatrix()
  }, [camera, x, y, z])

  return null
}

/**
 * The document's lights, plus a minimal fill when it has none.
 *
 * The fill is not written into the document: an unlit scene should look unlit
 * once the user adds their first light, and silently seeding lights would make
 * "why is my scene brighter than my lighting says" the first question asked.
 */
function SceneDocumentLights({
  lights,
}: {
  lights: SceneLight[]
}): JSX.Element {
  if (lights.length === 0) {
    return (
      <>
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 12, 6]} intensity={1.1} castShadow />
      </>
    )
  }

  return (
    <>
      {lights.map(light => {
        const position: [number, number, number] = [
          light.position.x,
          light.position.y,
          light.position.z,
        ]

        switch (light.type) {
          case 'ambient':
            return (
              <ambientLight
                key={light.id}
                intensity={light.intensity}
                color={light.color}
              />
            )
          case 'hemisphere':
            return (
              <hemisphereLight
                key={light.id}
                intensity={light.intensity}
                color={light.color}
              />
            )
          case 'directional':
          case 'spot':
            return <AimedLight key={light.id} light={light} />
          default:
            return (
              <pointLight
                key={light.id}
                position={position}
                intensity={light.intensity}
                color={light.color}
                castShadow
              />
            )
        }
      })}
    </>
  )
}

/**
 * A directional or spot light, aimed where the document says.
 *
 * three.js aims these at a `target` Object3D that defaults to the origin, and
 * nothing read `light.target` - so a scene that carefully aimed its key light
 * at a doorway rendered with every light pointing at 0,0,0. The target object
 * has to be part of the scene graph for its world matrix to update, hence the
 * `<primitive>` rather than a bare `new Object3D()`.
 */
function AimedLight({ light }: { light: SceneLight }): JSX.Element {
  const target = useMemo(() => new THREE.Object3D(), [])
  const aim = light.target ?? { x: 0, y: 0, z: 0 }
  const position: [number, number, number] = [
    light.position.x,
    light.position.y,
    light.position.z,
  ]

  return (
    <>
      <primitive object={target} position={[aim.x, aim.y, aim.z]} />
      {light.type === 'spot' ? (
        <spotLight
          position={position}
          target={target}
          intensity={light.intensity}
          color={light.color}
          angle={0.5}
          penumbra={0.4}
          castShadow
        />
      ) : (
        <directionalLight
          position={position}
          target={target}
          intensity={light.intensity}
          color={light.color}
          castShadow
        />
      )}
    </>
  )
}

/**
 * The scene's environment: image-based lighting, background and exposure.
 *
 * The document has carried `environment` since scenes shipped and the viewport
 * ignored all three fields - a scene authored with an HDRI rendered under the
 * default lights, and its background colour and exposure did nothing. An agent
 * could set them, save them, read them back, and never see them.
 *
 * The loader is picked by extension because these files are not ordinary
 * images: an .hdr or .exr put through TextureLoader decodes to nothing usable,
 * which is the failure that looks like "the environment silently did not
 * apply".
 */
function SceneEnvironmentRig({
  environment,
  mapUrl,
}: {
  environment: SceneEnvironment | null
  mapUrl: string | null
}): JSX.Element | null {
  const { gl } = useThree()

  // Exposure is in EV stops, so each step doubles the light. Reset to neutral
  // when the document does not set it, or a scene that once had exposure would
  // keep it after the field was cleared.
  const exposureEv = environment?.exposureEv ?? null
  useEffect(() => {
    gl.toneMappingExposure = exposureEv === null ? 1 : Math.pow(2, exposureEv)
    return () => {
      gl.toneMappingExposure = 1
    }
  }, [gl, exposureEv])

  return (
    <>
      {environment?.background ? (
        <color attach="background" args={[environment.background]} />
      ) : null}
      {mapUrl ? <SceneEnvironmentMap url={mapUrl} /> : null}
    </>
  )
}

/** Loads one equirectangular environment map and lights the scene with it. */
function SceneEnvironmentMap({ url }: { url: string }): JSX.Element {
  const extension = url.split('.').pop()?.toLowerCase() ?? ''
  const loader =
    extension === 'exr'
      ? EXRLoader
      : extension === 'hdr'
        ? RGBELoader
        : THREE.TextureLoader

  const texture = useLoader(loader, url) as THREE.Texture
  texture.mapping = THREE.EquirectangularReflectionMapping

  // background: the map is what the camera sees as well as what lights the
  // scene. A scene that lit from an HDRI but showed grey behind it would read
  // as a half-applied environment.
  return <Environment map={texture} background />
}
