import { JSX, Suspense, useRef } from 'react'
import { Stage, OrbitControls, useHelper } from '@react-three/drei'
import * as THREE from 'three'
import { Model } from './Model'
import { TexturedModel } from './TexturedModel'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { getFileUrl } from '@/features/models/api/modelApi'
import { Model as ModelType } from '@/utils/fileUtils'
import { ViewerSettingsType } from './ViewerSettings'
import { TextureSetDto } from '@/types'

// Helper component to show directional light with visual indicator
function FillLight({
  position,
  intensity,
  color,
  helperColor,
}: {
  position: [number, number, number]
  intensity: number
  color: string
  helperColor: string // Separate color for helper visibility
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  // Show helper arrow to visualize light direction (comment out to hide)
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

interface SceneProps {
  model: ModelType
  settings?: ViewerSettingsType
  textureSet?: TextureSetDto | null
  defaultFileId?: number | null
}

export function Scene({
  model,
  settings,
  textureSet,
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

  // Default settings if not provided
  const orbitSpeed = settings?.orbitSpeed ?? 1
  const zoomSpeed = settings?.zoomSpeed ?? 1
  const panSpeed = settings?.panSpeed ?? 1
  const modelRotationSpeed = settings?.modelRotationSpeed ?? 0.002
  const showShadows = settings?.showShadows ?? true

  return (
    <>
      {/* Stage provides automatic lighting, shadows, and environment */}
      <Stage
        key={`stage-${modelUrl}`}
        intensity={1.0}
        environment="city"
        shadows={
          showShadows ? { type: 'contact', opacity: 0.4, blur: 2 } : false
        }
        adjustCamera={false}
      >
        <Suspense fallback={<LoadingPlaceholder />}>
          {textureSet !== undefined && textureSet !== null ? (
            <TexturedModel
              key={`${modelUrl}-${textureSet?.id || 'none'}`}
              modelUrl={modelUrl}
              fileExtension={fileExtension}
              rotationSpeed={modelRotationSpeed}
              textureSet={textureSet}
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
      {/* 
        Three-Point Lighting System
        Models are normalized to fit in ~2x2x2 bounds (see TexturedModel.tsx)
        Lights positioned at 3x model radius for consistent illumination
      */}

      {/* Ambient fill - base illumination */}
      <ambientLight intensity={0.3} />

      {/* KEY LIGHT: Main light, warm, from front-right-above (45° azimuth, 45° elevation) */}
      <FillLight
        position={[4, 4, 4]}
        intensity={1.2}
        color="#fff5e6"
        helperColor="#ff8800" // Bright orange - visible in light mode
      />

      {/* FILL LIGHT: Softer, cool, from front-left (opposite key) */}
      <FillLight
        position={[-4, 2, 4]}
        intensity={0.6}
        color="#e6f0ff"
        helperColor="#00ccff" // Bright cyan - visible in light mode
      />

      {/* RIM/BACK LIGHT: Edge separation, from behind */}
      <FillLight
        position={[0, 3, -5]}
        intensity={0.8}
        color="#ffffff"
        helperColor="#ff00ff" // Bright magenta - visible in light mode
      />

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

