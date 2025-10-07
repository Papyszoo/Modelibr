import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GeometryType } from './GeometrySelector'
import { TexturePackDto } from '../../../types'
import TexturedGeometry from './TexturedGeometry'
import LoadingPlaceholder from '../../LoadingPlaceholder'
import './TexturePreviewPanel.css'

interface TexturePreviewPanelProps {
  geometryType: GeometryType
  texturePack: TexturePackDto
}

function TexturePreviewPanel({
  geometryType,
  texturePack,
}: TexturePreviewPanelProps) {
  const geometryNames = {
    box: 'Cube',
    sphere: 'Sphere',
    cylinder: 'Cylinder',
    torus: 'Torus',
  }

  return (
    <div className="texture-preview-panel">
      <div className="preview-header">
        <h3 className="preview-title">{geometryNames[geometryType]} Preview</h3>
        <div className="preview-info">
          <span className="info-label">Textures Applied:</span>
          <span className="info-value">{texturePack.textureCount}</span>
        </div>
      </div>

      <div className="preview-canvas-container">
        <Canvas
          camera={{ position: [4, 3, 4], fov: 50 }}
          shadows
          className="texture-preview-canvas"
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          dpr={Math.min(window.devicePixelRatio, 2)}
        >
          {/* Lighting setup */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[10, 10, 5]}
            intensity={1.0}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-10, -10, -10]} intensity={0.5} />
          <spotLight
            position={[0, 10, 0]}
            angle={0.3}
            penumbra={1}
            intensity={0.8}
            castShadow
          />

          {/* Textured Geometry */}
          <Suspense fallback={<LoadingPlaceholder />}>
            <TexturedGeometry
              geometryType={geometryType}
              texturePack={texturePack}
            />
          </Suspense>

          {/* Ground plane */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -2, 0]}
            receiveShadow
          >
            <planeGeometry args={[10, 10]} />
            <meshStandardMaterial
              color="#f0f0f0"
              metalness={0.0}
              roughness={0.8}
            />
          </mesh>

          {/* Controls */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            maxDistance={15}
            minDistance={2}
          />
        </Canvas>
      </div>

      <div className="preview-hint">
        <i className="pi pi-info-circle"></i>
        Use mouse to rotate, zoom, and pan the view
      </div>
    </div>
  )
}

export default TexturePreviewPanel
