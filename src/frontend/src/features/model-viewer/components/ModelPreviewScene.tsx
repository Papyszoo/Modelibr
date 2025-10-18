import { JSX, Suspense } from 'react'
import { Stage, OrbitControls, Stats } from '@react-three/drei'
import Model from './Model'
import LoadingPlaceholder from '../../../components/LoadingPlaceholder'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import { Model as ModelType } from '../../../utils/fileUtils'
import { ViewerSettingsType } from './ViewerSettings'

interface SceneProps {
  model: ModelType
  settings?: ViewerSettingsType
}

function Scene({ model, settings }: SceneProps): JSX.Element {
  // Find the first renderable file
  const renderableFile =
    model.files?.find(f => f.isRenderable) || model.files?.[0]

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
          <Model
            key={modelUrl}
            modelUrl={modelUrl}
            fileExtension={fileExtension}
            rotationSpeed={modelRotationSpeed}
          />
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

      {/* FPS counter in bottom-left corner */}
      <Stats showPanel={0} className="stats-fps" />
    </>
  )
}

export default Scene
