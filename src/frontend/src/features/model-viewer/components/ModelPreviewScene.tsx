import { JSX, Suspense } from 'react'
import { Stage, OrbitControls } from '@react-three/drei'
import Model from './Model'
import TexturedModel from './TexturedModel'
import LoadingPlaceholder from '../../../components/LoadingPlaceholder'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import { Model as ModelType } from '../../../utils/fileUtils'
import { ViewerSettingsType } from './ViewerSettings'
import { TextureSetDto } from '../../../types'

interface SceneProps {
  model: ModelType
  settings?: ViewerSettingsType
  textureSet?: TextureSetDto | null
  defaultFileId?: number | null
}

function Scene({ model, settings, textureSet, defaultFileId }: SceneProps): JSX.Element {
  // Find the renderable file - prioritize defaultFileId if set
  let renderableFile = model.files?.find(f => f.isRenderable)
  
  // If defaultFileId is set and exists in the files, use it
  if (defaultFileId) {
    const defaultFile = model.files?.find(f => f.id === defaultFileId.toString() && f.isRenderable)
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
  const modelUrl = ApiClient.getFileUrl(renderableFile.id)

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
        intensity={0.5}
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

export default Scene
