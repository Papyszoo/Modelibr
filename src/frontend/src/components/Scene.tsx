import { JSX, Suspense } from 'react'
import { Stage, OrbitControls } from '@react-three/drei'
import Model from './Model'
import LoadingPlaceholder from './LoadingPlaceholder'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../services/ApiClient'
import { Model as ModelType } from '../utils/fileUtils'
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
  const cameraDistance = settings?.cameraDistance ?? 2.5
  const orbitSpeed = settings?.orbitSpeed ?? 1
  const zoomSpeed = settings?.zoomSpeed ?? 1
  const panSpeed = settings?.panSpeed ?? 1
  const lockCamera = settings?.lockCamera ?? false

  return (
    <>
      {/* Stage provides automatic lighting, shadows, and camera positioning */}
      <Stage
        key={lockCamera ? 'locked' : 'unlocked'}
        intensity={0.5}
        environment="city"
        shadows={{ type: 'accumulative', bias: -0.001 }}
        adjustCamera={lockCamera ? false : cameraDistance}
      >
        <Suspense fallback={<LoadingPlaceholder />}>
          <Model modelUrl={modelUrl} fileExtension={fileExtension} />
        </Suspense>
      </Stage>

      {/* Orbit controls for interaction */}
      <OrbitControls
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
