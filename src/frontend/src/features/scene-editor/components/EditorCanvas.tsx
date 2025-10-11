import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import LoadingPlaceholder from '../../../components/LoadingPlaceholder'
import SceneLights from './SceneLights'
import { SceneConfig } from './SceneEditor'
import './EditorCanvas.css'

interface EditorCanvasProps {
  sceneConfig: SceneConfig
  selectedObjectId: string | null
  onSelectObject: (id: string | null) => void
}

function EditorCanvas({
  sceneConfig,
  selectedObjectId,
  onSelectObject
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
          powerPreference: 'high-performance'
        }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <Suspense fallback={<LoadingPlaceholder />}>
          {/* Grid helper */}
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

          {/* Scene lights */}
          <SceneLights
            lights={sceneConfig.lights}
            selectedId={selectedObjectId}
            onSelectLight={onSelectObject}
          />

          {/* Reference sphere */}
          <mesh position={[0, 1, 0]} onClick={() => onSelectObject(null)}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshStandardMaterial color="#4a9eff" />
          </mesh>
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
