import { JSX, Suspense } from 'react'
import { Stage, OrbitControls } from '@react-three/drei'
import Model from './Model'
import LoadingPlaceholder from './LoadingPlaceholder'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../services/ApiClient'
import { Model as ModelType } from '../utils/fileUtils'

interface SceneProps {
  model: ModelType
}

function Scene({ model }: SceneProps): JSX.Element {
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

  return (
    <>
      {/* Stage provides automatic lighting, shadows, and camera positioning */}
      <Stage
        intensity={0.5}
        environment="city"
        shadows={{ type: 'accumulative', bias: -0.001 }}
        adjustCamera={1.2}
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
        maxDistance={10}
        minDistance={0.5}
      />
    </>
  )
}

export default Scene
