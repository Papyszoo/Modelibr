import { Environment, OrbitControls, Stage, useHelper } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { type JSX, Suspense, useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'

import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { useEnvironmentPresets } from '@/features/model-viewer/hooks/useEnvironmentPresets'
import { getFileUrl } from '@/features/models/api/modelApi'
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
  const { camera } = useThree()
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
      {/* Stage centres the model and casts the contact shadow. Its own lights
          are disabled (intensity 0) — the shared SceneLights rig below is the
          single light source, so the viewer matches the thumbnail render and
          the ambient/environment controls aren't swamped. */}
      <Stage
        key={`stage-${modelUrl}`}
        intensity={0}
        environment={null}
        shadows={
          showShadows ? { type: 'contact', opacity: 0.4, blur: 2 } : false
        }
        adjustCamera={false}
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
