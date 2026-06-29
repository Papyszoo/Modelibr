import { Environment, OrbitControls, Stage, useHelper } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import {
  type JSX,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { ShadowNodeMaterial } from 'three/webgpu'

import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { useEnvironmentPresets } from '@/features/model-viewer/hooks/useEnvironmentPresets'
import { getFileUrl } from '@/features/models/api/modelApi'
import { isWebGPUBackend } from '@/shared/three/createWebGPURenderer'
import { type Model as ModelType } from '@/utils/fileUtils'

import {
  resolveSceneLighting,
  type SceneLightingDescriptor,
} from '../../../../../asset-processor/lib/sceneLighting.js'
import { MeshHighlighter } from './MeshHighlighter'
import { Model } from './Model'
import { type MaterialTextureSets, TexturedModel } from './TexturedModel'
import { type ViewerSettingsType } from './ViewerSettings'

/**
 * The shared cross-runtime light rig (lib/sceneLighting.js — also used by the
 * worker thumbnail render) mapped to React-Three-Fiber primitives. This is the
 * ONLY lighting in the scene: drei's <Stage> runs at intensity 0 so its own
 * lights don't stack on top and swamp these (the bug that made the ambient /
 * environment sliders look inert). Optional drei helpers visualise each light
 * when "Show Light Helpers" is on.
 */
function SceneLights({
  descriptor,
  showHelpers,
}: {
  descriptor: SceneLightingDescriptor
  showHelpers: boolean
}): JSX.Element {
  const directionalRef = useRef<THREE.DirectionalLight>(null)
  const pointRef = useRef<THREE.PointLight>(null)
  const spotRef = useRef<THREE.SpotLight>(null)

  useHelper(
    showHelpers ? directionalRef : null,
    THREE.DirectionalLightHelper,
    1,
    '#ff8800'
  )
  useHelper(showHelpers ? pointRef : null, THREE.PointLightHelper, 1, '#00ccff')
  useHelper(showHelpers ? spotRef : null, THREE.SpotLightHelper, '#ff00ff')

  return (
    <>
      <ambientLight
        intensity={descriptor.ambient.intensity}
        color={descriptor.ambient.color}
      />
      <directionalLight
        ref={directionalRef}
        position={descriptor.directional.position}
        intensity={descriptor.directional.intensity}
        color={descriptor.directional.color}
        castShadow={descriptor.directional.castShadow}
        // Tight ortho frustum around the normalised (~2-unit) model so the
        // shadow map resolves crisply; a small negative bias + normalBias keeps
        // the ground catcher free of shadow acne. far comfortably reaches the
        // light at [20,15,20] (~30 units out).
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-near={0.1}
        shadow-camera-far={80}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <pointLight
        ref={pointRef}
        position={descriptor.point.position}
        intensity={descriptor.point.intensity}
        color={descriptor.point.color}
      />
      <spotLight
        ref={spotRef}
        position={descriptor.spot.position}
        intensity={descriptor.spot.intensity}
        angle={descriptor.spot.angle}
        penumbra={descriptor.spot.penumbra}
        color={descriptor.spot.color}
        castShadow={descriptor.spot.castShadow}
      />
    </>
  )
}

interface SceneProps {
  model: ModelType
  settings?: ViewerSettingsType
  materialTextureSets?: MaterialTextureSets
  defaultFileId?: number | null
  preserveMaterials?: boolean
  cameraState?: ViewerCameraState
  onCameraChange?: (state: ViewerCameraState) => void
}

export interface ViewerCameraState {
  position: [number, number, number]
  target: [number, number, number]
  zoom: number
}

interface OrbitControlsHandle {
  target: THREE.Vector3
  update: () => void
}

export function Scene({
  model,
  settings,
  materialTextureSets,
  defaultFileId,
  preserveMaterials = false,
  cameraState,
  onCameraChange,
}: SceneProps): JSX.Element {
  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControlsHandle | null>(null)

  // Find the renderable file - prioritize defaultFileId if set
  let renderableFile = model.files?.find(f => f.isRenderable)

  // If defaultFileId is set and exists in the files, use it
  if (defaultFileId) {
    const defaultFile = model.files?.find(
      f => f.id === defaultFileId.toString() && f.isRenderable
    )
    if (defaultFile) {
      renderableFile = defaultFile
    }
  }

  // Default settings if not provided
  const orbitSpeed = settings?.orbitSpeed ?? 1
  const zoomSpeed = settings?.zoomSpeed ?? 1
  const panSpeed = settings?.panSpeed ?? 1
  const modelRotationSpeed = settings?.modelRotationSpeed ?? 0.002
  const showShadows = settings?.showShadows ?? true
  // Defaults mirror the shared rig (lib/sceneLighting.js DEFAULT_LIGHTING) so an
  // unconfigured viewer matches the thumbnail render. ambient/environment are
  // absolute intensities; directional is a multiplier on the directional triplet.
  const ambientIntensity = settings?.ambientIntensity ?? 0.35
  const directionalIntensity = settings?.directionalIntensity ?? 1.0
  const showLightHelpers = settings?.showLightHelpers ?? false
  const environmentPreset = settings?.environmentPreset ?? 'city'
  const showEnvironmentBackground = settings?.showEnvironmentBackground ?? false
  const backgroundIntensity = settings?.backgroundIntensity ?? 1.0
  const environmentIntensity = settings?.environmentIntensity ?? 0.3
  const { envMap } = useEnvironmentPresets(environmentPreset)

  // Ground shadow catcher. drei's <Stage> centres the model's bounding box on
  // the origin, so its floor sits at y = -height/2; Stage hands us that height
  // via the Center onCentered callback. ShadowNodeMaterial is the WebGPU-native
  // shadow catcher — a plain transparent plane that darkens only where a shadow
  // falls. We use it instead of Stage's built-in `type: 'contact'` shadow, whose
  // GLSL blur ShaderMaterial can't run on the WebGPURenderer and rendered as an
  // opaque black plane after the WebGPU migration.
  // null until Stage's Center reports the model height — keeps the catcher
  // unmounted (rather than flashing at y=0) until we know the real floor.
  const [floorY, setFloorY] = useState<number | null>(null)
  const shadowMaterial = useMemo(() => {
    // ShadowNodeMaterial is the WebGPU shadow catcher; on the classic
    // WebGLRenderer (software/Firefox) the equivalent is the core ShadowMaterial.
    const material = isWebGPUBackend(gl)
      ? new ShadowNodeMaterial()
      : new THREE.ShadowMaterial()
    material.transparent = true
    material.opacity = 0.35
    return material
  }, [gl])
  useEffect(() => () => shadowMaterial.dispose(), [shadowMaterial])

  // Resolve the single balanced rig from the user settings. This is what makes
  // the ambient/directional/environment controls actually move the image.
  const lighting = resolveSceneLighting({
    ambientIntensity,
    directionalIntensity,
    environmentIntensity,
  })

  useEffect(() => {
    if (!cameraState) {
      return
    }

    camera.position.set(...cameraState.position)
    camera.zoom = cameraState.zoom
    camera.updateProjectionMatrix()

    if (controlsRef.current) {
      controlsRef.current.target.set(...cameraState.target)
      controlsRef.current.update()
    }
  }, [camera, cameraState])

  const handleCameraChange = useCallback(() => {
    if (!onCameraChange || !controlsRef.current) {
      return
    }

    onCameraChange({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [
        controlsRef.current.target.x,
        controlsRef.current.target.y,
        controlsRef.current.target.z,
      ],
      zoom: camera.zoom,
    })
  }, [camera, onCameraChange])

  // Fallback to first file if no renderable found
  if (!renderableFile) {
    renderableFile = model.files?.[0]
  }

  if (!renderableFile) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="gray" />
      </mesh>
    )
  }

  const fileExtension = renderableFile.originalFileName
    .split('.')
    .pop()
    .toLowerCase()
  const modelUrl = getFileUrl(renderableFile.id)

  return (
    <>
      {/* Stage only centres the model now. Its own lights are disabled
          (intensity 0) — the shared SceneLights rig below is the single light
          source, so the viewer matches the thumbnail render and the
          ambient/environment controls aren't swamped. Shadows are off here: the
          drei contact shadow is GLSL-based and breaks on the WebGPURenderer
          (opaque black plane), so the ground shadow is rendered by the
          ShadowNodeMaterial catcher below instead. onCentered reports the model
          height so we can park that catcher at the model's feet (y=-height/2). */}
      <Stage
        key={`stage-${modelUrl}`}
        intensity={0}
        environment={null}
        shadows={false}
        adjustCamera={false}
        center={{ onCentered: ({ height }) => setFloorY(-height / 2) }}
      >
        <Suspense fallback={<LoadingPlaceholder />}>
          {materialTextureSets &&
          Object.keys(materialTextureSets).length > 0 ? (
            <TexturedModel
              key={`${modelUrl}-${Object.entries(materialTextureSets)
                .map(([m, ts]) => `${m}:${ts.id}`)
                .sort()
                .join(',')}`}
              modelUrl={modelUrl}
              fileExtension={fileExtension}
              rotationSpeed={modelRotationSpeed}
              materialTextureSets={materialTextureSets}
            />
          ) : (
            <Model
              key={modelUrl}
              modelUrl={modelUrl}
              fileExtension={fileExtension}
              rotationSpeed={modelRotationSpeed}
              preserveMaterials={preserveMaterials}
            />
          )}
        </Suspense>
      </Stage>

      {/* WebGPU-native ground shadow catcher at the model's feet. The plane is
          invisible (ShadowNodeMaterial) except where the directional/spot lights
          throw a shadow, so the model reads as grounded without a visible floor.
          Gated by the Show Shadows setting; the model meshes already castShadow. */}
      {showShadows && floorY !== null && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, floorY, 0]}
          receiveShadow
          material={shadowMaterial}
        >
          <planeGeometry args={[20, 20]} />
        </mesh>
      )}

      {/* Environment map for reflections and optional background. The IBL
          contribution (environmentIntensity) is the resolved value, so the
          environment slider visibly changes reflections. */}
      {envMap && (
        <Environment
          map={envMap}
          background={showEnvironmentBackground}
          backgroundIntensity={backgroundIntensity}
          environmentIntensity={lighting.environmentIntensity}
        />
      )}

      {/* Shared cross-runtime light rig — the single source of illumination. */}
      <SceneLights descriptor={lighting} showHelpers={showLightHelpers} />

      {/* Mesh highlighting from hierarchy panel */}
      <MeshHighlighter />

      {/* Orbit controls for interaction */}
      <OrbitControls
        ref={controlsRef}
        key={`orbit-${modelUrl}`}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxDistance={50}
        minDistance={0.1}
        rotateSpeed={orbitSpeed}
        zoomSpeed={zoomSpeed}
        panSpeed={panSpeed}
        onEnd={handleCameraChange}
      />
    </>
  )
}
