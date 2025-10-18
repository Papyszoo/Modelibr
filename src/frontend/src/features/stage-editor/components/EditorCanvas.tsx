import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import LoadingPlaceholder from '../../../components/LoadingPlaceholder'
import SceneLights from './SceneLights'
import SceneMeshes from './SceneMeshes'
import SceneHelpers from './SceneHelpers'
import { StageConfig } from './SceneEditor'
import './EditorCanvas.css'

interface EditorCanvasProps {
  stageConfig: StageConfig
  selectedObjectId: string | null
  onSelectObject: (id: string | null) => void
}

function EditorCanvas({
  stageConfig,
  selectedObjectId,
  onSelectObject,
}: EditorCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  return (
    <div className="editor-canvas-container">
      <Canvas
        ref={canvasRef}
        shadows
        camera={{ position: [10, 10, 10], fov: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <Suspense fallback={<LoadingPlaceholder />}>
          {/* Grid helper - default one, can be overridden by grid helper */}
          <Grid
            args={[20, 20]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#6b6b6b"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#9d4b4b"
            fadeDistance={50}
            fadeStrength={1}
            followCamera={false}
            infiniteGrid={true}
          />

          {/* Scene helpers (Drei components) */}
          <SceneHelpers helpers={stageConfig.helpers} />

          {/* Stage lights */}
          <SceneLights
            lights={stageConfig.lights}
            selectedId={selectedObjectId}
            onSelectLight={onSelectObject}
          />

          {/* Scene meshes */}
          <SceneMeshes
            meshes={stageConfig.meshes}
            selectedId={selectedObjectId}
            onSelectMesh={onSelectObject}
          />

          {/* Reference sphere for testing - only shown when no meshes */}
          {stageConfig.meshes.length === 0 && (
            <mesh position={[0, 1, 0]} onClick={() => onSelectObject(null)}>
              <sphereGeometry args={[1, 32, 32]} />
              <meshStandardMaterial color="#4a9eff" />
            </mesh>
          )}
        </Suspense>

        {/* Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          maxDistance={50}
          minDistance={0.5}
        />
      </Canvas>
    </div>
  )
}

export default EditorCanvas
