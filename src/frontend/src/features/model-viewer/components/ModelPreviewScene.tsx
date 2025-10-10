import { JSX, Suspense, useState, useEffect } from 'react'
import { Stage, OrbitControls } from '@react-three/drei'
import Model from './Model'
import LoadingPlaceholder from '../../../components/LoadingPlaceholder'
// eslint-disable-next-line no-restricted-imports
import ApiClient, { EnvironmentDto } from '../../../services/ApiClient'
import { Model as ModelType } from '../../../utils/fileUtils'
import { ViewerSettingsType } from './ViewerSettings'

interface SceneProps {
  model: ModelType
  settings?: ViewerSettingsType
}

function Scene({ model, settings }: SceneProps): JSX.Element {
  const [environment, setEnvironment] = useState<EnvironmentDto | null>(null)

  // Load environment
  useEffect(() => {
    const loadEnvironment = async () => {
      try {
        if (settings?.environmentId) {
          const env = await ApiClient.getEnvironmentById(settings.environmentId)
          setEnvironment(env)
        } else {
          // Load default environment
          const envs = await ApiClient.getEnvironments()
          const defaultEnv = envs.find(e => e.isDefault)
          setEnvironment(defaultEnv || null)
        }
      } catch (error) {
        console.error('Failed to load environment:', error)
      }
    }
    loadEnvironment()
  }, [settings?.environmentId])

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

  // Use environment settings if available, otherwise use defaults
  const orbitSpeed = settings?.orbitSpeed ?? 1
  const zoomSpeed = settings?.zoomSpeed ?? 1
  const panSpeed = settings?.panSpeed ?? 1
  const modelRotationSpeed = settings?.modelRotationSpeed ?? 0.002
  
  // Environment-based settings
  const lightIntensity = environment?.lightIntensity ?? 0.5
  const environmentPreset = environment?.environmentPreset ?? 'city'
  const showShadows = environment?.showShadows ?? settings?.showShadows ?? true
  const shadowType = environment?.shadowType ?? 'contact'
  const shadowOpacity = environment?.shadowOpacity ?? 0.4
  const shadowBlur = environment?.shadowBlur ?? 2

  return (
    <>
      {/* Stage provides automatic lighting, shadows, and environment */}
      <Stage
        key={`stage-${modelUrl}-${environment?.id}`}
        intensity={lightIntensity}
        environment={environmentPreset}
        shadows={
          showShadows ? { type: shadowType as any, opacity: shadowOpacity, blur: shadowBlur } : false
        }
        adjustCamera={environment?.autoAdjustCamera ?? false}
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
    </>
  )
}

export default Scene
