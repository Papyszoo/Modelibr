import { Environment, OrbitControls, Stage, useHelper } from '@react-three/drei'
import { type JSX, Suspense, useRef } from 'react'
import * as THREE from 'three'

import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { getFileUrl } from '@/features/models/api/modelApi'
import { useEnvironmentPresets } from '@/features/model-viewer/hooks/useEnvironmentPresets'
import { type Model as ModelType } from '@/utils/fileUtils'

import { MeshHighlighter } from './MeshHighlighter'
import { Model } from './Model'
import { type MaterialTextureSets, TexturedModel } from './TexturedModel'
import { type ViewerSettingsType } from './ViewerSettings'

// Directional light with visual helper indicator
function FillLightWithHelper({
  position,
  intensity,
  color,
  helperColor,
}: {
  position: [number, number, number]
  intensity: number
  color: string
  helperColor: string
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  useHelper(lightRef, THREE.DirectionalLightHelper, 1, helperColor)

  return (
    <directionalLight
      ref={lightRef}
      position={position}
      intensity={intensity}
      color={color}
    />
  )
}

// Directional light without helper
function FillLight({
  position,
  intensity,
  color,
}: {
  position: [number, number, number]
  intensity: number
  color: string
}) {
  return (
    <directionalLight position={position} intensity={intensity} color={color} />
  )
}

interface SceneProps {
  model: ModelType
  settings?: ViewerSettingsType
  materialTextureSets?: MaterialTextureSets
  defaultFileId?: number | null
}

export function Scene({
  model,
  settings,
  materialTextureSets,
  defaultFileId,
}: SceneProps): JSX.Element {
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
  const ambientIntensity = settings?.ambientIntensity ?? 0.3
  const directionalIntensity = settings?.directionalIntensity ?? 1.0
  const showLightHelpers = settings?.showLightHelpers ?? false
  const environmentPreset = settings?.environmentPreset ?? 'city'
  const showEnvironmentBackground = settings?.showEnvironmentBackground ?? false
  const backgroundIntensity = settings?.backgroundIntensity ?? 1.0
  const environmentIntensity = settings?.environmentIntensity ?? 1.0
  const { envMap } = useEnvironmentPresets(environmentPreset)

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
      {/* Stage provides automatic lighting, shadows, and environment */}
      <Stage
        key={`stage-${modelUrl}`}
        intensity={directionalIntensity}
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
            />
          )}
        </Suspense>
      </Stage>

      {/* Environment map for reflections and optional background */}
      {envMap && (
        <Environment
          map={envMap}
          background={showEnvironmentBackground}
          backgroundIntensity={backgroundIntensity}
          environmentIntensity={environmentIntensity}
        />
      )}

      {/* 
        Three-Point Lighting System
        Models are normalized to fit in ~2x2x2 bounds (see TexturedModel.tsx)
        Lights positioned at 3x model radius for consistent illumination
      */}

      {/* Ambient fill - base illumination */}
      <ambientLight intensity={ambientIntensity} />

      {/* KEY LIGHT: Main light, warm, from front-right-above (45° azimuth, 45° elevation) */}
      {showLightHelpers ? (
        <FillLightWithHelper
          position={[4, 4, 4]}
          intensity={1.2 * directionalIntensity}
          color="#fff5e6"
          helperColor="#ff8800"
        />
      ) : (
        <FillLight
          position={[4, 4, 4]}
          intensity={1.2 * directionalIntensity}
          color="#fff5e6"
        />
      )}

      {/* FILL LIGHT: Softer, cool, from front-left (opposite key) */}
      {showLightHelpers ? (
        <FillLightWithHelper
          position={[-4, 2, 4]}
          intensity={0.6 * directionalIntensity}
          color="#e6f0ff"
          helperColor="#00ccff"
        />
      ) : (
        <FillLight
          position={[-4, 2, 4]}
          intensity={0.6 * directionalIntensity}
          color="#e6f0ff"
        />
      )}

      {/* RIM/BACK LIGHT: Edge separation, from behind */}
      {showLightHelpers ? (
        <FillLightWithHelper
          position={[0, 3, -5]}
          intensity={0.8 * directionalIntensity}
          color="#ffffff"
          helperColor="#ff00ff"
        />
      ) : (
        <FillLight
          position={[0, 3, -5]}
          intensity={0.8 * directionalIntensity}
          color="#ffffff"
        />
      )}

      {/* Mesh highlighting from hierarchy panel */}
      <MeshHighlighter />

      {/* Orbit controls for interaction */}
      <OrbitControls
        key={`orbit-${modelUrl}`}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxDistance={50}
        minDistance={0.1}
        rotateSpeed={orbitSpeed}
        zoomSpeed={zoomSpeed}
        panSpeed={panSpeed}
      />
    </>
  )
}
